import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import LoadingScreen from "../src/components/LoadingScreen";
import OrganiserWaypointMap from "../src/components/OrganiserWaypointMap";
import type { WaypointMapPoint } from "../src/components/OrganiserWaypointMap";
import {
  getOrganiserSession,
  loadOrganiserDashboard,
  OrganiserDashboard,
  OrganiserEvent,
  OrganiserWaypoint,
  saveOrganiserEvent,
  saveOrganiserProfile,
  saveOrganiserWaypoint,
  signInOrganiser,
  signOutOrganiser,
  signUpOrganiser,
} from "../src/lib/organiser";

type FeatherName = keyof typeof Feather.glyphMap;

type AuthMode = "sign-in" | "sign-up";

type EventFormState = {
  id: string | null;
  name: string;
};

type WaypointFormState = {
  id: string | null;
  eventId: string;
  slotIndex: number;
  latitude: string;
  longitude: string;
  radiusMeters: string;
};

const waypointSlotIndexes = [0, 1, 2, 3, 4];

const emptyEventForm: EventFormState = {
  id: null,
  name: "",
};

export default function OrganiserScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 920;

  const [dashboard, setDashboard] = useState<OrganiserDashboard | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(emptyEventForm);
  const [waypointForm, setWaypointForm] = useState<WaypointFormState>(() =>
    createEmptyWaypointForm("")
  );
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [needsProfile, setNeedsProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingWaypoint, setSavingWaypoint] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const authState = await getOrganiserSession();

        if (!isMounted) {
          return;
        }

        setEmail(authState.session?.user.email ?? "");

        if (!authState.session) {
          setDashboard(null);
          setNeedsProfile(false);
          return;
        }

        if (!authState.profile) {
          setDashboard(null);
          setNeedsProfile(true);
          return;
        }

        setDisplayName(authState.profile.displayName);
        const nextDashboard = await loadOrganiserDashboard();

        if (!isMounted) {
          return;
        }

        const nextSelectedId = nextDashboard.events[0]?.id ?? null;
        const nextSelectedEvent =
          nextDashboard.events.find((event) => event.id === nextSelectedId) ?? null;

        setDashboard(nextDashboard);
        setNeedsProfile(false);
        setDisplayName(nextDashboard.profile.displayName);
        setSelectedEventId(nextSelectedId);
        setEventForm(nextSelectedEvent ? eventToForm(nextSelectedEvent) : emptyEventForm);
        setWaypointForm(createWaypointFormForSlot(nextDashboard.waypoints, nextSelectedId, 0));
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error, "Unable to load organiser session."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedEvent = useMemo(
    () => dashboard?.events.find((event) => event.id === selectedEventId) ?? null,
    [dashboard, selectedEventId]
  );

  const selectedWaypoints = useMemo(() => {
    if (!dashboard || !selectedEvent) {
      return [];
    }

    return dashboard.waypoints
      .filter((waypoint) => waypoint.eventId === selectedEvent.id)
      .sort((first, second) => first.sortOrder - second.sortOrder);
  }, [dashboard, selectedEvent]);

  const editableSelectedWaypoints = useMemo(
    () => selectedWaypoints.filter(hasUsableWaypointCoordinates),
    [selectedWaypoints]
  );

  const selectedWaypointSlots = useMemo(
    () =>
      waypointSlotIndexes.map((slotIndex) => ({
        slotIndex,
        waypoint:
          editableSelectedWaypoints.find((waypoint) => waypoint.sortOrder === slotIndex) ?? null,
      })),
    [editableSelectedWaypoints]
  );

  const currentWaypointPoint = useMemo(
    () => parseWaypointPoint(waypointForm.latitude, waypointForm.longitude),
    [waypointForm.latitude, waypointForm.longitude]
  );

  const currentRadiusMeters = useMemo(
    () => parsePositiveIntegerOrDefault(waypointForm.radiusMeters, 20),
    [waypointForm.radiusMeters]
  );

  const mapWaypoints = useMemo(
    () =>
      editableSelectedWaypoints.map((waypoint) =>
        waypoint.sortOrder === waypointForm.slotIndex && currentWaypointPoint
          ? {
              ...waypoint,
              latitude: currentWaypointPoint.latitude,
              longitude: currentWaypointPoint.longitude,
              radiusMeters: currentRadiusMeters,
            }
          : waypoint
      ),
    [currentRadiusMeters, currentWaypointPoint, editableSelectedWaypoints, waypointForm.slotIndex]
  );

  async function refreshDashboard(
    showSpinner: boolean,
    preferredEventId?: string,
    preferredSlotIndex = waypointForm.slotIndex
  ) {
    if (showSpinner) {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const nextDashboard = await loadOrganiserDashboard();
      const nextSelectedId =
        preferredEventId ?? selectedEventId ?? nextDashboard.events[0]?.id ?? null;
      const nextSelectedEvent =
        nextDashboard.events.find((event) => event.id === nextSelectedId) ?? null;

      setDashboard(nextDashboard);
      setNeedsProfile(false);
      setDisplayName(nextDashboard.profile.displayName);
      setSelectedEventId(nextSelectedId);
      setEventForm(nextSelectedEvent ? eventToForm(nextSelectedEvent) : emptyEventForm);
      setWaypointForm(
        createWaypointFormForSlot(
          nextDashboard.waypoints,
          nextSelectedId,
          preferredSlotIndex
        )
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load organiser dashboard."));
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthSubmit() {
    setAuthSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const authState =
        authMode === "sign-up"
          ? await signUpOrganiser(email, password)
          : await signInOrganiser(email, password);

      if (!authState.profile) {
        setNeedsProfile(true);
        setDashboard(null);
        setMessage("Add your organiser name to finish setting up this account.");
        return;
      }

      setDisplayName(authState.profile.displayName);
      setPassword("");
      await refreshDashboard(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to continue."));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSaveProfile() {
    setAuthSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const profile = await saveOrganiserProfile(displayName);
      setDisplayName(profile.displayName);
      setPassword("");
      await refreshDashboard(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to save organiser profile."));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage(null);
    setMessage(null);

    try {
      await signOutOrganiser();
      setDashboard(null);
      setSelectedEventId(null);
      setEventForm(emptyEventForm);
      setWaypointForm(createEmptyWaypointForm(""));
      setNeedsProfile(false);
      setPassword("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to sign out."));
    }
  }

  async function handleSaveEvent() {
    setSavingEvent(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const saved = await saveOrganiserEvent({
        id: eventForm.id,
        name: eventForm.name,
      });

      setMessage(`Saved ${saved.name}. Share code ${saved.eventCode} with players.`);
      await refreshDashboard(false, saved.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to save event."));
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleSaveWaypoint() {
    if (!selectedEvent) {
      return;
    }

    setSavingWaypoint(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const latitude = parseNumber(waypointForm.latitude, "Latitude");
      const longitude = parseNumber(waypointForm.longitude, "Longitude");

      if (latitude === 0 && longitude === 0) {
        throw new Error("Choose a waypoint location before saving.");
      }

      const saved = await saveOrganiserWaypoint({
        id: waypointForm.id,
        eventId: selectedEvent.id,
        slotIndex: waypointForm.slotIndex,
        latitude,
        longitude,
        radiusMeters: parseInteger(waypointForm.radiusMeters, "Radius"),
      });

      setMessage(`Saved waypoint ${saved.sortOrder + 1}.`);
      await refreshDashboard(false, selectedEvent.id, saved.sortOrder);
      setWaypointForm(waypointToForm(saved));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to save waypoint."));
    } finally {
      setSavingWaypoint(false);
    }
  }

  function selectEvent(event: OrganiserEvent) {
    setSelectedEventId(event.id);
    setEventForm(eventToForm(event));
    setWaypointForm(createWaypointFormForSlot(dashboard?.waypoints ?? [], event.id, 0));
    setMessage(null);
    setErrorMessage(null);
  }

  function startNewEvent() {
    setSelectedEventId(null);
    setEventForm(emptyEventForm);
    setWaypointForm(createEmptyWaypointForm(""));
    setMessage(null);
    setErrorMessage(null);
  }

  function selectWaypointSlot(slotIndex: number, waypoint: OrganiserWaypoint | null) {
    setWaypointForm(
      waypoint ? waypointToForm(waypoint) : createEmptyWaypointForm(selectedEventId ?? "", slotIndex)
    );
    setMessage(null);
    setErrorMessage(null);
  }

  function handleWaypointMapPick(point: WaypointMapPoint) {
    setWaypointForm((current) => ({
      ...current,
      latitude: formatCoordinate(point.latitude),
      longitude: formatCoordinate(point.longitude),
    }));
    setMessage(null);
    setErrorMessage(null);
  }

  if (Platform.OS !== "web") {
    return (
      <View style={styles.centered}>
        <Text style={styles.blockedTitle}>Organiser is available on web</Text>
        <Text style={styles.blockedText}>
          Open this project in a browser and visit /organiser.
        </Text>
      </View>
    );
  }

  if (loading) {
    return <LoadingScreen accessibilityLabel="Loading organiser portal" />;
  }

  if (!dashboard) {
    return (
      <View style={styles.loginShell}>
        <View style={styles.loginPanel}>
          <View style={styles.loginHeader}>
            <Text style={styles.kicker}>Poker Trail Organiser</Text>
            <Text style={styles.loginTitle}>
              {needsProfile ? "Finish setup" : "Manage your events"}
            </Text>
          </View>

          {!needsProfile ? (
            <View style={styles.authTabs}>
              <SegmentButton
                active={authMode === "sign-in"}
                label="Sign in"
                onPress={() => {
                  setAuthMode("sign-in");
                  setMessage(null);
                  setErrorMessage(null);
                }}
              />
              <SegmentButton
                active={authMode === "sign-up"}
                label="Sign up"
                onPress={() => {
                  setAuthMode("sign-up");
                  setMessage(null);
                  setErrorMessage(null);
                }}
              />
            </View>
          ) : null}

          {needsProfile ? (
            <Field label="Organiser name">
              <TextInput
                autoCapitalize="words"
                editable={!authSubmitting}
                onChangeText={setDisplayName}
                placeholder="Moreton Bay Poker Trail"
                placeholderTextColor="#77808c"
                style={styles.input}
                value={displayName}
              />
            </Field>
          ) : null}

          {!needsProfile ? (
            <>
              <Field label="Email">
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!authSubmitting}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="organiser@example.com"
                  placeholderTextColor="#77808c"
                  style={styles.input}
                  value={email}
                />
              </Field>

              <Field label="Password">
                <TextInput
                  autoCapitalize="none"
                  autoComplete="password"
                  editable={!authSubmitting}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#77808c"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </Field>
            </>
          ) : null}

          {message ? <Text style={styles.successText}>{message}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.loginActions}>
            {needsProfile ? (
              <>
                <ActionButton
                  disabled={authSubmitting}
                  icon="save"
                  label={authSubmitting ? "Saving..." : "Save profile"}
                  onPress={() => {
                    void handleSaveProfile();
                  }}
                  variant="primary"
                />
                <ActionButton
                  disabled={authSubmitting}
                  icon="log-out"
                  label="Sign out"
                  onPress={() => {
                    void handleSignOut();
                  }}
                  variant="ghost"
                />
              </>
            ) : (
              <ActionButton
                disabled={authSubmitting}
                icon={authMode === "sign-up" ? "user-plus" : "log-in"}
                label={
                  authSubmitting
                    ? authMode === "sign-up"
                      ? "Creating..."
                      : "Signing in..."
                    : authMode === "sign-up"
                      ? "Create account"
                      : "Sign in"
                }
                onPress={() => {
                  void handleAuthSubmit();
                }}
                variant="primary"
              />
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>Poker Trail Organiser</Text>
          <Text style={styles.title}>Events</Text>
        </View>
        <View style={styles.topActions}>
          <Text style={styles.profileName}>{dashboard.profile.displayName}</Text>
          <ActionButton
            icon="refresh-cw"
            label="Refresh"
            onPress={() => {
              void refreshDashboard(true);
            }}
            variant="secondary"
          />
          <ActionButton
            icon="log-out"
            label="Sign out"
            onPress={() => {
              void handleSignOut();
            }}
            variant="ghost"
          />
        </View>
      </View>

      {message ? <Text style={styles.successText}>{message}</Text> : null}
      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      <View style={[styles.workspace, isNarrow ? styles.workspaceNarrow : null]}>
        <View style={[styles.eventRail, isNarrow ? styles.eventRailNarrow : null]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Events</Text>
            <IconButton
              accessibilityLabel="New event"
              icon="plus"
              onPress={startNewEvent}
            />
          </View>

          <ScrollView contentContainerStyle={styles.eventList}>
            {dashboard.events.length === 0 ? (
              <Text style={styles.emptyText}>Create your first event.</Text>
            ) : (
              dashboard.events.map((event) => {
                const summary = dashboard.summaries[event.id];
                const isSelected = event.id === selectedEventId;

                return (
                  <Pressable
                    key={event.id}
                    onPress={() => {
                      selectEvent(event);
                    }}
                    style={[styles.eventCard, isSelected ? styles.eventCardSelected : null]}
                  >
                    <View style={styles.eventCardTop}>
                      <Text style={styles.eventName}>{event.name}</Text>
                      <StatusBadge status={event.status} />
                    </View>
                    <Text style={styles.eventCodeText}>Code {event.eventCode}</Text>
                    <View style={styles.metricRow}>
                      <Metric label="Stops" value={summary?.waypointCount ?? 0} />
                      <Metric label="Players" value={summary?.playerCount ?? 0} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.detailScroll} style={styles.detailPane}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleGroup}>
                <Text style={styles.sectionTitle}>
                  {eventForm.id ? "Event Details" : "New Event"}
                </Text>
                {selectedEvent ? <StatusBadge status={selectedEvent.status} /> : null}
              </View>
              <ActionButton
                disabled={savingEvent}
                icon="save"
                label={savingEvent ? "Saving..." : "Save event"}
                onPress={() => {
                  void handleSaveEvent();
                }}
                variant="primary"
              />
            </View>

            <Field label="Name">
              <TextInput
                editable={!savingEvent}
                onChangeText={(value) => {
                  setEventForm((current) => ({ ...current, name: value }));
                }}
                placeholder="Summer Poker Trail"
                placeholderTextColor="#77808c"
                style={styles.input}
                value={eventForm.name}
              />
            </Field>

            {selectedEvent ? (
              <Field label="Event code">
                <View style={styles.readOnlyCode}>
                  <Feather name="hash" size={18} color="#0f766e" />
                  <Text selectable style={styles.readOnlyCodeText}>
                    {selectedEvent.eventCode}
                  </Text>
                </View>
              </Field>
            ) : null}
          </View>

          {selectedEvent ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Waypoints</Text>
              </View>

              <View style={styles.waypointEditor}>
                <OrganiserWaypointMap
                  currentPoint={currentWaypointPoint}
                  onPick={handleWaypointMapPick}
                  radiusMeters={currentRadiusMeters}
                  selectedSlotIndex={waypointForm.slotIndex}
                  waypoints={mapWaypoints}
                />

                <View style={styles.waypointTabs}>
                  {selectedWaypointSlots.map(({ slotIndex, waypoint }) => (
                    <Pressable
                      key={slotIndex}
                      onPress={() => {
                        selectWaypointSlot(slotIndex, waypoint);
                      }}
                      style={[
                        styles.waypointTab,
                        slotIndex === waypointForm.slotIndex ? styles.waypointTabSelected : null,
                      ]}
                    >
                      <Feather
                        name="map-pin"
                        size={15}
                        color={slotIndex === waypointForm.slotIndex ? "#0f766e" : "#6b7280"}
                      />
                      <Text
                        style={[
                          styles.waypointTabText,
                          slotIndex === waypointForm.slotIndex
                            ? styles.waypointTabTextSelected
                            : null,
                        ]}
                      >
                        {slotIndex + 1}
                      </Text>
                      <Text style={styles.waypointTabMeta}>
                        {waypoint ? "Set" : "Not set"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.waypointForm}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.subsectionTitle}>
                      Waypoint {waypointForm.slotIndex + 1}
                    </Text>
                    <ActionButton
                      disabled={savingWaypoint}
                      icon="save"
                      label={savingWaypoint ? "Saving..." : "Save"}
                      onPress={() => {
                        void handleSaveWaypoint();
                      }}
                      variant="primary"
                    />
                  </View>

                  <View style={[styles.formGrid, isNarrow ? styles.formGridNarrow : null]}>
                    <Field label="Latitude">
                      <TextInput
                        editable={!savingWaypoint}
                        inputMode="decimal"
                        onChangeText={(value) => {
                          setWaypointForm((current) => ({ ...current, latitude: value }));
                        }}
                        placeholder="-27.46977"
                        placeholderTextColor="#77808c"
                        style={styles.input}
                        value={waypointForm.latitude}
                      />
                    </Field>
                    <Field label="Longitude">
                      <TextInput
                        editable={!savingWaypoint}
                        inputMode="decimal"
                        onChangeText={(value) => {
                          setWaypointForm((current) => ({ ...current, longitude: value }));
                        }}
                        placeholder="153.02512"
                        placeholderTextColor="#77808c"
                        style={styles.input}
                        value={waypointForm.longitude}
                      />
                    </Field>
                  </View>

                  <Field label="Radius meters">
                    <TextInput
                      editable={!savingWaypoint}
                      inputMode="numeric"
                      onChangeText={(value) => {
                        setWaypointForm((current) => ({ ...current, radiusMeters: value }));
                      }}
                      placeholder="20"
                      placeholderTextColor="#77808c"
                      style={styles.input}
                      value={waypointForm.radiusMeters}
                    />
                  </Field>
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  variant,
}: {
  disabled?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
  variant: "primary" | "secondary" | "ghost";
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        variant === "primary" ? styles.actionButtonPrimary : null,
        variant === "secondary" ? styles.actionButtonSecondary : null,
        variant === "ghost" ? styles.actionButtonGhost : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Feather
        name={icon}
        size={16}
        color={variant === "primary" ? "#ffffff" : "#1f2937"}
      />
      <Text
        style={[
          styles.actionButtonText,
          variant === "primary" ? styles.actionButtonPrimaryText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function IconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: FeatherName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.iconButton}
    >
      <Feather name={icon} size={18} color="#111827" />
    </Pressable>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentButton, active ? styles.segmentButtonActive : null]}
    >
      <Text style={[styles.segmentButtonText, active ? styles.segmentButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: OrganiserEvent["status"] }) {
  const isActive = status === "active";

  return (
    <View style={[styles.statusBadge, isActive ? styles.statusBadgeActive : styles.statusBadgeClosed]}>
      <Text style={[styles.statusBadgeText, isActive ? styles.statusBadgeTextActive : null]}>
        {isActive ? "Active" : "Closed"}
      </Text>
    </View>
  );
}

function eventToForm(event: OrganiserEvent): EventFormState {
  return {
    id: event.id,
    name: event.name,
  };
}

function waypointToForm(waypoint: OrganiserWaypoint): WaypointFormState {
  return {
    id: waypoint.id,
    eventId: waypoint.eventId,
    slotIndex: waypoint.sortOrder,
    latitude: String(waypoint.latitude),
    longitude: String(waypoint.longitude),
    radiusMeters: String(waypoint.radiusMeters),
  };
}

function createWaypointFormForSlot(
  waypoints: OrganiserWaypoint[],
  eventId: string | null,
  slotIndex: number
): WaypointFormState {
  if (!eventId) {
    return createEmptyWaypointForm("", slotIndex);
  }

  const waypoint =
    waypoints.find(
      (candidate) =>
        candidate.eventId === eventId &&
        candidate.sortOrder === slotIndex &&
        hasUsableWaypointCoordinates(candidate)
    ) ?? null;

  return waypoint ? waypointToForm(waypoint) : createEmptyWaypointForm(eventId, slotIndex);
}

function hasUsableWaypointCoordinates(waypoint: OrganiserWaypoint) {
  return !(waypoint.latitude === 0 && waypoint.longitude === 0);
}

function createEmptyWaypointForm(eventId: string, slotIndex = 0): WaypointFormState {
  return {
    id: null,
    eventId,
    slotIndex,
    latitude: "",
    longitude: "",
    radiusMeters: "20",
  };
}

function parseNumber(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }

  return parsed;
}

function parseInteger(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsed;
}

function parseWaypointPoint(latitude: string, longitude: string): WaypointMapPoint | null {
  if (!latitude.trim() || !longitude.trim()) {
    return null;
  }

  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    return null;
  }

  if (parsedLatitude === 0 && parsedLongitude === 0) {
    return null;
  }

  return {
    latitude: parsedLatitude,
    longitude: parsedLongitude,
  };
}

function parsePositiveIntegerOrDefault(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatCoordinate(value: number) {
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#f4f2ee",
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    marginBottom: 12,
  },
  topActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
  },
  kicker: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 2,
  },
  profileName: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "800",
  },
  workspace: {
    flex: 1,
    flexDirection: "row",
    gap: 18,
    minHeight: 0,
  },
  workspaceNarrow: {
    flexDirection: "column",
  },
  eventRail: {
    backgroundColor: "#ffffff",
    borderColor: "#ded8ce",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 340,
    minWidth: 300,
    padding: 14,
  },
  eventRailNarrow: {
    flexBasis: 280,
    minWidth: "100%",
  },
  eventList: {
    gap: 10,
    paddingTop: 12,
  },
  eventCard: {
    backgroundColor: "#faf9f7",
    borderColor: "#e6e1d8",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  eventCardSelected: {
    backgroundColor: "#eef8f5",
    borderColor: "#0f766e",
  },
  eventCardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  eventName: {
    color: "#111827",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  eventCodeText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8,
  },
  detailPane: {
    flex: 1,
  },
  detailScroll: {
    gap: 18,
    paddingBottom: 28,
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#ded8ce",
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitleGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  subsectionTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  formGrid: {
    flexDirection: "row",
    gap: 14,
  },
  formGridNarrow: {
    flexDirection: "column",
    gap: 0,
  },
  field: {
    flex: 1,
    marginBottom: 14,
  },
  label: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#c9c2b8",
    borderRadius: 6,
    borderWidth: 1,
    color: "#111827",
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  readOnlyCode: {
    alignItems: "center",
    backgroundColor: "#eef8f5",
    borderColor: "#0f766e",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-start",
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  readOnlyCodeText: {
    color: "#0f766e",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  metric: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
  },
  metricLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  waypointLayout: {
    flexDirection: "row",
    gap: 16,
  },
  waypointLayoutNarrow: {
    flexDirection: "column",
  },
  waypointList: {
    flex: 1,
    gap: 8,
    minWidth: 280,
  },
  waypointRow: {
    alignItems: "center",
    backgroundColor: "#faf9f7",
    borderColor: "#e6e1d8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  waypointRowSelected: {
    backgroundColor: "#eef8f5",
    borderColor: "#0f766e",
  },
  waypointRowText: {
    flex: 1,
    minWidth: 0,
  },
  waypointName: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
  waypointMeta: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  waypointTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  waypointTab: {
    alignItems: "center",
    backgroundColor: "#faf9f7",
    borderColor: "#e6e1d8",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 108,
    flexDirection: "row",
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  waypointTabSelected: {
    backgroundColor: "#eef8f5",
    borderColor: "#0f766e",
  },
  waypointTabText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "900",
  },
  waypointTabTextSelected: {
    color: "#0f766e",
  },
  waypointTabMeta: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: "auto",
  },
  waypointEditor: {
    gap: 14,
  },
  waypointForm: {
    minWidth: 0,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  actionButtonPrimary: {
    backgroundColor: "#0f766e",
  },
  actionButtonSecondary: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
  },
  actionButtonGhost: {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    borderWidth: 1,
  },
  actionButtonText: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "800",
  },
  actionButtonPrimaryText: {
    color: "#ffffff",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderRadius: 6,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  disabled: {
    opacity: 0.62,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeActive: {
    backgroundColor: "#ccfbf1",
    borderColor: "#0f766e",
  },
  statusBadgeClosed: {
    backgroundColor: "#f3f4f6",
    borderColor: "#9ca3af",
  },
  statusBadgeText: {
    color: "#4b5563",
    fontSize: 11,
    fontWeight: "900",
  },
  statusBadgeTextActive: {
    color: "#0f766e",
  },
  authTabs: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    marginBottom: 18,
    padding: 4,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    borderWidth: 1,
  },
  segmentButtonText: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "800",
  },
  segmentButtonTextActive: {
    color: "#111827",
  },
  successText: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderRadius: 6,
    borderWidth: 1,
    color: "#166534",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    padding: 10,
  },
  errorBanner: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
    borderRadius: 6,
    borderWidth: 1,
    color: "#991b1b",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    padding: 10,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
  },
  centered: {
    alignItems: "center",
    backgroundColor: "#f4f2ee",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  blockedTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
  },
  blockedText: {
    color: "#4b5563",
    fontSize: 15,
    marginTop: 8,
  },
  loginShell: {
    alignItems: "center",
    backgroundColor: "#f4f2ee",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  loginPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#ded8ce",
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 460,
    padding: 22,
    width: "100%",
  },
  loginHeader: {
    marginBottom: 18,
  },
  loginTitle: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  loginActions: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
});

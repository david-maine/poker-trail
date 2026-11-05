import { APP_BACKGROUND_COLOR, TRAIL_WHITE } from "../../src/lib/theme";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import MapDisplay from "../../components/MapDisplay";
import CardRow from "../../src/components/CardRow";
import LeaveEventButton from "../../src/components/LeaveEventButton";
import LoadingScreen from "../../src/components/LoadingScreen";
import useResponsiveLayout from "../../src/hooks/useResponsiveLayout";
import useLocation from "../../src/hooks/useLocation";
import { useEventSession } from "../../src/lib/eventSession";
import { GameEvent, loadGameBootstrapForEvent } from "../../src/lib/game";
import { addLocalCardClaim } from "../../src/lib/localHand";
import HandSyncStatus from "../../src/components/HandSyncStatus";
import { addConnectivityListener } from "../../src/lib/connectivity";
import { getDistanceMeters } from "../../src/lib/utils";
import { Waypoint } from "../../src/types";

export default function Index() {
  const layout = useResponsiveLayout(false);
  const { location, heading, errorMsg, retryLocation } = useLocation();
  const { registrationState, hand } = useEventSession();

  const [event, setEvent] = useState<GameEvent | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);

  const inFlightClaimIdsRef = useRef(new Set<string>());
  const claimCooldownUntilRef = useRef(new Map<string, number>());
  const bootstrapRequest = useRef(0);
  const loadGame = useCallback(async (showSpinner: boolean) => {
    const request = ++bootstrapRequest.current;
    if (showSpinner) {
      setIsLoadingGame(true);
    }

    setScreenError(null);

    try {
      const sessionEvent = registrationState.event;

      if (!sessionEvent) {
        setEvent(null);
        setWaypoints([]);
        return;
      }

      const bootstrap = await loadGameBootstrapForEvent(sessionEvent);

      if (request !== bootstrapRequest.current) return;
      setEvent(bootstrap.event);
      setWaypoints(bootstrap.waypoints);
    } catch (error) {
      if (request === bootstrapRequest.current && showSpinner) setScreenError(getErrorMessage(error, "Unable to load the event."));
    } finally {
      if (request === bootstrapRequest.current) setIsLoadingGame(false);
    }
  }, [registrationState.event]);

  useEffect(() => { void loadGame(true); }, [loadGame]);
  useFocusEffect(useCallback(() => {
    const refresh = () => { void loadGame(false); };
    const interval = setInterval(refresh, 10000);
    const disconnect = addConnectivityListener(online => { if (online) refresh(); });
    const appState = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    refresh();
    return () => { clearInterval(interval); disconnect(); appState.remove(); };
  }, [loadGame]));
  const rejectedClaims = hand?.rejectedWaypointIds?.join(",") ?? "";
  useEffect(() => { if (rejectedClaims) void loadGame(false); }, [rejectedClaims, loadGame]);

  const visitOrder = useMemo(
    () => hand?.claims.map((claim) => claim.waypointId) ?? [],
    [hand]
  );

  const visited = useMemo(() => {
    const nextVisited: Record<string, boolean> = {};
    for (const waypoint of waypoints) {
      nextVisited[waypoint.id] = false;
    }

    for (const waypointId of visitOrder) {
      nextVisited[waypointId] = true;
    }

    return nextVisited;
  }, [visitOrder, waypoints]);

  const waypointCards = useMemo(() => {
    const nextCards: Record<string, string | null> = {};
    for (const waypoint of waypoints) {
      nextCards[waypoint.id] = null;
    }

    for (const claim of hand?.claims ?? []) {
      nextCards[claim.waypointId] = claim.card;
    }

    return nextCards;
  }, [hand, waypoints]);

  const isSubmitted = hand?.status === "submitted";

  useEffect(() => {
    if (errorMsg || !location || !event || !hand || event.id !== hand.eventId || waypoints.length === 0 || isSubmitted ||
        (location.coords.accuracy !== null && (location.coords.accuracy < 0 || location.coords.accuracy > 65))) {
      return;
    }

    if (inFlightClaimIdsRef.current.size > 0) {
      return;
    }

    const nextWaypoint = waypoints.find((waypoint) => {
      if (visited[waypoint.id] && !hand.rejectedWaypointIds?.includes(waypoint.id)) {
        return false;
      }

      if (inFlightClaimIdsRef.current.has(waypoint.id)) {
        return false;
      }

      const cooldownUntil = claimCooldownUntilRef.current.get(waypoint.id) ?? 0;
      if (cooldownUntil > Date.now()) {
        return false;
      }

      const distanceMeters = getDistanceMeters(
        location.coords.latitude,
        location.coords.longitude,
        waypoint.latitude,
        waypoint.longitude
      );

      return distanceMeters <= (waypoint.radiusMeters ?? 20);
    });

    if (!nextWaypoint) {
      return;
    }

    void handleWaypointCollection(nextWaypoint);
    // `handleWaypointCollection` uses current refs/state and is guarded by in-flight waypoint ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, hand, isSubmitted, location, visited, waypoints, errorMsg]);

  async function handleWaypointCollection(waypoint: Waypoint) {
    if (!event || !location || inFlightClaimIdsRef.current.has(waypoint.id)) {
      return;
    }

    inFlightClaimIdsRef.current.add(waypoint.id);
    setScreenError(null);

    try {
      await addLocalCardClaim({
        eventId: event.id,
        waypointId: waypoint.id,
        claimedLat: location.coords.latitude,
        claimedLng: location.coords.longitude,
        gpsAccuracyMeters: location.coords.accuracy ?? null,
      });

      claimCooldownUntilRef.current.delete(waypoint.id);
    } catch (error) {
      const message = getErrorMessage(error, `Unable to collect ${waypoint.name}.`);
      setScreenError(message);
      claimCooldownUntilRef.current.set(waypoint.id, Date.now() + 5000);
    } finally {
      inFlightClaimIdsRef.current.delete(waypoint.id);
    }
  }

  if (isLoadingGame || !hand) {
    return (
      <LoadingScreen
        accessibilityLabel={isLoadingGame ? "Loading event" : "Loading your hand"}
      />
    );
  }

  if (!event || waypoints.length === 0 || !hand) {
    return (
      <View onLayout={layout.onLayout} style={styles.container}>
        <LeaveEventButton style={[styles.leaveButton, { top: layout.controlTop, right: layout.right, width: layout.controlSize, height: layout.controlSize, borderRadius: layout.controlSize / 2 }]} />
        <Text style={styles.errorText}>
          {screenError ?? "No active event is configured in Supabase yet."}
        </Text>
        <Pressable
          onPress={() => {
            void loadGame(false);
          }}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View onLayout={layout.onLayout} style={styles.container}>
      <LeaveEventButton style={[styles.leaveButton, { top: layout.controlTop, right: layout.right, width: layout.controlSize, height: layout.controlSize, borderRadius: layout.controlSize / 2 }]} />
      {screenError ? <Text accessibilityRole="alert" style={styles.errorText}>{screenError}</Text> : null}
      <View style={styles.map}>
        <MapDisplay
          controls={layout.control}
          waypoints={waypoints}
          visited={visited}
          userLocation={location ? {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: heading ?? location.coords.heading,
          } : null}
        />
        {!location || errorMsg ? (
          <ScrollView style={[styles.locationBanner, { top: layout.controlTop + layout.controlSize + 12, left: layout.left, right: layout.right }]} contentContainerStyle={styles.locationBannerContent}>
            <Text accessibilityLiveRegion="polite" style={styles.locationText}>
              {errorMsg ?? "Getting your location… Allow location access when prompted."}
            </Text>
            <Pressable accessibilityRole="button" onPress={retryLocation} style={styles.locationRetry}>
              <Text style={styles.locationText}>Retry location</Text>
            </Pressable>
          </ScrollView>
        ) : null}
        <View pointerEvents="box-none" style={[styles.syncOverlay, { bottom: layout.gap, left: layout.left, right: layout.right }]}>
          <HandSyncStatus fontSize={layout.detailSize} />
        </View>
      </View>
        <ScrollView style={[styles.bottomPanel, { maxHeight: layout.handPanelHeight }]} contentContainerStyle={[styles.handContent, { paddingLeft: layout.left, paddingRight: layout.right, paddingVertical: layout.gap * 1.5, gap: layout.gap / 2 }]} >

          <View style={[styles.cardsArea, { padding: layout.gap * 1.5 }]}>
            <CardRow
              visitOrder={visitOrder}
              waypointCards={waypointCards}
              total={waypoints.length}
              maxCardHeight={layout.cardHeight}
              gap={layout.cardGap}
            />
          </View>

        </ScrollView>
    </View>
  );
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
  container: {
    flex: 1,
    backgroundColor: APP_BACKGROUND_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  map: {
    width: "100%",
    flex: 1,
    position: "relative",
    minHeight: 0,
  },
  syncOverlay: { position: "absolute", zIndex: 4, alignItems: "center" },
  leaveButton: {
    position: "absolute",
    right: 16,
    top: 56,
    zIndex: 5,
  },
  bottomPanel: {
    backgroundColor: APP_BACKGROUND_COLOR, width: "100%", flexGrow: 0, flexShrink: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  handContent: {
    width: "100%", maxWidth: 720, alignSelf: "center",
    alignItems: "center", justifyContent: "center",
  },
  cardsArea: {
    width: "100%",
    borderWidth: 3, borderColor: TRAIL_WHITE, borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 0,
  },
  locationBanner: {
    position: "absolute", maxHeight: "65%", backgroundColor: APP_BACKGROUND_COLOR,
    borderColor: "#ffffff", borderWidth: 1, borderRadius: 6, zIndex: 2,
  },
  locationBannerContent: { padding: 12, gap: 8, alignItems: "center" },
  locationText: { color: "#ffffff", fontSize: 14, textAlign: "center" },
  locationRetry: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: "#ffffff", paddingHorizontal: 16, paddingVertical: 8 },
  refreshButton: {
    alignSelf: "flex-start",
    backgroundColor: APP_BACKGROUND_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});

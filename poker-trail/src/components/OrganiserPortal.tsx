import { Slot, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import type { Href } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { RobotoSlab_800ExtraBold } from "@expo-google-fonts/roboto-slab/800ExtraBold";
import { Montserrat_500Medium_Italic } from "@expo-google-fonts/montserrat/500Medium_Italic";
import { useFonts } from "expo-font";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import OrganiserWaypointEditor from "./OrganiserWaypointEditor";
import { emptyWaypointDraft, parseWaypointDraft } from '../lib/organiserWaypointDraft';
import type { WaypointDraft } from '../lib/organiserWaypointDraft';
import OrganiserLeaderboard from "./OrganiserLeaderboard";
import { organiserSupabase } from "../lib/organiserSupabase";
import { APP_BACKGROUND_COLOR, TRAIL_INK, TRAIL_WHITE } from "../lib/theme";
import { LANDING_BUTTON_FONT, LANDING_INPUT_FONT, getOrganiserHeadingSize, getOrganiserDetailSize } from "../lib/landingTypography";
import {
  getOrganiserSession, loadOrganiserDashboard, saveOrganiserEvent, saveOrganiserWaypoint,
  signInOrganiser, signUpOrganiser, signOutOrganiser, publishOrganiserEvent,
  requestOrganiserPasswordReset, updateOrganiserPassword,
  deleteOrganiserEvent, closeOrganiserEvent,
  createOrganiserEventWithWaypoints,
} from "../lib/organiser";
import type { OrganiserDashboard, OrganiserEvent, OrganiserWaypoint } from "../lib/organiser";

type PortalState = { dashboard: OrganiserDashboard | null; refresh: () => Promise<void>; recovery: boolean };
const Context = createContext<PortalState>({ dashboard: null, refresh: async () => {}, recovery: false });
const base = (id: string) => `/organiser/events/${encodeURIComponent(id)}`;
const reason = (error: unknown) => error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Something went wrong. Please retry.";

function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
function Nav({ label, to, selected = false }: { label: string; to: string; selected?: boolean }) {
  const router = useRouter();
  return <Pressable accessibilityRole="link" accessibilityState={{ selected }} onPress={() => router.push(to as Href)} style={[styles.nav, selected && styles.selected]}><Text style={styles.navText}>{label}</Text></Pressable>;
}
function Field({ label, value, onChangeText, password = false, numeric = false, labelStyle, disabled = false }: { label: string; value: string; onChangeText: (text: string) => void; password?: boolean; numeric?: boolean; labelStyle?: StyleProp<TextStyle>; disabled?: boolean }) {
  return <View style={styles.field}><Text style={[styles.label, labelStyle]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!disabled} secureTextEntry={password} autoCapitalize="none" inputMode={numeric ? "decimal" : "text"} style={styles.input} /></View>;
}
function Panel({ title, children, flushTop = false, compactTop = false, topPadding }: { title?: string; children: React.ReactNode; flushTop?: boolean; compactTop?: boolean; topPadding?: number }) {
  return <View style={[styles.panel, flushTop && styles.panelFlushTop, compactTop && styles.panelCompactTop, topPadding !== undefined && { paddingTop: topPadding }]}>{title && <Text style={styles.heading}>{title}</Text>}{children}</View>;
}
function Feedback({ text }: { text: string }) { return text ? <Text accessibilityRole="alert" style={styles.feedback}>{text}</Text> : null; }

export function PortalLayout() {
  const { width } = useWindowDimensions();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const [fontsLoaded] = useFonts({ RobotoSlab_800ExtraBold });
  const characterWidth = Math.min(100, Math.max(64, width * 0.2)) * 0.7;
  const pathname = usePathname();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<OrganiserDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(typeof window !== "undefined" && window.location.hash.includes("type=recovery"));
  const [error, setError] = useState("");
  const currentEvent = dashboard?.events.find(event => event.id === eventId);
  const pagePath = pathname.replace(/\/$/, '');
  const headerTitle = pagePath === '/organiser' ? 'Your Events' : pagePath === '/organiser/events/new' ? 'Create event' : currentEvent?.name;
  const isAuth = ["/organiser/sign-in", "/organiser/sign-up", "/organiser/reset-password"].includes(pathname);
  async function refresh() {
    const { session } = await getOrganiserSession();
    const data = session ? await loadOrganiserDashboard() : null;
    setDashboard(data);
  }
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let alive = true;
    async function load() {
      try {
        const { session } = await getOrganiserSession();
        const data = session ? await loadOrganiserDashboard() : null;
        if (alive) { setDashboard(data); setError(""); }
      } catch (e) { if (alive) setError(reason(e)); }
      finally { if (alive) setLoading(false); }
    }
    void load();
    const { data } = organiserSupabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') setRecovery(true); setTimeout(() => { if (alive) void load(); }, 0); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!loading && !error && !dashboard && !isAuth) router.replace({ pathname: "/organiser/sign-in", params: { next: pathname } } as Href);
  }, [dashboard, loading, error, isAuth, pathname, router]);
  if (Platform.OS !== "web") return <View style={styles.page}><Text>Open /organiser in your browser to manage events.</Text></View>;
  return <Context.Provider value={{ dashboard, refresh, recovery }}><ScrollView style={styles.background} keyboardShouldPersistTaps="handled">
    <View style={styles.banner}><View style={styles.bannerInner}>
      {dashboard && <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => { void signOutOrganiser().then(() => { setDashboard(null); router.replace('/organiser/sign-in' as Href); }).catch(e => setError(reason(e))); }} style={({ pressed }) => [styles.iconButton, styles.logout, pressed && styles.logoutPressed]}>
        <Image accessible={false} source={require('../../assets/images/POKER-TRAIL-icon-exit.png')} resizeMode="contain" style={styles.logoutIcon} />
      </Pressable>}
      <Image accessible={false} source={require('../../assets/images/POKER-TRAIL-character.png')} resizeMode="contain" style={{ width: characterWidth, height: characterWidth * characterAspectRatio }} />
      {dashboard && headerTitle && <Text style={[styles.bannerEventName, { fontSize: getOrganiserHeadingSize(width) * 1.25 }, fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }]}>{headerTitle}</Text>}
    </View></View>
    <View style={styles.page}>
    {loading ? <Text>Loading organiser portal…</Text> : error ? <Panel title="Unable to load your account"><Feedback text={error} /><Button title="Retry" onPress={() => { setLoading(true); void refresh().then(() => setError('')).catch(e => setError(reason(e))).finally(() => setLoading(false)); }} /></Panel> : isAuth || dashboard ? <Slot /> : <Text>Opening sign in…</Text>}
    </View>
  </ScrollView></Context.Provider>;
}

export function AuthPage() {
  const signup = usePathname().endsWith("sign-up");
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refresh } = useContext(Context);
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try {
      if (!email.trim() || password.length < 6) throw new Error("Enter your email and a password of at least 6 characters.");
      if (signup) await signUpOrganiser(email, password); else await signInOrganiser(email, password);
      await refresh();
      const target = typeof next === 'string' && (next === '/organiser' || next.startsWith('/organiser/events/')) ? next : '/organiser';
      router.replace(target as Href);
    } catch (e) { setError(reason(e)); } finally { setBusy(false); }
  }
  return <Panel title={signup ? "Create your organiser account" : "Welcome back"}>
    <Text style={styles.copy}>Plan your route, publish your event and follow player progress.</Text>
    <Field label="Email" value={email} onChangeText={setEmail} /><Field label="Password" value={password} onChangeText={setPassword} password />
    <Feedback text={error} /><Button title={busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'} disabled={busy} onPress={() => void submit()} />
    <Nav label={signup ? "Already have an account? Sign in" : "New here? Create an account"} to={(signup ? '/organiser/sign-in' : '/organiser/sign-up') + (next ? '?next=' + encodeURIComponent(next) : '')} />
    <Nav label="Forgot password?" to="/organiser/reset-password" />
  </Panel>;
}

export function PasswordPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const { recovery } = useContext(Context);
  const [recovering, setRecovering] = useState(recovery);
  useEffect(() => { if (recovery) setRecovering(true); }, [recovery]);
  useEffect(() => { const { data } = organiserSupabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') setRecovering(true); }); return () => data.subscription.unsubscribe(); }, []);
  async function submit() {
    setBusy(true); setMessage('');
    try {
      if (recovering) { if (password.length < 6) throw new Error('Use at least 6 characters.'); await updateOrganiserPassword(password); setMessage('Password updated. You can sign in.'); }
      else { if (!email.trim()) throw new Error('Enter your email.'); await requestOrganiserPasswordReset(email); setMessage('If the account exists, a reset link will be sent.'); }
    } catch (e) { setMessage(reason(e)); } finally { setBusy(false); }
  }
  return <Panel title="Reset your password">{recovering ? <Field label="New password" value={password} onChangeText={setPassword} password /> : <Field label="Email" value={email} onChangeText={setEmail} />}<Feedback text={message} /><Button title={busy ? 'Please wait…' : recovering ? 'Save password' : 'Send reset link'} disabled={busy} onPress={() => void submit()} /><Nav label="Back to sign in" to="/organiser/sign-in" /></Panel>;
}

export function DashboardPage() {
  const { dashboard } = useContext(Context);
  const router = useRouter();
  return <>
    {!dashboard?.events.length && <Panel title="Create your first trail"><Text style={styles.copy}>Start with a free draft for up to 25 players. Add five waypoints and publish when you’re ready.</Text></Panel>}
    {dashboard?.events.map(event => <Pressable key={event.id} accessibilityRole="link" accessibilityLabel={`Open ${event.name}`} onPress={() => router.push(base(event.id) as Href)} style={({ pressed }) => [styles.panel, pressed && styles.logoutPressed]}>
      <Text style={styles.heading}>{event.name}</Text>
      <Text style={styles.copy}>{event.status.toUpperCase()} · {dashboard.summaries[event.id]?.playerCount ?? 0} players · {event.playerCapacity ?? 'Unlimited'} capacity</Text>
    </Pressable>)}
    <Pressable accessibilityRole="button" accessibilityLabel="Create event" onPress={() => router.push('/organiser/events/new' as Href)} style={({ pressed }) => [styles.iconButton, styles.createEvent, pressed && styles.logoutPressed]}>
      <Feather name="plus" size={32} color="#007332" accessible={false} />
    </Pressable>
  </>;
}

export function NewEventPage() {
  const { width } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ RobotoSlab_800ExtraBold });
  const labelSize = 60 * Math.min(Math.max(1, width - 96), 360) / 1241;
  const fieldLabelStyle: TextStyle = { color: TRAIL_INK, fontWeight: '400', fontSize: labelSize, lineHeight: labelSize * 1.4, ...(fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }) };
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<WaypointDraft[]>(() => Array.from({ length: 5 }, emptyWaypointDraft));
  const [index, setIndex] = useState(0);
  const inFlight = useRef(false);
  const createdEvent = useRef<OrganiserEvent | null>(null);
  const points = drafts.map((draft, slot) => parseWaypointDraft(draft, slot)).filter(point => point !== null);
  const ready = !!name.trim() && points.length === 5;
  const previews = points.map(point => ({ ...point, sortOrder: point.slotIndex, name: `Waypoint ${point.slotIndex + 1}` }));
  const { refresh } = useContext(Context); const router = useRouter();
  async function create() {
    if (inFlight.current || (!createdEvent.current && !ready)) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try {
      if (!createdEvent.current) createdEvent.current = await createOrganiserEventWithWaypoints({ name, waypoints: points });
      await refresh(); router.replace(base(createdEvent.current.id) as Href);
    }
    catch (e) { setError(reason(e)); } finally { setBusy(false); inFlight.current = false; }
  }
  const locked = busy || !!createdEvent.current;
  return <Panel>
    <Field label="Event name" value={name} onChangeText={setName} disabled={locked} labelStyle={fieldLabelStyle} />
    <View style={[styles.row, styles.waypointHeadingRow]}>
      <Text accessibilityRole="header" style={[styles.label, fieldLabelStyle]}>Waypoints</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{points.length} / 5 set</Text>
    </View>
    <OrganiserWaypointEditor draft={drafts[index]} selectedSlotIndex={index} waypoints={previews} disabled={locked} autoPickUserLocation={false} onSelect={setIndex} onChange={draft => setDrafts(previous => previous.map((value, slot) => slot === index ? draft : value))} />
    <View style={styles.field}>
      <Text nativeID="event-size-label" style={[styles.label, fieldLabelStyle]}>Event size</Text>
      <select aria-labelledby="event-size-label" defaultValue="25" disabled={locked} style={{ width: '100%', minWidth: 0, minHeight: 48, boxSizing: 'border-box', border: '1px solid #a2b6a5', borderRadius: 8, padding: 12, color: '#153c2a', fontSize: 12.8, fontFamily: 'inherit', backgroundColor: '#fff', opacity: locked ? 0.45 : 1 }}>
        <option value="25">Up to 25 players · Free</option>
        <option value="50" disabled>Up to 50 players · Coming soon</option>
        <option value="100" disabled>Up to 100 players · Coming soon</option>
        <option value="250" disabled>Up to 250 players · Coming soon</option>
      </select>
    </View>
    <Feedback text={error} />
    <View style={styles.row}>
      <Button title={busy ? 'Creating…' : createdEvent.current ? 'Open event' : 'Create event'} disabled={busy || (!ready && !createdEvent.current)} onPress={() => void create()} />
      <Button title="Cancel" disabled={busy} onPress={() => router.push('/organiser' as Href)} />
    </View>
  </Panel>;
}

function useEvent() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>(); const context = useContext(Context);
  return { ...context, event: context.dashboard?.events.find(e => e.id === eventId), waypoints: context.dashboard?.waypoints.filter(w => w.eventId === eventId) ?? [] };
}
function EventFrame({ event, children }: { event?: OrganiserEvent; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { refresh } = useContext(Context);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  async function deleteEvent() {
    if (!event || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteOrganiserEvent(event.id);
    } catch (e) { setDeleteError(reason(e)); setDeleting(false); return; }
    setConfirmDelete(false);
    setEditingName(false);
    router.replace('/organiser' as Href);
    void refresh().catch(() => {});
  }
  async function saveName() {
    if (!event || savingName || !name.trim()) return;
    setSavingName(true); setNameError('');
    try {
      await saveOrganiserEvent({ id: event.id, name: name.trim() });
      await refresh();
      setEditingName(false);
    } catch (e) { setNameError(reason(e)); }
    finally { setSavingName(false); }
  }
  async function closeEvent() {
    if (!event || savingName || deleting) return;
    setSavingName(true); setNameError('');
    try {
      await closeOrganiserEvent(event.id);
      await refresh();
      setConfirmClose(false); setEditingName(false);
    } catch (e) { setNameError(reason(e)); }
    finally { setSavingName(false); }
  }
  const [fontsLoaded] = useFonts({ RobotoSlab_800ExtraBold, Montserrat_500Medium_Italic });
  const { width } = useWindowDimensions();
  const [codeBlockWidth, setCodeBlockWidth] = useState(0);
  const detailSize = getOrganiserDetailSize(codeBlockWidth || Math.max(1, width - 96));
  const fontSize = getOrganiserHeadingSize(width);
  if (!event) return <Panel title="Event unavailable"><Text style={styles.copy}>This event does not exist or you don’t have access.</Text><Nav label="Back to your events" to="/organiser" /></Panel>;
  return <View style={styles.eventPane}>
    <View style={styles.eventNameRow}>
      <Pressable accessibilityRole="link" accessibilityLabel="Back to your events" onPress={() => router.push('/organiser' as Href)} style={({ pressed }) => [styles.editNameButton, pressed && styles.logoutPressed]}>
        <Feather name="arrow-left" size={22} color={TRAIL_INK} accessible={false} />
      </Pressable>
      <View style={styles.eventNameGroup}>
      {event.status === 'active' && <View style={styles.eventCodeHeader}>
        <View style={styles.eventCodeBlock} onLayout={e => setCodeBlockWidth(e.nativeEvent.layout.width)}><Text selectable style={styles.code}>{event.eventCode}</Text><Text style={[styles.centeredCopy, { color: TRAIL_INK, fontSize: detailSize, lineHeight: detailSize * 1.4 }, fontsLoaded && { fontFamily: LANDING_INPUT_FONT }]}>Enter this code in Poker Trail to join</Text></View>
      </View>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit event settings" accessibilityState={{ expanded: editingName }} onPress={() => { setName(event.name); setNameError(''); setDeleteError(''); setConfirmDelete(false); setConfirmClose(false); setEditingName(true); }} style={({ pressed }) => [styles.editNameButton, pressed && styles.logoutPressed]}>
        <Feather name="more-vertical" size={22} color={TRAIL_INK} accessible={false} />
      </Pressable>
    </View>
    <Modal visible={editingName} transparent animationType="fade" onRequestClose={() => { if (!savingName && !deleting) setEditingName(false); }}>
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View accessibilityViewIsModal style={styles.nameDialog}>
            {confirmDelete ? <>
            <Text accessibilityRole="header" style={styles.heading}>Delete event?</Text>
            <Text style={styles.copy}>Permanently delete “{event.name}”, including its waypoints, player registrations, hands and progress? This cannot be undone.</Text>
            <Feedback text={deleteError} />
            <View style={styles.row}>
              <Button title="Cancel" disabled={deleting} onPress={() => setConfirmDelete(false)} />
              <Button title={deleting ? 'Deleting…' : 'Delete event'} disabled={deleting} onPress={() => void deleteEvent()} />
            </View>
            </> : confirmClose ? <>
              <Text accessibilityRole="header" style={styles.heading}>Close event?</Text>
              <Text style={styles.copy}>Close “{event.name}” to stop new registrations and gameplay. Player results will be kept. You can publish the event again from Leaderboard.</Text>
              <Feedback text={nameError} />
              <View style={styles.row}>
                <Button title="Cancel" disabled={savingName} onPress={() => { setNameError(''); setConfirmClose(false); }} />
                <Button title={savingName ? 'Closing…' : 'Close event'} disabled={savingName} onPress={() => void closeEvent()} />
              </View>
            </> : <>
            <Text accessibilityRole="header" style={styles.heading}>Edit event</Text>
            <View style={styles.field}><Text style={styles.label}>Event name</Text><TextInput accessibilityLabel="Event name" value={name} onChangeText={setName} autoFocus editable={!savingName} onSubmitEditing={() => void saveName()} style={styles.input} /></View>
            <Feedback text={nameError} />
            <View style={styles.row}>
              <Button title={savingName ? 'Saving…' : 'Save name'} disabled={savingName || !name.trim()} onPress={() => void saveName()} />
              <Button title="Cancel" disabled={savingName} onPress={() => setEditingName(false)} />
            </View>
            <Button title={event.status === 'closed' ? 'Event closed' : 'Close event'} disabled={savingName || event.status !== 'active'} onPress={() => { setNameError(''); setConfirmClose(true); }} />
            <Button title="Delete event" disabled={savingName} onPress={() => { setDeleteError(''); setConfirmDelete(true); }} />
            </>}
          </View>
        </ScrollView>
      </View>
    </Modal>
    <View style={styles.eventTabFrame}><View style={styles.eventTabBar}>
      {[['Waypoints', '/waypoints'], ['Leaderboard', '']].map(([label, suffix]) => {
        const selected = pathname === base(event.id) + suffix;
        return <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => router.push((base(event.id) + suffix) as Href)} style={({ pressed }) => [styles.eventTab, { backgroundColor: selected ? APP_BACKGROUND_COLOR : TRAIL_WHITE }, pressed && styles.logoutPressed]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.eventTabLabel, fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }, { fontSize, color: selected ? TRAIL_WHITE : TRAIL_INK }]}>{label.toUpperCase()}</Text>
        </Pressable>;
      })}
    </View></View>{children}</View>;
}
const validWaypoint = (w: OrganiserWaypoint) => w.isActive && w.sortOrder >= 0 && w.sortOrder < 5 && Math.abs(w.latitude) <= 90 && Math.abs(w.longitude) <= 180 && w.proofType === 'gps';

export function OverviewPage() {
  const { event, waypoints, refresh } = useEvent(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const count = waypoints.filter(validWaypoint).length;
  async function publish() {
    if (!event) return; setBusy(true); setMessage('');
    try { await publishOrganiserEvent(event.id); await refresh(); setMessage('Event published. Share the event code with your players.'); }
    catch (e) { setMessage(reason(e)); } finally { setBusy(false); }
  }
  return <EventFrame event={event}>{event && <>
    <Panel flushTop compactTop>
      {event.status === 'active' ? null : event.status === 'draft' || event.status === 'closed' ? <><Text style={styles.copy}>{event.playerCapacity ? `Free capacity: ${event.playerCapacity} players. No payment required.` : 'Existing event capacity is preserved.'}</Text><Button title={busy ? 'Please wait…' : 'Publish event'} disabled={busy || count !== 5} onPress={() => void publish()} /></> : <Text style={styles.copy}>This event is archived.</Text>}
      <Feedback text={message} />
      <OrganiserLeaderboard key={event.id} eventId={event.id} />
    </Panel>
  </>}</EventFrame>;
}

export function BillingPage() {
  const { event, dashboard } = useEvent();
  return <EventFrame event={event}>{event && <Panel title="Event capacity & billing"><Text style={styles.heading}>{event.playerCapacity ? `Free · ${event.playerCapacity} players` : 'Existing event · Unlimited capacity'}</Text><Text style={styles.copy}>{dashboard?.summaries[event.id]?.playerCount ?? 0} players registered. No payment is required for the free tier.</Text><Text style={styles.copy}>Larger event tiers and paid upgrades are not available yet. Your current capacity is enforced when new players register; existing players can continue playing.</Text><Nav label="Back to overview" to={base(event.id)} /></Panel>}</EventFrame>;
}

export function WaypointsPage() {
  const { event, waypoints, refresh } = useEvent();
  const { slot } = useLocalSearchParams<{ slot?: string }>();
  const router = useRouter();
  const index = Math.max(0, Math.min(4, Math.floor(Number(slot) || 1) - 1));
  const waypoint = waypoints.find(w => w.sortOrder === index);
  const [draft, setDraft] = useState<WaypointDraft>(emptyWaypointDraft);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    setDraft(waypoint ? { latitude: String(waypoint.latitude), longitude: String(waypoint.longitude), radius: String(waypoint.radiusMeters) } : emptyWaypointDraft());
  }, [event?.id, index, waypoint]);
  useEffect(() => setMessage(''), [event?.id, index]);
  const point = parseWaypointDraft(draft, index);
  async function save() {
    if (!event || busy) return;
    setBusy(true); setMessage('');
    try {
      if (!point) throw new Error('Enter valid coordinates and a positive whole-number radius.');
      await saveOrganiserWaypoint({ id: waypoint?.id, eventId: event.id, ...point });
      await refresh(); setMessage('Waypoint saved.');
    } catch (e) { setMessage(reason(e)); } finally { setBusy(false); }
  }
  return <EventFrame event={event}>{event && <Panel flushTop topPadding={15}>
    <OrganiserWaypointEditor draft={draft} selectedSlotIndex={index} waypoints={waypoints} disabled={busy} onChange={setDraft} onSelect={value => router.replace((base(event.id) + '/waypoints?slot=' + (value + 1)) as Href)}>
      <Feedback text={message} />
      <Button title={busy ? 'Saving…' : 'Save waypoint'} disabled={busy || !point} onPress={() => void save()} />
    </OrganiserWaypointEditor>
  </Panel>}</EventFrame>;
}

// Preserve the source PNG's 1312 × 1199 proportions on web and native.
const characterAspectRatio = 1199 / 1312;

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: APP_BACKGROUND_COLOR }, page: { paddingHorizontal: 24, paddingBottom: 24, gap: 20, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  banner: { backgroundColor: APP_BACKGROUND_COLOR, width: '100%' },
  bannerInner: { position: 'relative', width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 8, paddingLeft: 24, paddingRight: 88, minHeight: 80, gap: 12 },
  bannerEventName: { color: TRAIL_WHITE, flex: 1, textAlign: 'left' },
  brand: { color: '#fff', fontSize: 9.6, fontWeight: '800', letterSpacing: 2, textAlign: 'center' }, title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  iconButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  logout: { position: 'absolute', top: 16, right: 24 },
  createEvent: { alignSelf: 'center' },
  logoutPressed: { opacity: 0.78 }, logoutIcon: { width: '100%', height: '100%' },
  heading: { color: '#153c2a', fontSize: 16.8, fontWeight: '700' },
  eventsTitle: { fontFamily: LANDING_BUTTON_FONT, fontWeight: '800', fontSize: 25.6, color: '#000000' },
  eventName: { color: '#000000', fontWeight: '400', textAlign: 'left' },
  eventPane: { borderWidth: 2, borderColor: APP_BACKGROUND_COLOR, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: TRAIL_WHITE, overflow: 'hidden' },
  eventNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8 },
  eventNameGroup: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  eventNameText: { flexShrink: 1, flexGrow: 1 },
  editNameButton: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  nameDialog: { width: '100%', maxWidth: 480, padding: 24, borderRadius: 16, backgroundColor: TRAIL_WHITE, gap: 16 },
  eventTabFrame: { backgroundColor: TRAIL_WHITE },
  eventTabBar: { flexDirection: 'row', backgroundColor: TRAIL_WHITE, overflow: 'hidden', paddingTop: 4, paddingHorizontal: 24 },
  eventTab: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10, borderRadius: 18 },
  eventTabLabel: { textAlign: 'center' },
  panel: { padding: 24, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#dce4d8', gap: 16 },
  panelFlushTop: { borderRadius: 0, borderWidth: 0 },
  panelCompactTop: { paddingTop: 8 },
  eventCodeBlock: { alignItems: 'center', gap: 0, width: '100%' },
  eventCodeHeader: { width: '100%', paddingHorizontal: 8 },
  centeredCopy: { textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, copy: { color: '#4c5c50', fontSize: 12, lineHeight: 18.4 },
  waypointHeadingRow: { alignItems: 'baseline' },
  field: { gap: 4, maxWidth: 560, width: '100%' }, label: { color: '#234831', fontWeight: '700', fontSize: 11.2 },
  input: { borderWidth: 1, borderColor: '#a2b6a5', borderRadius: 8, padding: 12, color: '#153c2a', fontSize: 12.8, backgroundColor: '#fff', minHeight: 48 },
  button: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 9, backgroundColor: '#256444' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 12 }, disabled: { opacity: 0.45 }, nav: { padding: 12, borderRadius: 8 }, selected: { backgroundColor: '#e4efe1' }, navText: { color: '#256444', fontWeight: '700', fontSize: 12 },
  feedback: { color: '#8a4520', fontSize: 12, lineHeight: 18.4 }, code: { color: '#000000', fontSize: 51.2, lineHeight: 51.2, includeFontPadding: false, letterSpacing: 4, fontFamily: LANDING_BUTTON_FONT, fontWeight: '400' },
});

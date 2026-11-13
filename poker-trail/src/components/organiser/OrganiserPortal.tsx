import { TEXT_STYLE, textMetrics, FONT_SIZE, FONT_WEIGHT } from "../../lib/typography";
import { Link, Slot, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import type { Href } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { RobotoSlab_400Regular } from '@expo-google-fonts/roboto-slab/400Regular';
import { RobotoSlab_600SemiBold } from '@expo-google-fonts/roboto-slab/600SemiBold';
import { RobotoSlab_700Bold } from '@expo-google-fonts/roboto-slab/700Bold';
import { RobotoSlab_800ExtraBold } from "@expo-google-fonts/roboto-slab/800ExtraBold";
import { useFonts } from "expo-font";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import OrganiserWaypointEditor from "./OrganiserWaypointEditor";
import { emptyWaypointDraft, parseWaypointDraft } from '../../lib/organiserWaypointDraft';
import type { WaypointDraft } from '../../lib/organiserWaypointDraft';
import OrganiserLeaderboard from "./OrganiserLeaderboard";
import { organiserSupabase } from "../../lib/organiserSupabase";
import { COLORS, TRAIL_INK, TRAIL_WHITE } from "../../lib/theme";
import { LANDING_BUTTON_FONT, getOrganiserLabelSize } from "../../lib/landingTypography";
import {
  getOrganiserSession, loadOrganiserDashboard, saveOrganiserEvent, saveOrganiserWaypoint,
  signInOrganiser, signUpOrganiser, signOutOrganiser, publishOrganiserEvent,
  requestOrganiserPasswordReset, updateOrganiserPassword,
  deleteOrganiserEvent, setOrganiserRegistrationsPaused,
  createOrganiserDraft, saveOrganiserDraft,
} from "../../lib/organiser";
import EventBillingPanel from './EventBillingPanel';
import { loadCapacityTiers, openEventCheckout, eventExpired, money } from '../../lib/eventBilling';
import type { CapacityTier } from '../../lib/eventBilling';
import type { OrganiserDashboard, OrganiserEvent, OrganiserWaypoint } from "../../lib/organiser";

type PortalState = { dashboard: OrganiserDashboard | null; refresh: () => Promise<void>; recovery: boolean };
const Context = createContext<PortalState>({ dashboard: null, refresh: async () => {}, recovery: false });
const base = (id: string) => `/organiser/events/${encodeURIComponent(id)}`;
const reason = (error: unknown) => error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Something went wrong. Please retry.";

function Button({ title, onPress, busy = false, disabled = false, secondary = false, textStyle, style }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; textStyle?: StyleProp<TextStyle>; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ busy, disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, style, (disabled || busy) && styles.disabled]}>{busy ? <ActivityIndicator accessibilityLabel={title} size="small" color={secondary ? COLORS.primary : COLORS.surface} /> : <Text style={[styles.buttonText, secondary && styles.secondaryButtonText, textStyle]}>{title}</Text>}</Pressable>;
}
function Nav({ label, to, selected = false }: { label: string; to: string; selected?: boolean }) {
  const router = useRouter();
  return <Pressable accessibilityRole="link" accessibilityState={{ selected }} onPress={() => router.push(to as Href)} style={[styles.nav, selected && styles.selected]}><Text style={styles.navText}>{label}</Text></Pressable>;
}
function Field({ label, value, onChangeText, password = false, numeric = false, labelStyle, inputStyle, disabled = false }: { label: string; value: string; onChangeText: (text: string) => void; password?: boolean; numeric?: boolean; labelStyle?: StyleProp<TextStyle>; inputStyle?: StyleProp<TextStyle>; disabled?: boolean }) {
  return <View style={styles.field}><Text style={[styles.label, labelStyle]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!disabled} secureTextEntry={password} autoCapitalize="none" inputMode={numeric ? "decimal" : "text"} style={[styles.input, inputStyle]} /></View>;
}
function Panel({ title, children, flushTop = false, compactTop = false, topPadding, titleStyle, style }: { titleStyle?: StyleProp<TextStyle>; style?: StyleProp<ViewStyle>; title?: string; children: React.ReactNode; flushTop?: boolean; compactTop?: boolean; topPadding?: number }) {
  return <View style={[styles.panel, flushTop && styles.panelFlushTop, compactTop && styles.panelCompactTop, topPadding !== undefined && { paddingTop: topPadding }, style]}>{title && <Text style={[styles.heading, titleStyle, titleStyle && styles.setupHeading]}>{title}</Text>}{children}</View>;
}
function Feedback({ text, textStyle }: { text: string; textStyle?: StyleProp<TextStyle> }) { return text ? <Text accessibilityRole="alert" style={[styles.feedback, textStyle]}>{text}</Text> : null; }

export function PortalLayout() {
  const { width } = useWindowDimensions();
  const characterWidth = Math.min(100, Math.max(64, width * 0.2)) * 0.5;
  const pathname = usePathname();
  const isAccountPage = ['/organiser/sign-in', '/organiser/sign-up'].includes(pathname.replace(/\/$/, ''));
  const router = useRouter();
  const [dashboard, setDashboard] = useState<OrganiserDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(typeof window !== "undefined" && window.location.hash.includes("type=recovery"));
  const [error, setError] = useState("");
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
  if (Platform.OS !== "web") return <View style={styles.page}><Text style={TEXT_STYLE.body}>Open /organiser in your browser to manage events.</Text></View>;
  return <Context.Provider value={{ dashboard, refresh, recovery }}><ScrollView style={[styles.background, isAccountPage && styles.accountBackground]} keyboardShouldPersistTaps="handled">
    {!isAccountPage && <View style={styles.banner}><View style={styles.bannerInner}>
      {dashboard && <Pressable accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={6} onPress={() => { void signOutOrganiser().then(() => { setDashboard(null); router.replace('/organiser/sign-in' as Href); }).catch(e => setError(reason(e))); }} style={({ pressed }) => [styles.iconButton, styles.logout, pressed && styles.logoutPressed]}>
        <Image accessible={false} source={require('../../../assets/images/POKER-TRAIL-icon-exit.png')} resizeMode="contain" style={styles.logoutIcon} />
      </Pressable>}
      <Image accessible={false} source={require('../../../assets/images/POKER-TRAIL-character.png')} resizeMode="contain" style={{ width: characterWidth, height: characterWidth * characterAspectRatio }} />
    </View></View>}
    <View style={styles.page}>
    {loading ? <ActivityIndicator accessibilityLabel="Loading organiser portal" color={COLORS.primary} style={styles.portalLoading} /> : error ? <Panel title="Unable to load your account"><Feedback text={error} /><Button title="Retry" onPress={() => { setLoading(true); void refresh().then(() => setError('')).catch(e => setError(reason(e))).finally(() => setLoading(false)); }} /></Panel> : isAuth || dashboard ? <Slot /> : <ActivityIndicator accessibilityLabel="Opening sign in" color={COLORS.primary} style={styles.portalLoading} />}
    </View>
  </ScrollView></Context.Provider>;
}

export function AuthPage() {
  const { width } = useWindowDimensions();
  const logoWidth = Math.min(360, Math.max(0, width - 48));
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
  return <View style={styles.authShell}>
    <Image accessibilityRole="image" accessibilityLabel="Poker Trail" source={require('../../../assets/images/POKER-TRAIL-horizontal.png')} resizeMode="contain" style={{ width: logoWidth, height: logoWidth / 2, alignSelf: 'center' }} />
    <Panel style={styles.authPanel}>
      <Text accessibilityRole="header" style={[styles.eventsTitle, styles.authTitle]}>{signup ? 'Create organiser account' : 'Organiser sign in'}</Text>
      <Field label="Email" value={email} onChangeText={setEmail} disabled={busy} labelStyle={styles.authLabel} inputStyle={styles.authInput} />
      <Field label="Password" value={password} onChangeText={setPassword} password disabled={busy} labelStyle={styles.authLabel} inputStyle={styles.authInput} />
      <Feedback text={error} />
      <Button style={styles.authSubmit} busy={busy} title={signup ? 'Create account' : 'Sign in'} disabled={busy} onPress={() => void submit()} />
      <View style={styles.authLinks}>
        <Link style={styles.authLink} href={((signup ? '/organiser/sign-in' : '/organiser/sign-up') + (next ? '?next=' + encodeURIComponent(next) : '')) as Href}>{signup ? 'Already have an account? Sign in' : 'Create an account'}</Link>
        <Link style={styles.authLink} href="/organiser/reset-password">Forgot password?</Link>
      </View>
    </Panel>
  </View>;
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
  return <View style={styles.authShell}>
    <Text accessibilityRole="header" style={styles.eventsTitle}>Reset your password</Text>
    <Panel>
      {recovering ? <Field label="New password" value={password} onChangeText={setPassword} password disabled={busy} labelStyle={styles.authLabel} /> : <Field label="Email" value={email} onChangeText={setEmail} disabled={busy} labelStyle={styles.authLabel} />}
      <Feedback text={message} />
      <Button style={styles.authSubmit} busy={busy} title={recovering ? 'Save password' : 'Send reset link'} disabled={busy} onPress={() => void submit()} />
      <Link style={styles.authLink} href="/organiser/sign-in">Back to sign in</Link>
    </Panel>
  </View>;
}

export function DashboardPage() {
  const { dashboard } = useContext(Context);
  const router = useRouter();
  return <>
    <View style={styles.eventsHeadingRow}>
      <Text accessibilityRole="header" style={styles.eventsTitle}>Your Events</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Create event" onPress={() => router.push('/organiser/events/new' as Href)} style={({ pressed }) => [styles.button, styles.createEvent, pressed && styles.logoutPressed]}>
        <Feather name="plus" size={18} color={TRAIL_WHITE} accessible={false} />
        <Text style={styles.buttonText}>Create event</Text>
      </Pressable>
    </View>
    {!dashboard?.events.length && <Panel title="Create your first trail"><Text style={styles.copy}>Start with a free draft for up to 25 players. Add five waypoints and publish when you’re ready.</Text></Panel>}
    {dashboard?.events.map(event => <Pressable key={event.id} accessibilityRole="link" accessibilityLabel={`Open ${event.name}`} onPress={() => router.push(base(event.id) as Href)} style={({ pressed }) => [styles.panel, styles.eventListCard, pressed && styles.logoutPressed]}>
      <View style={[styles.eventsHeadingRow, styles.eventListHeadingRow]}>
        <View style={styles.eventListInfo}>
          <View style={styles.eventListTitleGroup}>
            <Text style={styles.eventNameHeading}>{event.name}</Text>
            <EventStatusIndicator event={event} />
          </View>
          <EventRegistrationDetails event={event} playerCount={dashboard.summaries[event.id]?.playerCount ?? 0} />
        </View>
        <View style={styles.eventSummaryCode}><EventCodeDetails event={event} /></View>
      </View>
    </Pressable>)}
  </>;
}

function useEventFormTypography() {
  const { width } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ RobotoSlab_400Regular, RobotoSlab_600SemiBold, RobotoSlab_700Bold, RobotoSlab_800ExtraBold });
  const bodyFontStyle: TextStyle | undefined = fontsLoaded ? FONT_WEIGHT.regular : undefined;
  const boldFontStyle: TextStyle | undefined = fontsLoaded ? FONT_WEIGHT.bold : undefined;
  const semiBoldFontStyle: TextStyle | undefined = fontsLoaded ? FONT_WEIGHT.medium : undefined;
  const labelSize = getOrganiserLabelSize(width - 96);
  const fieldLabelStyle: TextStyle = { color: TRAIL_INK, ...FONT_WEIGHT.regular, fontSize: labelSize, lineHeight: labelSize * 1.4, ...(fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }) };
  return { bodyFontStyle, boldFontStyle, semiBoldFontStyle, fieldLabelStyle };
}

export function NewEventPage() {
  return <EventCreationPage />;
}

function EventCreationPage({ event: existingEvent, waypoints = [] }: { event?: OrganiserEvent; waypoints?: OrganiserWaypoint[] }) {
  const { bodyFontStyle, boldFontStyle, semiBoldFontStyle, fieldLabelStyle } = useEventFormTypography();
  const [name, setName] = useState(existingEvent?.name ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<WaypointDraft[]>(() => Array.from({ length: 5 }, (_, slot) => {
    const waypoint = waypoints.find(point => point.sortOrder === slot && point.isActive);
    return waypoint ? { latitude: String(waypoint.latitude), longitude: String(waypoint.longitude), radius: String(waypoint.radiusMeters) } : emptyWaypointDraft();
  }));
  const [index, setIndex] = useState(0);
  const [capacity, setCapacity] = useState(existingEvent?.requestedCapacity ?? existingEvent?.playerCapacity ?? 25);
  const [tiers, setTiers] = useState<CapacityTier[]>([]);
  useEffect(() => { void loadCapacityTiers().then(setTiers).catch(e => setError(reason(e))); }, []);
  const inFlight = useRef(false);
  const createdEvent = useRef<OrganiserEvent | null>(existingEvent ?? null);
  const points = drafts.map((draft, slot) => parseWaypointDraft(draft, slot)).filter(point => point !== null);
  const ready = !!name.trim() && points.length === 5;
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const previews = points.map(point => ({ ...point, sortOrder: point.slotIndex, name: `Waypoint ${point.slotIndex + 1}` }));
  const { refresh } = useContext(Context); const router = useRouter();
  async function create(intent: 'draft' | 'publish') {
    if (inFlight.current || !name.trim() || (intent === 'publish' && !ready)) return;
    inFlight.current = true; setBusy(true); setSavingDraft(intent === 'draft'); setError('');
    try {
      if (existingEvent && createdEvent.current?.status === 'draft') {
        createdEvent.current = await saveOrganiserDraft({ id: existingEvent.id, name, waypoints: points, capacity });
      } else if (!createdEvent.current) createdEvent.current = await createOrganiserDraft({ name, waypoints: points, capacity });
      const event = createdEvent.current;
      if (intent === 'publish' && (event.playerCapacity === null || capacity <= (event.playerCapacity ?? 25)) && event.status !== 'active') {
        await publishOrganiserEvent(event.id); event.status = 'active';
      }
      await refresh();
      if (intent === 'publish' && event.status !== 'active' && capacity > (event.playerCapacity ?? 25)) await openEventCheckout(event.id, capacity);
      else router.replace((intent === 'draft' ? '/organiser' : base(event.id)) as Href);
    } catch (e) { setError(createdEvent.current ? (createdEvent.current.status === 'active' ? 'Your event is published. ' : 'Your draft is saved. ') + reason(e) : reason(e)); }
    finally { setBusy(false); inFlight.current = false; }
  }
  const locked = busy || createdEvent.current?.status === 'active' || (!existingEvent && !!createdEvent.current);
  const availableTiers = tiers.length ? tiers : [{ capacity: 25, amount_cents: 0, currency: 'aud' }];
  const selectedTier = availableTiers.find(tier => tier.capacity === capacity);
  return <>
    <Text accessibilityRole="header" style={styles.eventsTitle}>{existingEvent ? existingEvent.name : 'Create event'}</Text>
    <Panel>
    <View style={styles.creationHeader}>
      <View style={styles.creationNameField}><Field label="Event name" value={name} onChangeText={setName} disabled={locked} labelStyle={fieldLabelStyle} inputStyle={bodyFontStyle} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel event creation" disabled={busy} onPress={() => setConfirmCancel(true)} style={({ pressed }) => [styles.editNameButton, busy && styles.disabled, pressed && styles.logoutPressed]}>
        <Feather name="x" size={24} color={TRAIL_INK} accessible={false} />
      </Pressable>
    </View>
    <Modal visible={confirmCancel} transparent animationType="fade" onRequestClose={() => setConfirmCancel(false)}>
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View accessibilityViewIsModal role="alertdialog" aria-modal={true} aria-labelledby="cancel-event-title" aria-describedby="cancel-event-description" style={styles.nameDialog}>
            <Text nativeID="cancel-event-title" accessibilityRole="header" style={[styles.heading, boldFontStyle]}>Leave event creation?</Text>
            <Text nativeID="cancel-event-description" style={[styles.copy, bodyFontStyle]}>{createdEvent.current ? createdEvent.current.status === 'active' ? 'Your published event will remain available in Your Events.' : 'Your saved draft will remain available in Your Events.' : 'Your unsaved event details and waypoints will be discarded.'}</Text>
            <View style={styles.row}>
              <Button textStyle={boldFontStyle} secondary title="Keep editing" onPress={() => setConfirmCancel(false)} />
              <Button textStyle={boldFontStyle} title="Leave" onPress={() => { setConfirmCancel(false); router.replace('/organiser' as Href); }} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
    <View style={[styles.row, styles.waypointHeadingRow]}>
      <Text accessibilityRole="header" style={[styles.label, fieldLabelStyle]}>Waypoints</Text>
      <Text accessibilityLiveRegion="polite" style={[styles.copy, bodyFontStyle]}>{points.length} / 5 set</Text>
    </View>
    <OrganiserWaypointEditor labelTextStyle={bodyFontStyle} inputTextStyle={bodyFontStyle} draft={drafts[index]} selectedSlotIndex={index} waypoints={previews} disabled={locked} autoPickUserLocation={false} onSelect={setIndex} onChange={draft => setDrafts(previous => previous.map((value, slot) => slot === index ? draft : value))} />
    <View style={[styles.field, styles.capacityField]}>
      <Text nativeID="event-size-label" style={[styles.label, fieldLabelStyle]}>Event size</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Event size" style={styles.capacityOptions}>
        {availableTiers.map(tier => <Pressable key={tier.capacity} testID={'event-capacity-' + tier.capacity} accessibilityRole="radio" aria-checked={capacity === tier.capacity} accessibilityLabel={'Up to ' + tier.capacity + ' players · ' + (tier.amount_cents ? money(tier.amount_cents) : 'Free')} accessibilityState={{ checked: capacity === tier.capacity, disabled: locked }} disabled={locked} onPress={() => setCapacity(tier.capacity)} style={[styles.capacityOption, capacity === tier.capacity && styles.capacityOptionSelected, locked && styles.disabled]}>
          <View style={styles.capacityOptionHeading}><Text style={[styles.capacityCount, semiBoldFontStyle]}>Up to {tier.capacity} players</Text><Feather name={capacity === tier.capacity ? 'check-circle' : 'circle'} size={18} color={COLORS.primary} accessible={false} /></View>
          <Text style={[styles.capacityPrice, boldFontStyle]}>{tier.amount_cents ? money(tier.amount_cents) : 'Free'}</Text>
        </Pressable>)}
      </View>
    </View>
    <Feedback textStyle={bodyFontStyle} text={error} />
    <View style={styles.row}>
      <Button textStyle={[styles.creationActionText, boldFontStyle]} busy={busy && !savingDraft} title={capacity > 25 ? 'Pay & publish' : 'Publish event'} disabled={busy || !ready} onPress={() => void create('publish')} />
      <Button style={styles.draftButton} textStyle={[styles.creationActionText, boldFontStyle, styles.draftButtonText]} secondary busy={busy && savingDraft} title="Save draft" disabled={busy || createdEvent.current?.status === 'active' || (!name.trim() && !createdEvent.current)} onPress={() => void create('draft')} />
      <View accessibilityLiveRegion="polite" style={styles.capacitySummary}><Text style={[styles.capacitySummaryPrice, boldFontStyle]}>Up to {capacity} players · {selectedTier?.amount_cents ? money(selectedTier.amount_cents) : 'Free'}</Text><Text style={[styles.copy, bodyFontStyle]}>Events last 30 days from first publication.</Text></View>
    </View>
    </Panel>
  </>;
}

function useEvent() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>(); const context = useContext(Context);
  return { ...context, event: context.dashboard?.events.find(e => e.id === eventId), waypoints: context.dashboard?.waypoints.filter(w => w.eventId === eventId) ?? [] };
}
function EventCodeDetails({ event }: { event: OrganiserEvent }) {
  const canJoin = event.status === 'active' && !eventExpired(event) && !event.registrationsPaused;
  return <View style={styles.splitJoinPanel}>
    <View style={styles.splitJoinCode}>
      <Text style={styles.splitJoinLabel}>Event code</Text>
      <Text selectable={event.status !== 'draft'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityLabel={event.status === 'draft' ? 'Event code available after publishing' : undefined} style={[styles.code, styles.splitJoinValue]}>{event.status === 'draft' ? '------' : event.eventCode}</Text>
    </View>
    <View accessible={false} style={styles.splitJoinDivider}>
      <View style={styles.splitJoinRule} />
    </View>
    <View style={styles.splitJoinInstruction}>
      {canJoin ? <Link href="/register" target="_blank" rel="noopener noreferrer" onPress={e => e.stopPropagation()} style={styles.splitJoinLink}>Join event</Link> : <Text style={styles.splitJoinCopy}>{event.status === 'draft' ? 'Publish to let players join' : event.registrationsPaused ? 'Registrations paused' : 'Registration is closed'}</Text>}
    </View>
  </View>;
}

function EventRegistrationDetails({ event, playerCount }: { event: OrganiserEvent; playerCount: number }) {
  return <View style={styles.eventListMetadata}>
    <View style={styles.eventExpiryRow}>
      <Feather name="users" size={14} color={COLORS.muted} accessible={false} />
      <Text style={styles.eventListDetail}>{playerCount} {playerCount === 1 ? 'player' : 'players'} registered</Text>
    </View>
    {event.expiresAt && <View style={styles.eventExpiryRow}>
      <Feather name="clock" size={14} color={COLORS.muted} accessible={false} />
      <Text style={styles.eventListDetail}>Playable until {new Date(event.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
    </View>}
  </View>;
}

function EventStatusIndicator({ event }: { event: OrganiserEvent }) {
  const expired = eventExpired(event);
  const label = expired ? 'Expired' : event.status === 'active' && event.registrationsPaused ? 'Registrations paused' : event.status.charAt(0).toUpperCase() + event.status.slice(1);
  const active = event.status === 'active' && !expired && !event.registrationsPaused;
  return <View style={[styles.eventStatusBadge, { backgroundColor: active ? COLORS.selected : COLORS.neutralSurface }]}>
    <Text accessibilityLabel={`Event status: ${label}`} style={[TEXT_STYLE.label, { color: active ? COLORS.primary : COLORS.muted }]}>{label}</Text>
  </View>;
}

function EventFrame({ event, children }: { event?: OrganiserEvent; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { refresh } = useContext(Context);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingRegistrations, setSavingRegistrations] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const settingsBusy = savingName || savingRegistrations || deleting;
  async function deleteEvent() {
    if (!event || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteOrganiserEvent(event.id);
    } catch (e) { setDeleteError(reason(e)); setDeleting(false); return; }
    setConfirmDelete(false);
    setSettingsOpen(false);
    router.replace('/organiser' as Href);
    void refresh().catch(() => {});
  }
  async function saveName() {
    if (!event || savingName || !name.trim()) return;
    setSavingName(true); setSettingsError('');
    try {
      await saveOrganiserEvent({ id: event.id, name: name.trim() });
      await refresh();
      setSettingsOpen(false);
    } catch (e) { setSettingsError(reason(e)); }
    finally { setSavingName(false); }
  }
  async function toggleRegistrations() {
    if (!event || settingsBusy || event.status !== 'active' || eventExpired(event)) return;
    setSavingRegistrations(true); setSettingsError('');
    try {
      await setOrganiserRegistrationsPaused(event.id, !event.registrationsPaused);
      await refresh();
    } catch (e) { setSettingsError(reason(e)); }
    finally { setSavingRegistrations(false); }
  }
  const [fontsLoaded] = useFonts({ RobotoSlab_800ExtraBold });
  if (!event) return <Panel title="Event unavailable"><Text style={styles.copy}>This event does not exist or you don’t have access.</Text><Nav label="Back to your events" to="/organiser" /></Panel>;
  return <>
    <View style={styles.eventPane}>
    <View style={styles.eventHeadingRow}>
      <Pressable accessibilityRole="link" accessibilityLabel="Back to your events" onPress={() => router.push('/organiser' as Href)} style={({ pressed }) => [styles.editNameButton, styles.eventHeadingButton, pressed && styles.logoutPressed]}>
        <Feather name="arrow-left" size={22} color={TRAIL_INK} accessible={false} />
      </Pressable>
      <View style={styles.eventHeadingMain}>
        <View style={styles.eventTitleGroup}>
          <Text accessibilityRole="header" style={[styles.eventsTitle, styles.eventTitleText]}>{event.name}</Text>
          <EventStatusIndicator event={event} />
        </View>
        <View style={styles.eventSummaryCode}>
          <EventCodeDetails key={`${event.id}-code`} event={event} />
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit event settings" accessibilityState={{ expanded: settingsOpen }} onPress={() => { setName(event.name); setSettingsError(''); setDeleteError(''); setConfirmDelete(false); setSettingsOpen(true); }} style={({ pressed }) => [styles.editNameButton, styles.eventHeadingButton, pressed && styles.logoutPressed]}>
        <Feather name="more-vertical" size={22} color={TRAIL_INK} accessible={false} />
      </Pressable>
    </View>
    <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => { if (!settingsBusy) setSettingsOpen(false); }}>
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View accessibilityViewIsModal role="dialog" aria-modal={true} aria-labelledby="event-settings-title" style={styles.nameDialog}>
            <View style={styles.settingsHeader}>
              <Text nativeID="event-settings-title" accessibilityRole="header" style={styles.settingsTitle}>{confirmDelete ? 'Delete event?' : 'Event settings'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close event settings" disabled={settingsBusy} onPress={() => setSettingsOpen(false)} style={styles.settingsClose}>
                <Feather name="x" size={20} color={COLORS.muted} accessible={false} />
              </Pressable>
            </View>
            {confirmDelete ? <>
              <Text style={styles.copy}>Permanently delete “{event.name}”, including its waypoints, player registrations, hands and progress? This cannot be undone.</Text>
              <Feedback text={deleteError} />
              <View style={styles.settingsActions}>
                <Button secondary title="Keep event" disabled={deleting} onPress={() => setConfirmDelete(false)} />
                <Button busy={deleting} style={styles.dangerButton} title="Delete event" disabled={deleting} onPress={() => void deleteEvent()} />
              </View>
            </> : <>
              <View style={styles.settingsSection}>
                <Field label="Event name" value={name} onChangeText={setName} disabled={settingsBusy || eventExpired(event)} />
                <View style={styles.settingsActions}>
                  <Button busy={savingName} title="Save name" disabled={settingsBusy || !name.trim() || name.trim() === event.name || eventExpired(event)} onPress={() => void saveName()} />
                </View>
              </View>
              <View style={[styles.settingsSection, styles.settingsDivider]}>
                <Text style={styles.settingsSectionTitle}>Registrations</Text>
                <Text style={styles.copy}>{event.status !== 'active' || eventExpired(event) ? 'Registration settings are available for active events.' : event.registrationsPaused ? 'New registrations are paused. Existing players can keep playing.' : 'Pause new registrations while existing players keep playing.'}</Text>
                <View style={styles.settingsActions}>
                  <Button secondary busy={savingRegistrations} title={event.registrationsPaused ? 'Resume registrations' : 'Pause registrations'} disabled={settingsBusy || event.status !== 'active' || eventExpired(event)} onPress={() => void toggleRegistrations()} />
                </View>
              </View>
              <Feedback text={settingsError} />
              <View style={[styles.settingsSection, styles.settingsDivider]}>
                <Text style={styles.settingsSectionTitle}>Delete event</Text>
                <Text style={styles.copy}>Permanently remove this event and its player progress.</Text>
                <View style={styles.settingsActions}>
                  <Button secondary style={styles.dangerOutline} textStyle={styles.dangerText} title="Delete event" disabled={settingsBusy} onPress={() => { setDeleteError(''); setConfirmDelete(true); }} />
                </View>
              </View>
            </>}
          </View>
        </ScrollView>
      </View>
    </Modal>
    {event.status !== 'draft' && <View style={styles.eventTabFrame}><View style={styles.eventTabBar}>
      <View accessibilityRole="tablist" style={styles.eventTabGroup}>
      {[['Setup', ''], ['Leaderboard', '/leaderboard']].map(([label, suffix]) => {
        const selected = pathname === base(event.id) + suffix || (suffix === '' && ['/waypoints', '/billing'].some(path => pathname === base(event.id) + path));
        return <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => router.push((base(event.id) + suffix) as Href)} style={({ pressed }) => [styles.eventTab, selected && styles.eventTabSelected, pressed && styles.logoutPressed]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.eventTabLabel, fontsLoaded && { fontFamily: LANDING_BUTTON_FONT }, selected && styles.eventTabLabelSelected]}>{label}</Text>
        </Pressable>;
      })}
      </View>
    </View></View>}{children}</View>
  </>;
}
const validWaypoint = (w: OrganiserWaypoint) => w.isActive && w.sortOrder >= 0 && w.sortOrder < 5 && Math.abs(w.latitude) <= 90 && Math.abs(w.longitude) <= 180 && w.proofType === 'gps';

export function OverviewPage() {
  const { event, waypoints } = useEvent();
  if (event?.status === 'draft') return <EventCreationPage key={event.id} event={event} waypoints={waypoints} />;
  return <PublishedOverviewPage />;
}

function PublishedOverviewPage() {
  const router = useRouter();
  const { event, waypoints, refresh } = useEvent(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const count = waypoints.filter(validWaypoint).length;
  async function publish() {
    if (!event) return; setBusy(true); setMessage('');
    try { if (event.requestedCapacity && event.playerCapacity !== null && event.requestedCapacity > event.playerCapacity) { router.push((base(event.id) + '/billing?target=' + event.requestedCapacity) as Href); return; } await publishOrganiserEvent(event.id); await refresh(); setMessage('Event published. Share the event code with your players.'); }
    catch (e) { setMessage(reason(e)); } finally { setBusy(false); }
  }
  return <EventFrame event={event}>{event && <>
    <Panel flushTop compactTop>
      {eventExpired(event) ? null : event.status === 'active' ? null : event.status === 'draft' || event.status === 'closed' ? <><Text style={styles.copy}>{event.playerCapacity ? `Current capacity: ${event.playerCapacity} players.` : 'Existing event capacity is preserved.'}</Text><Button busy={busy} title={event.requestedCapacity && event.playerCapacity !== null && event.requestedCapacity > event.playerCapacity ? 'Pay & publish' : 'Publish event'} disabled={busy || count !== 5} onPress={() => void publish()} /></> : <Text style={styles.copy}>This event is archived.</Text>}
      {count !== 5 && <Nav label="Finish setting up waypoints" to={base(event.id) + "/waypoints"} />}
      <Feedback text={message} />
      <OrganiserLeaderboard key={event.id} eventId={event.id} />
    </Panel>
  </>}</EventFrame>;
}

export function BillingPage() {
  return <WaypointsPage />;
}

export function WaypointsPage() {
  const { event, waypoints } = useEvent();
  if (event?.status === 'draft') return <EventCreationPage key={event.id} event={event} waypoints={waypoints} />;
  return <PublishedWaypointsPage />;
}

function PublishedWaypointsPage() {
  const { bodyFontStyle, boldFontStyle, fieldLabelStyle } = useEventFormTypography();
  const { event, waypoints, refresh, dashboard } = useEvent();
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
  return <EventFrame event={event}>{event && <><Panel titleStyle={fieldLabelStyle} title="Waypoints" flushTop topPadding={15}>
    <Text style={[styles.copy, bodyFontStyle]}>Set up the locations players visit on your trail. Select a numbered waypoint, choose its location or enter coordinates, then set the radius players must be within to collect.</Text>
    {eventExpired(event) && <Text style={[styles.copy, bodyFontStyle]}>This event has expired. Waypoints are read-only.</Text>}
    <OrganiserWaypointEditor labelTextStyle={bodyFontStyle} inputTextStyle={bodyFontStyle} draft={draft} selectedSlotIndex={index} waypoints={waypoints} disabled={busy || eventExpired(event)} onChange={setDraft} onSelect={value => router.setParams({ slot: String(value + 1) })}>
      <Feedback textStyle={bodyFontStyle} text={message} />
      <Button textStyle={[styles.creationActionText, boldFontStyle]} busy={busy} title="Save waypoint" disabled={busy || !point || eventExpired(event)} onPress={() => void save()} />
    </OrganiserWaypointEditor>
  </Panel>
    <Panel titleStyle={fieldLabelStyle} title="Capacity & billing" flushTop><EventBillingPanel event={event} refresh={refresh} playerCount={dashboard?.summaries[event.id]?.playerCount ?? 0} routeReady={waypoints.filter(validWaypoint).length === 5} /></Panel>
  </>}</EventFrame>;
}

// Preserve the source PNG's 1312 × 1199 proportions on web and native.
const characterAspectRatio = 1199 / 1312;

const styles = StyleSheet.create({
  authShell: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16, marginTop: 16 },
  accountBackground: { backgroundColor: COLORS.brand },
  authPanel: { padding: 20, gap: 10 },
  authInput: { minHeight: 44, paddingVertical: 10 },
  authTitle: { textAlign: 'center' },
  authLabel: { color: COLORS.muted },
  authSubmit: { alignSelf: 'stretch', alignItems: 'center' },
  authLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 16, rowGap: 12 },
  authLink: { ...TEXT_STYLE.label, color: COLORS.primary, paddingVertical: 6 },
  portalLoading: { padding: 24 },
  creationHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  creationNameField: { flex: 1, minWidth: 0 },
  creationActionText: { ...TEXT_STYLE.button },
  draftButton: { borderColor: '#000000' },
  draftButtonText: { color: '#000000' },
  secondaryButton: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary },
  secondaryButtonText: { color: COLORS.primary },
  capacityField: { maxWidth: '100%' },
  capacityOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  capacityOption: { flexBasis: 180, flexGrow: 1, minWidth: 0, padding: 16, gap: 8, borderWidth: 2, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.surface },
  capacityOptionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.selected },
  capacityOptionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capacityCount: { ...TEXT_STYLE.capacityTitle, flex: 1, color: COLORS.text },
  capacityPrice: { ...TEXT_STYLE.capacityPrice, color: COLORS.text },
  capacitySummary: { gap: 4, flexShrink: 1 },
  capacitySummaryPrice: { ...TEXT_STYLE.button, color: COLORS.text },
  background: { flex: 1, backgroundColor: COLORS.organiserBackground }, page: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, gap: 20, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  banner: { backgroundColor: COLORS.brand, width: '100%' },
  bannerInner: { position: 'relative', width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 4, paddingLeft: 24, paddingRight: 76, minHeight: 60, gap: 10 },
  brand: { color: COLORS.surface, ...textMetrics(FONT_SIZE.micro), ...FONT_WEIGHT.display, letterSpacing: 2, textAlign: 'center' }, title: { color: COLORS.surface, ...textMetrics(FONT_SIZE.large), ...FONT_WEIGHT.display, textAlign: 'center', marginTop: 4 },
  iconButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  logout: { position: 'absolute', top: '50%', marginTop: -18, right: 24, width: 36, height: 36, borderRadius: 18 },
  eventsHeadingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  createEvent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  logoutPressed: { opacity: 0.78 }, logoutIcon: { width: '100%', height: '100%' },
  heading: { ...TEXT_STYLE.heading, color: COLORS.text },
  eventsTitle: { ...FONT_WEIGHT.bold, ...textMetrics(FONT_SIZE.large), color: TRAIL_INK },
  eventName: { color: '#000000', ...FONT_WEIGHT.regular, textAlign: 'left' },
  eventPane: { borderWidth: 1, borderColor: COLORS.subtleBorder, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: TRAIL_WHITE, overflow: 'hidden' },
  eventHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },
  eventHeadingMain: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eventTitleGroup: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 },
  eventTitleText: { flexShrink: 1 },
  eventListInfo: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, gap: 6 },
  eventListTitleGroup: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 },
  eventListCard: { gap: 8 },
  eventListHeadingRow: { alignItems: 'flex-start' },
  eventListMetadata: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6 },
  eventListDetail: { ...TEXT_STYLE.caption, color: COLORS.muted, flexShrink: 1 },
  eventNameHeading: { ...FONT_WEIGHT.bold, ...textMetrics(FONT_SIZE.title), color: TRAIL_INK, flexShrink: 1 },
  eventNameText: { flexShrink: 1, flexGrow: 1 },
  editNameButton: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  eventHeadingButton: { justifyContent: 'flex-start', paddingTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingsTitle: { ...FONT_WEIGHT.bold, ...textMetrics(FONT_SIZE.title), color: TRAIL_INK, flex: 1 },
  settingsClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  settingsSection: { gap: 10 },
  settingsSectionTitle: { ...TEXT_STYLE.button, color: TRAIL_INK },
  settingsDivider: { borderTopWidth: 1, borderTopColor: COLORS.subtleBorder, paddingTop: 16 },
  settingsActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 10 },
  dangerButton: { backgroundColor: COLORS.danger },
  dangerOutline: { borderColor: COLORS.danger },
  dangerText: { color: COLORS.danger },
  nameDialog: { width: '100%', maxWidth: 480, padding: 24, borderRadius: 16, backgroundColor: TRAIL_WHITE, gap: 16 },
  eventTabFrame: { backgroundColor: TRAIL_WHITE },
  eventTabBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 16, backgroundColor: TRAIL_WHITE, paddingTop: 4, marginHorizontal: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  eventTabGroup: { flexDirection: 'row', minWidth: 0 },
  eventSummaryCode: { marginLeft: 'auto', maxWidth: '100%' },
  splitJoinPanel: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.organiserBackground, borderRadius: 8, borderWidth: 1, borderColor: COLORS.neutralSurface },
  splitJoinInstruction: { flexShrink: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  splitJoinCopy: { ...TEXT_STYLE.caption, color: COLORS.muted },
  splitJoinLink: { ...TEXT_STYLE.label, color: COLORS.primary },
  splitJoinDivider: { width: 1, alignSelf: 'stretch', paddingVertical: 8 },
  splitJoinRule: { flex: 1, width: 1, backgroundColor: COLORS.inactive, opacity: 0.35 },
  splitJoinCode: { flexShrink: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 8, gap: 0 },
  splitJoinLabel: { ...TEXT_STYLE.label, color: COLORS.muted },
  splitJoinValue: { ...FONT_WEIGHT.bold, ...textMetrics(FONT_SIZE.large, 1.1), letterSpacing: 1, color: TRAIL_INK },
  eventTab: { minWidth: 0, flexShrink: 1, minHeight: 40, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  eventTabSelected: { backgroundColor: COLORS.selected, borderBottomColor: COLORS.primary },
  eventTabLabel: { ...FONT_WEIGHT.regular, textAlign: 'left', ...textMetrics(FONT_SIZE.small),  color: COLORS.muted },
  eventTabLabelSelected: { color: COLORS.text },
  panel: { padding: 24, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.subtleBorder, gap: 16 },
  panelFlushTop: { borderRadius: 0, borderWidth: 0 },
  panelCompactTop: { paddingTop: 8 },
  eventStatusBadge: { alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  eventExpiryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, copy: { ...TEXT_STYLE.caption, color: COLORS.muted },
  setupHeading: { marginBottom: -8 },
  waypointHeadingRow: { alignItems: 'baseline', marginBottom: -8 },
  field: { gap: 4, maxWidth: 560, width: '100%' }, label: { ...TEXT_STYLE.label, color: '#234831' },
  input: { ...TEXT_STYLE.input, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, color: COLORS.text, backgroundColor: COLORS.surface, minHeight: 48 },
  button: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 9, backgroundColor: COLORS.primary },
  buttonText: { ...TEXT_STYLE.button, color: COLORS.surface }, disabled: { opacity: 0.45 }, nav: { padding: 12, borderRadius: 8 }, selected: { backgroundColor: COLORS.selected }, navText: { ...TEXT_STYLE.button, color: COLORS.primary },
  feedback: { ...TEXT_STYLE.caption, color: COLORS.error }, code: { color: TRAIL_INK, ...TEXT_STYLE.heading, includeFontPadding: false, letterSpacing: 1 },
});

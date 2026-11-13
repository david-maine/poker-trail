import { COLORS } from "../../lib/theme";
import { TEXT_STYLE, FONT_FAMILY, FONT_WEIGHT } from "../../lib/typography";
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';
import { RobotoSlab_400Regular } from '@expo-google-fonts/roboto-slab/400Regular';
import { RobotoSlab_600SemiBold } from '@expo-google-fonts/roboto-slab/600SemiBold';
import { RobotoSlab_700Bold } from '@expo-google-fonts/roboto-slab/700Bold';
import { cancelEventCheckout, createEventCheckout, eventExpired, loadEventBilling, money } from '../../lib/eventBilling';
import type { EventBilling } from '../../lib/eventBilling';
import { publishOrganiserEvent, setRequestedEventCapacity } from '../../lib/organiser';
import type { OrganiserEvent } from '../../lib/organiser';

export default function EventBillingPanel({ event, refresh, routeReady, playerCount = 0 }: { event: OrganiserEvent; refresh: () => Promise<void>; routeReady: boolean; playerCount?: number }) {
  const { checkout } = useLocalSearchParams<{ checkout?: string; target?: string }>();
  const router = useRouter();
  const [billing, setBilling] = useState<EventBilling | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(checkout === 'success');
  const [selectedCapacity, setSelectedCapacity] = useState<number | null>(null);
  const [fontsLoaded] = useFonts({ RobotoSlab_400Regular, RobotoSlab_600SemiBold, RobotoSlab_700Bold });
  const bodyTextStyle = [styles.copy, fontsLoaded && FONT_WEIGHT.regular];
  useEffect(() => setSelectedCapacity(null), [event.id, event.playerCapacity, event.requestedCapacity]);
  async function reload() {
    const value = await loadEventBilling(event.id); setBilling(value);
    setProcessing(checkout === 'success' && value.purchases.some(p => p.status === 'pending'));
    await refresh();
  }
  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    async function poll(attempt = 0) {
      try {
        const value = await loadEventBilling(event.id);
        if (!alive) return;
        setBilling(value);
        const pending = value.purchases.some(p => p.status === 'pending');
        setProcessing(checkout === 'success' && pending);
        if (checkout === 'success' && pending && attempt < 10) timer = setTimeout(() => void poll(attempt + 1), 2000);
        else await refresh();
      } catch (e) { if (alive) setError(message(e)); }
    }
    void poll(); return () => { alive = false; clearTimeout(timer); };
    // Portal refresh changes identity on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, checkout]);
  async function buy(capacity: number) {
    setBusy(true); setError('');
    try { const result = await createEventCheckout(event.id, capacity); window.location.assign(result.url); }
    catch (e) { setError(message(e)); setBusy(false); }
  }
  async function publish() {
    if (busy || !routeReady) return;
    setBusy(true); setError('');
    try {
      if (selected != null && selected !== event.requestedCapacity) await setRequestedEventCapacity(event.id, selected);
      await publishOrganiserEvent(event.id);
      await refresh();
      navigate(`/organiser/events/${event.id}`);
    }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError('');
    try { await cancelEventCheckout(event.id); await reload(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const capacity = billing ? billing.event.player_capacity : event.playerCapacity;
  const currentPrice = billing?.tiers.find(t => t.capacity === capacity)?.amount_cents ?? 0;
  const pending = billing?.purchases.find(p => p.status === 'pending');
  const isDraft = (billing?.event.status ?? event.status) === 'draft';
  const selected = selectedCapacity ?? (isDraft ? event.requestedCapacity : capacity) ?? capacity;
  const selectedTier = billing?.tiers.find(tier => tier.capacity === selected);
  const navigate = (path: string) => router.push(path as Href);
  return <View style={{ gap: 16 }}>
    {!billing && !error && <ActivityIndicator accessibilityLabel="Loading capacity and billing" color={COLORS.primary} />}
    <View style={styles.capacityDetails}>
      <View style={styles.playerCountRow}>
        <Feather name="users" size={14} color={COLORS.primary} accessible={false} />
        <Text style={bodyTextStyle}>{capacity === null ? `${playerCount} ${playerCount === 1 ? 'player' : 'players'} registered` : `${playerCount} of ${capacity} players registered`}</Text>
      </View>
      {!eventExpired(event) && <View style={styles.playerCountRow}>
        <Feather name="clock" size={14} color={COLORS.primary} accessible={false} />
        <Text style={[bodyTextStyle, { flexShrink: 1 }]}>{event.expiresAt ? `Playable until ${new Date(event.expiresAt).toLocaleString()}` : event.lifecycleManaged ? 'Your window starts when you publish.' : 'Existing event lifetime is preserved.'}</Text>
      </View>}
    </View>
    {eventExpired(event) ? <><Text style={bodyTextStyle}>This event has expired. Results remain available.</Text><Action title="Create new event" onPress={() => navigate('/organiser/events/new')} /></> : <>
      <Text style={bodyTextStyle}>Upgrades cost the difference and do not extend the window.</Text>
      {billing && !billing.enabled && <Text style={bodyTextStyle}>Paid checkout is not configured for this environment. Free events remain available.</Text>}
      {checkout === 'cancelled' && <Text style={bodyTextStyle}>Checkout was cancelled. Capacity is unchanged. Resume or cancel the outstanding checkout below.</Text>}
      {processing && <ActivityIndicator accessibilityLabel={pending?.publish_on_payment ? 'Confirming payment and publishing your event' : 'Processing payment'} color={COLORS.primary} />}
      {checkout === 'success' && billing?.event.status === 'active' && <Text style={bodyTextStyle} accessibilityLiveRegion="polite">Payment confirmed. Your event is published.</Text>}
      {isDraft && <Text style={bodyTextStyle}>Pay &amp; publish opens your event after successful payment and starts its 30-day window.</Text>}
      {isDraft && !routeReady && <Text style={bodyTextStyle}>Finish all five waypoints before publishing.</Text>}
      {pending && <><Action title={pending.publish_on_payment ? "Resume Pay & publish" : "Resume checkout"} disabled={busy || !billing?.enabled} onPress={() => void buy(pending.target_capacity)} /><Action title="Cancel checkout" disabled={busy || !billing?.enabled} onPress={() => void cancel()} /></>}
      <View accessibilityRole="radiogroup" accessibilityLabel="Event size" style={styles.capacityOptions}>
        {billing?.tiers.map(tier => {
          const downgrade = capacity === null || tier.capacity < capacity;
          const disabled = downgrade || busy || !!pending || processing;
          const checked = tier.capacity === selected;
          return <Pressable key={tier.capacity} accessibilityRole="radio" aria-checked={checked} accessibilityLabel={`Up to ${tier.capacity} players · ${tier.amount_cents ? money(tier.amount_cents) : 'Free'}${downgrade ? ' · Downgrade unavailable' : tier.capacity === capacity ? ' · Current capacity' : ''}`} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => setSelectedCapacity(tier.capacity)} style={[styles.capacityOption, checked && styles.capacityOptionSelected, disabled && styles.disabled, downgrade && styles.downgrade]}>
            <View style={styles.capacityOptionHeading}><Text style={[styles.capacityCount, fontsLoaded && { fontFamily: FONT_FAMILY.medium }]}>Up to {tier.capacity} players</Text><Feather name={checked ? 'check-circle' : 'circle'} size={18} color={downgrade ? '#777' : COLORS.primary} accessible={false} /></View>
            <Text style={[styles.capacityPrice, fontsLoaded && { fontFamily: FONT_FAMILY.bold }]}>{tier.amount_cents ? money(tier.amount_cents) : 'Free'}</Text>
            {tier.capacity === capacity && <Text style={bodyTextStyle}>Current capacity</Text>}
          </Pressable>;
        })}
      </View>
      {selectedTier && capacity != null && selectedTier.capacity > capacity && <Action title={`${isDraft ? 'Pay & publish' : 'Upgrade'} · ${money(selectedTier.amount_cents - currentPrice)}`} disabled={busy || !!pending || processing || !billing?.enabled || (isDraft && !routeReady)} onPress={() => void buy(selectedTier.capacity)} />}
      {isDraft && !pending && selected != null && selected <= (capacity ?? Infinity) && <Action busy={busy} title="Publish event" disabled={busy || processing || !routeReady} onPress={() => void publish()} />}
    </>}
    {error ? <Text style={bodyTextStyle} accessibilityRole="alert">{error}</Text> : null}

  </View>;
}
function message(e: unknown) { return (e as { message?: string })?.message || 'Unable to load billing. Please retry.'; }
const styles = StyleSheet.create({
  capacityDetails: { gap: 16 },
  playerCountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copy: { ...TEXT_STYLE.caption, color: COLORS.muted },
  capacityOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  capacityOption: { flexBasis: 180, flexGrow: 1, minWidth: 0, padding: 16, gap: 8, borderWidth: 2, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.surface },
  capacityOptionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.selected },
  capacityOptionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capacityCount: { ...TEXT_STYLE.capacityTitle, flex: 1, color: COLORS.text },
  capacityPrice: { ...TEXT_STYLE.capacityPrice, color: COLORS.text },
  disabled: { opacity: 0.45 },
  downgrade: { backgroundColor: '#e5e5e5', borderColor: '#aaa' },
});
function Action({ title, onPress, disabled, busy = false }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ busy, disabled: !!disabled || busy }} disabled={disabled || busy} onPress={onPress} style={{ alignSelf: 'flex-start', borderRadius: 9, padding: 14, backgroundColor: COLORS.primary, opacity: disabled ? 0.45 : 1 }}>{busy ? <ActivityIndicator accessibilityLabel={title} size="small" color={COLORS.surface} /> : <Text style={{ ...TEXT_STYLE.button, color: COLORS.surface }}>{title}</Text>}</Pressable>;
}

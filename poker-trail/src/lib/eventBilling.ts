import { organiserSupabase } from './organiserSupabase';

export type CapacityTier = { capacity: number; amount_cents: number; currency: string };
export type EventPurchase = {
  id: string; target_capacity: number; amount_cents: number; currency: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled'; created_at: string;
  publish_on_payment: boolean; receipt_url: string | null; review_required: boolean; refunded_cents: number;
};
export type EventBilling = {
  event: { player_capacity: number | null; expires_at: string | null; status: string };
  tiers: CapacityTier[]; purchases: EventPurchase[]; enabled: boolean; testMode: boolean;
};
export const money = (cents: number) => `A$${(cents / 100).toFixed(2)}`;
export function eventExpired(event: { expiresAt?: string | null; endsAt?: string | null }, now = Date.now()) {
  return [event.expiresAt, event.endsAt].some(value => value && Date.parse(value) <= now);
}
export async function loadCapacityTiers(): Promise<CapacityTier[]> {
  const { data, error } = await organiserSupabase.from('event_capacity_tiers').select('*').order('capacity');
  if (error) throw error;
  return data ?? [];
}
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await organiserSupabase.functions.invoke(name, { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response?.json) {
      const detail = await response.json().catch(() => null);
      if (detail?.error) throw new Error(detail.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const loadEventBilling = (eventId: string) => invoke<EventBilling>('event-billing', { eventId });
export const createEventCheckout = (eventId: string, targetCapacity: number) => invoke<{ url: string }>('event-checkout', { eventId, targetCapacity });
export const cancelEventCheckout = (eventId: string) => invoke('event-checkout', { eventId, cancel: true });

export async function openEventCheckout(eventId: string, capacity: number): Promise<void> {
  const checkout = await createEventCheckout(eventId, capacity);
  window.location.assign(checkout.url);
}

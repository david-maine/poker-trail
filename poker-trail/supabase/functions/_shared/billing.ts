import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("BILLING_APP_ORIGIN") || "http://localhost:8081",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
export function database() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function paymentConfig() {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const origin = Deno.env.get("BILLING_APP_ORIGIN") || "";
  const live = key.startsWith("sk_live_");
  const development = Deno.env.get("BILLING_ENVIRONMENT") === "development";
  const liveEnabled = Deno.env.get("BILLING_LIVE_ENABLED") === "true";
  const validOrigin = /^https:\/\/[^/]+$/.test(origin) || (development && /^http:\/\/localhost:\d+$/.test(origin));
  const enabled = validOrigin && ((development && key.startsWith("sk_test_")) || (!development && live && liveEnabled));
  return { enabled, live, origin, key, development };
}
export function stripeClient() {
  const config = paymentConfig();
  if (!config.enabled) throw new Error("Paid checkout is not configured for this environment. Free events remain available.");
  return new Stripe(config.key);
}
export async function ownerContext(req: Request, eventId: string) {
  const db = database();
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) throw new Error("Sign in to manage billing");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new Error("Sign in to manage billing");
  const event = checked(await db.from("events").select("*").eq("id", eventId).eq("created_by", data.user.id).single());
  return { db, event, user: data.user };
}
export async function fulfilSession(db: ReturnType<typeof database>, stripe: Stripe, sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] });
  if (session.payment_status !== "paid") return;
  const purchase = checked(await db.from("event_purchases").select("*").eq("id", session.metadata?.purchase_id).single());
  if (session.metadata?.event_id !== purchase.event_id || session.livemode !== paymentConfig().live) throw new Error("Payment metadata mismatch");
  if (session.amount_total !== purchase.amount_cents || session.currency !== purchase.currency || session.livemode !== purchase.livemode) throw new Error("Payment does not match purchase");
  // Recover if Stripe accepted checkout creation but its HTTP response/database
  // attachment failed. A verified paid session must still be fulfilled.
  if (!purchase.stripe_session_id) checked(await db.from("event_purchases").update({ stripe_session_id: session.id, checkout_url: session.url }).eq("id", purchase.id).is("stripe_session_id", null));
  const intent = session.payment_intent as Stripe.PaymentIntent;
  const charge = intent.latest_charge as Stripe.Charge | null;
  checked(await db.rpc("fulfil_event_purchase", {
    p_id: purchase.id, p_session: session.id, p_intent: intent.id,
    p_amount: session.amount_total, p_currency: session.currency,
    p_live: session.livemode, p_receipt: charge?.receipt_url || null,
  }));
}

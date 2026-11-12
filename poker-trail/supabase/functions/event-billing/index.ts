import { checked, cors, fulfilSession, ownerContext, paymentConfig, reply, stripeClient } from "../_shared/billing.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const { eventId } = await req.json();
    const { db } = await ownerContext(req, eventId);
    const config = paymentConfig();
    if (config.enabled) {
      const pending = checked(await db.from("event_purchases").select("*").eq("event_id", eventId).eq("status", "pending").maybeSingle());
      if (pending?.stripe_session_id) {
        const stripe = stripeClient();
        const session = await stripe.checkout.sessions.retrieve(pending.stripe_session_id);
        if (session.status === "complete") await fulfilSession(db, stripe, session.id);
        if (session.status === "expired") checked(await db.from("event_purchases").update({ status: "expired" }).eq("id", pending.id).eq("status", "pending"));
      }
    }
    const event = checked(await db.from("events").select("player_capacity,expires_at,status").eq("id", eventId).single());
    const purchases = checked(await db.from("event_purchases").select("*").eq("event_id", eventId).order("created_at", { ascending: false }));
    const tiers = checked(await db.from("event_capacity_tiers").select("*").order("capacity"));
    return reply({ event, purchases, tiers, enabled: config.enabled, testMode: !config.live });
  } catch (error) { return reply({ error: (error as Error).message || "Unable to load billing" }, 400); }
});

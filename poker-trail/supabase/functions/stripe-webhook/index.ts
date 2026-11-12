import { checked, database, fulfilSession, paymentConfig, reply, stripeClient } from "../_shared/billing.ts";

Deno.serve(async req => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  let event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") || "", Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
    if (event.livemode !== paymentConfig().live) throw new Error("Incorrect Stripe environment");
  } catch { return reply({ error: "Invalid webhook signature or configuration" }, 400); }
  try {
    const db = database();
    if (checked(await db.from("billing_webhook_events").select("id").eq("id", event.id).maybeSingle())) return reply({ received: true });
    const stripe = stripeClient();
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await fulfilSession(db, stripe, event.data.object.id);
    } else if (event.type === "checkout.session.expired") {
      checked(await db.from("event_purchases").update({ status: "expired" }).eq("stripe_session_id", event.data.object.id).eq("status", "pending"));
    } else if (event.type === "charge.refunded") {
      const charge = await stripe.charges.retrieve(event.data.object.id);
      await reconcileIntent(charge.payment_intent as string);
      checked(await db.from("event_purchases").update({ review_required: true, refunded_cents: charge.amount_refunded }).eq("stripe_payment_intent", charge.payment_intent));
    } else if (event.type.startsWith("charge.dispute.")) {
      const dispute = event.data.object as { payment_intent: string; id: string };
      const latest = await stripe.disputes.retrieve(dispute.id);
      await reconcileIntent(dispute.payment_intent);
      checked(await db.from("event_purchases").update({ review_required: true, dispute_status: latest.status }).eq("stripe_payment_intent", dispute.payment_intent));
    }
    async function reconcileIntent(intent: string) {
      // Refund/dispute delivery may precede checkout completion delivery.
      const existing = checked(await db.from("event_purchases").select("id").eq("stripe_payment_intent", intent).maybeSingle());
      if (existing) return;
      const sessions = await stripe.checkout.sessions.list({ payment_intent: intent, limit: 1 });
      if (sessions.data[0]?.metadata?.purchase_id) await fulfilSession(db, stripe, sessions.data[0].id);
    }
    const { error } = await db.from("billing_webhook_events").insert({ id: event.id });
    if (error && error.code !== "23505") throw error;
    return reply({ received: true });
  } catch (error) {
    console.error("Billing webhook failed", event.id, (error as Error).message);
    return reply({ error: "Payment processing failed; retry delivery" }, 500);
  }
});

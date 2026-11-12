import { checked, cors, fulfilSession, ownerContext, paymentConfig, reply, stripeClient } from "../_shared/billing.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const { eventId, targetCapacity, cancel = false } = await req.json();
    const { db, user } = await ownerContext(req, eventId);
    const stripe = stripeClient();
    const config = paymentConfig();
    const pending = checked(await db.from("event_purchases").select("*").eq("event_id", eventId).eq("status", "pending").maybeSingle());
    if (pending?.stripe_session_id) {
      let session = await stripe.checkout.sessions.retrieve(pending.stripe_session_id);
      if (session.status === "complete") {
        await fulfilSession(db, stripe, session.id);
        if (cancel) return reply({ cancelled: false, paid: true });
      } else {
        if (cancel && session.status === "open") session = await stripe.checkout.sessions.expire(session.id);
        if (session.status === "expired") checked(await db.from("event_purchases").update({ status: cancel ? "cancelled" : "expired" }).eq("id", pending.id).eq("status", "pending"));
        else if (cancel) throw new Error("Checkout cannot be cancelled yet. Refresh its status.");
      }
    } else if (cancel && pending) {
      // Session creation may still be in flight. Retry creation to recover its id before cancellation.
      throw new Error("Checkout is being prepared. Resume it, then cancel.");
    }
    if (cancel) return reply({ cancelled: true });
    if (!Number.isInteger(targetCapacity)) throw new Error("Choose a capacity tier");
    const purchase = checked(await db.rpc("reserve_event_purchase", {
      p_event_id: eventId, p_owner: user.id, p_capacity: targetCapacity, p_livemode: config.live,
    }));
    if (purchase.checkout_url) return reply({ url: purchase.checkout_url });
    const returnPath = `${config.origin}/organiser/events/${encodeURIComponent(eventId)}/billing`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"], customer_email: user.email,
      success_url: `${returnPath}?checkout=success`, cancel_url: `${returnPath}?checkout=cancelled`,
      metadata: { purchase_id: purchase.id, event_id: eventId },
      line_items: [{ quantity: 1, price_data: {
        currency: purchase.currency, unit_amount: purchase.amount_cents,
        product_data: { name: `Poker Trail · ${purchase.target_capacity} players${config.live ? "" : " (TEST)"}`, description: purchase.publish_on_payment ? "Successful payment publishes your event and starts its 30-day window." : "Capacity upgrade. The existing event window is unchanged." },
      } }],
    }, { idempotencyKey: `event-purchase-${purchase.id}` });
    checked(await db.from("event_purchases").update({ stripe_session_id: session.id, checkout_url: session.url }).eq("id", purchase.id).eq("status", "pending"));
    return reply({ url: session.url });
  } catch (error) { return reply({ error: (error as Error).message || "Unable to prepare checkout" }, 400); }
});

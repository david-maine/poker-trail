# Event billing deployment

The catalogue is stored in `event_capacity_tiers`: 25 players free, 50 players
A$29, 100 players A$49, and 250 players A$99. Upgrades charge the difference.
Amounts are final AUD totals; automatic tax and card surcharges are disabled.
New events are drafts and expire 30 days after first publication. Existing
events retain their previous lifetime and capacity. Results remain readable.

## Development setup

1. Authenticate the Supabase CLI (`supabase login`) and verify the linked project
   is development (`cjqxoubluqpupfsofjch`), never production for test payments.
2. Push migrations before releasing the updated frontend:
   `npx supabase db push --linked`.
3. Configure backend-only secrets through Supabase secret management:

   | Secret | Development value |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Stripe sandbox/test secret key (`sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | Signing secret for this webhook endpoint |
   | `BILLING_ENVIRONMENT` | `development` |
   | `BILLING_APP_ORIGIN` | Exact frontend origin, e.g. `http://localhost:8081` |
   | `BILLING_LIVE_ENABLED` | `false` |

   Supabase supplies its URL, anon key and service-role key automatically.
   Never put Stripe or service-role secrets in `EXPO_PUBLIC_*` settings.
4. Deploy `event-checkout`, `event-billing`, `stripe-webhook`, and `submit-hand`
   with `npx supabase functions deploy FUNCTION --project-ref cjqxoubluqpupfsofjch --use-api`.
   JWT gateway verification is disabled in config; checkout and billing validate
   the bearer token with Supabase Auth themselves. The webhook verifies Stripe's
   raw request-body signature and matching test/live environment.
5. Register the Stripe webhook destination:
   `https://cjqxoubluqpupfsofjch.supabase.co/functions/v1/stripe-webhook`.
   Subscribe to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.expired`,
   `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, and
   `charge.dispute.closed`. Set its signing secret in Supabase and enable Stripe
   receipt emails. Use Stripe CLI forwarding for a fully local functions stack.
6. Restart the development frontend, sign in, create a paid-capacity draft,
   open Checkout, and use Stripe's test card `4242 4242 4242 4242` with a future
   expiry and any three-digit CVC. Verify the purchase appears paid, capacity
   changes, receipt opens, the event automatically publishes, and its 30-day window starts.
7. Verify cancellation/resume, upgrades, duplicate webhook delivery, and a
   payment with the browser closed. Confirm the webhook alone unlocks capacity.

Billing status also reconciles completed Checkout sessions through the same
atomic fulfilment function, so a slow webhook does not strand a returning buyer.
One pending checkout is reserved per event. Cancel it before choosing another
tier. A failed session-creation request can be resumed with the same Stripe
idempotency key. Events with pending or paid purchases cannot be deleted.

## Operations and live launch

Monitor Stripe webhook delivery failures and Supabase function logs. Failures
return HTTP 500 for Stripe retries; replay failed events from Stripe Dashboard
after fixing configuration or connectivity. Never manually increase capacity to
resolve a delivery error: reconcile the original session instead.

Refunds and disputes are handled manually in Stripe Dashboard. Webhooks record
the refunded amount/dispute status and flag the purchase for review; they do not
revoke capacity mid-event. Reconcile these flags before considering any manual
adjustment. Financial history is retained and visible to the event owner.

Before live activation, confirm processor acceptance of this poker-trail use
case and the business's tax treatment, verify the live webhook signing secret
and receipts, and repeat the smoke test in Stripe test mode. Configure the
production backend with `BILLING_ENVIRONMENT=production`, an HTTPS app origin,
a live secret key, and only then `BILLING_LIVE_ENABLED=true`. Test keys are
rejected outside development; live keys are rejected in development. Keep live
activation disabled until these checks are complete.

Validation commands: `npm test`, `npm run typecheck`, `npm run lint`, and
`deno check --node-modules-dir=none supabase/functions/event-checkout/index.ts supabase/functions/event-billing/index.ts supabase/functions/stripe-webhook/index.ts`.

## Development verification — 12 November 2026

The migration and all four functions are deployed to development. Stripe sandbox
credentials and the webhook signing secret are installed in Supabase. Billing
uses `http://localhost:8081`, `BILLING_ENVIRONMENT=development`, and
`BILLING_LIVE_ENABLED=false`. The existing Windows Supabase login works outside
the restricted execution environment; no new Supabase access token was needed.

Verified against the deployed backend and hosted Stripe Checkout:

- Free draft creation, explicit publication, protected capacity, and a 30-day
  window that survives closing/reopening.
- Authentication checks, unsigned webhook rejection, repeated checkout reuse,
  blocked overlapping tiers, and checkout cancellation.
- Original capacity-only flow: A$29 test payment unlocked 50 players while keeping the event a draft;
  A$20 test upgrade unlocking 100 players on the published event.
- Both payments fulfilled through Stripe webhooks without billing polling.
- Receipt URLs, paid-event deletion protection, and signed duplicate delivery.
- A$20 test refund marked for review while preserving the purchased capacity.
- Browser billing screen showing test mode, 100 players, tier prices, payment
  history, receipts, cancellation, and the refund review status.

The closed verification event is `3c915800-508e-46cf-a745-86803280941c`.
Its synthetic test account and paid audit records are retained in development.
Temporary free-event fixtures were removed. Production was not changed.

Reusable scripts:

- `node scripts/setup-development-stripe.cjs` validates the ignored
  `.env.billing.local` test key, creates a webhook if its signing secret is absent,
  and uploads only the Stripe test/signing credentials to development.
- `node scripts/verify-development-billing.cjs` runs the free-flow/backend smoke
  test and removes its temporary free event and account.
- `node scripts/verify-paid-billing.cjs` starts an interactive hosted-checkout test;
  commands are `verify50`, `upgrade100`, `verify100`, `replay`, `refund`, and
  `finish`. Complete the printed Checkout URLs with Stripe test cards only.
- `node scripts/verify-billing-portal.cjs EVENT_ID` provides a five-minute,
  one-use localhost login for a synthetic paid-billing fixture only. It refuses
  real organiser accounts and never prints session tokens.

Keep `.env.billing.local` private and ignored by Git. It contains the test key,
webhook signing secret, and webhook endpoint ID. No secret belongs in this file's
documentation, frontend code, or a commit.

## Creation actions

New events offer **Save as draft** alongside **Publish event** (free capacity)
or **Pay & publish** (paid capacity). Drafts require only a name and retain
the selected size and any completed valid waypoints. The first missing waypoint
opens after saving an incomplete draft. No event clock starts while drafting.

Publishing requires all five valid waypoints and sufficient paid capacity.
The selected size is stored separately from the server-controlled entitlement;
an unpaid paid-size draft cannot be published through a direct API update.
Checkout saves the draft first. A confirmed payment atomically records the purchase,
unlocks capacity, publishes the draft, and starts its 30-day window. Billing also offers a draft-only option to use the currently
available capacity instead. Publication/payment failures retain the saved draft
so retrying does not create another event.

Migration `20261112110000_event_drafts.sql` is deployed to development. The
development smoke test covers name-only drafts, retained paid-size selection,
incomplete/unpaid publication rejection, and subsequent free publication.

## Pay & publish

Migration `20261112120000_pay_and_publish.sql` records publication intent on
each newly reserved draft purchase. Stripe webhook fulfilment and authenticated
payment reconciliation share the same atomic database operation. Browser
redirects alone cannot publish an event. Cancelled and unpaid checkouts keep the
event in draft without starting its clock. Save as draft never starts checkout.

Five valid GPS waypoints are required before payment. Cancel an outstanding
Pay & publish checkout before changing the route or publication settings.
Capacity upgrades on active/closed events preserve both status and lifetime;
replayed payments cannot reopen a closed event or restart its clock.
Existing checkout sessions keep their original capacity-only behaviour; cancel
and restart an old pending checkout to opt into Pay & publish.

This migration and checkout function are deployed to development. A hosted A$29
Stripe sandbox payment for verification event
`92f85092-1903-48b5-83ca-27ecbafdde66` automatically published it with 50-player
capacity and an exact 30-day lifetime through the webhook, without billing
polling. Checkout cancellation and duplicate signed delivery were also checked.
The verification event was closed afterwards; its test audit records remain.
All 79 tests, app typecheck/lint, and the checkout Deno typecheck passed.

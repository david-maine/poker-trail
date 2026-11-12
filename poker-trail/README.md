# Poker Trail

## Live hands and leaderboard

The player design follows `POKER-TRAIL-reference1.png`, `reference2.png`, and `reference3.png`: framed mascot artwork, rounded white-outline fields, black-bordered white actions, an outlined card tray, a trophy header, and contrasting bottom tabs. The shared background stays `#2b7338`. Card faces use the original bundled PNG images with accessible names; the reference screenshots are guides, not images placed over live controls. Height-based layout bounds and horizontal scrolling for longer decks remain in place.

Registered players appear immediately. Cards are saved on the device and synced after every collection; incomplete hands remain active, and collecting every active waypoint completes the run. Completed hands rank first, followed by partial hands and players without cards. The leaderboard refreshes through event revision notifications, with polling as a fallback.

The event-session sync worker restores accepted claims, retains unsynced local cards across restarts, and retries transient failures with backoff. GPS and event-timing validation still applies. Rejected or conflicting cards remain on the device with an error and Retry action; they are never silently replaced. Existing completed runs retain their summaries even if they have no stored waypoint claims.

The map reloads waypoint settings on focus, reconnect, foreground, and every ten seconds while visible. If a radius or location was changed before a pending card synced, the error identifies the waypoint, saved distance, and current radius. Revisiting that waypoint with a valid GPS fix replaces only the rejected, unaccepted location proof and keeps the original card. Accepted proofs are immutable and survive later radius changes.

Checks:

```bash
npm test
npm run typecheck
npm run lint
```

Deploy migrations before the compatible function, then release the app:

```bash
npx supabase db push --linked
npx supabase functions deploy submit-hand --use-api
```

The `submit-hand` payload remains `{ eventId, claims, clientScore? }`; one or more cumulative claims are now accepted. The server calculates the score and responds with the authoritative run and accepted claims. Duplicate/stale matching snapshots are no-ops, while changed accepted claims are rejected. `run_card_claims` is private; only the leaderboard summary and event revision are public for published events.

After logging in to the linked project with the Supabase CLI, run `node scripts/verify-live-hands.cjs` for the explicit live smoke test. It creates a disposable event and two accounts, checks live notifications and per-card syncing, and removes its test data. It reads credentials through the CLI without printing or storing them. Run with `--cleanup-only` to remove leftover verification events after an interrupted test.

## Structure and naming

- app/: Expo Router routes and layouts. Route names define URLs; retain dynamic segments and lowercase kebab-case.
- src/components/: shared UI, grouped into cards/, map/, and organiser/. React components use PascalCase; supporting modules use camelCase.
- src/components/map/MapDisplay: the player map entry point with colocated native and web implementations.
- src/hooks/: React hooks named useSomething.
- src/lib/: services, state, and pure helpers in camelCase. src/types.ts holds shared domain types.
- assets/: bundled images and fonts. public/: web hosting files.
- supabase/: database migrations, seed data, and deployed functions. Preserve migration timestamps and deployed function names.
- scripts/: build, environment, and maintenance commands in kebab-case. Live verification scripts can create remote data; run deliberately.
- tests/: local Node tests in kebab-case.test.cjs and the shared TypeScript loader.

Run commands from this directory: npm install, then npm run dev or npm run dev:web. See [DEVELOPMENT.md](DEVELOPMENT.md) for setup and [BILLING.md](BILLING.md) for billing operations. Run the checks listed above before submitting changes.

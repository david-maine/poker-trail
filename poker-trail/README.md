# Welcome to your Expo app 👋

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

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

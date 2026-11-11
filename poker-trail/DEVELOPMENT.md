# App environments

There are two complete, ignored app configuration files:

| File | Supabase project |
| --- | --- |
| .env.local | Production: bxvvwklaupkqdwosrttu |
| .env.dev.local | Development: cjqxoubluqpupfsofjch (poker-trail-dev) |

Each contains its own Supabase URL, public key and Maps settings. The previous .env and .env.local settings were consolidated into .env.local;
production values were preserved. Production retains the .env.local filename
because Expo on main already reads it. Development uses .env.dev.local so Expo
on main will never automatically load development settings. Never put service-role keys or database passwords in these app files.

## Local commands

Run from the inner poker-trail directory:

| Command | Environment |
| --- | --- |
| npm run dev | Development, native/dev-client server |
| npm run dev:web | Development, browser |
| npm run prod | Production, native/dev-client server |
| npm run prod:web | Production, browser |
| npm start / npm run web / npm run ios / npm run android | Production (existing behaviour) |

Append flags with --, for example npm run dev -- --clear --ios.
The launcher reads exactly one file, checks the expected project, and disables
Expo dotenv overrides. Missing settings cause an error, never a fallback.
Restart Metro when switching environments. Direct npx expo start bypasses the
launcher; use the npm commands above for predictable database selection.

The explicit dev/prod commands are implemented on feature/event-creation.
When checking out main, its original npm start and npm run web commands still
use production from .env.local; Expo does not auto-load .env.dev.local. Ignored files persist across checkouts. Released apps and hosted
production builds are unchanged.

## Cloud builds

EAS development and preview profiles use Expo's development environment.
Production and simulator profiles use its production environment. Their existing
remote variables remain configured; local files do not select cloud databases.
Values are embedded during bundling, so an installed release keeps its database.

## Supabase administration

The CLI link is separate from app settings and persists across Git branches.
It currently targets development. Check supabase/.temp/project-ref before every
migration or deployment; starting the production app does not relink the CLI.
Development has all 13 migrations, demo seed, Auth configuration and submit-hand.
The generated database password is in ignored .supabase-development.local,
which is an administration credential, not an app environment file.

## Live tests and maintenance

Run node scripts/verify-live-hands.cjs --development for the disposable live test.
The test, create-test-leaderboard.cjs and update-demo-event.cjs require an explicit
--development or --production argument and refuse a mismatched CLI link.
No live tests are needed simply to change local configuration.
The unrelated remove-second-david.cjs script remains untouched and still expects
the old env layout; do not run it as part of environment setup.

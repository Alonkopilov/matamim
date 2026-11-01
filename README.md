# Matamim (מטעמים)

A Hebrew, RTL-first recipe app built with Expo and Supabase. It also has an English version. Recipes work fully offline for guests and sync to the cloud once you log in and enable sync. Premium users can import recipes from a URL, upload recipe images, and create a team whose members can see each other's recipes.

## Stack

- **App:** Expo Router, React Native, [Legend State](https://legendapp.com/open-source/state/) for state and offline sync (AsyncStorage persistence and Supabase sync), i18next for Hebrew and English
- **Backend:** Supabase (Postgres with RLS, Auth, Storage, and Edge Functions)
- **Payments:** RevenueCat (`react-native-purchases`), with premium status mirrored into the `premium_entitlements` table
- **Recipe import:** an edge function that reads the page's JSON-LD and falls back to Claude (Haiku) to extract the recipe
- **Rate limiting:** Upstash Redis, used from the edge functions

## Project layout

| Path | What's there |
| --- | --- |
| `app/` | Screens (file-based routing) |
| `components/` | UI components |
| `stores/` | Legend State stores: alerts, auth, premium, recipes (synced), settings, team, toast |
| `utils/` | Supabase client, team and user actions, recipe editing and import, image storage, logger |
| `schemas/` | Zod schemas for the login, register and password reset forms |
| `types/` | Shared app types |
| `i18n/` | i18next setup and the `he` and `en` locale files |
| `languages/` | Localized app name and permission strings for the native app |
| `supabase/migrations/` | Database schema and RLS policies |
| `supabase/functions/` | Edge functions (see below) |
| `supabase/templates/` | Auth email templates (password reset, email change, verification codes) |
| `supabase/tests/` | pgTAP database tests |
| `site/` | The website: privacy policy, terms of use and account deletion pages, in Hebrew and English |

### Edge functions

| Function | What it does |
| --- | --- |
| `create-team`, `edit-team`, `get-team` | Team management |
| `generate-invite`, `join-team`, `leave-team`, `remove-member` | Team invites (8-digit codes, valid for 5 minutes) and membership. Only the host can remove members |
| `import-recipe` | Imports a recipe from a URL (premium only, with a per-user quota and a cache) |
| `sync-premium` | Re-reads the user's entitlement from RevenueCat, called after login and after a purchase or restore |
| `revenuecat-webhook` | Receives RevenueCat events and refreshes the affected users' premium status |
| `delete-account` | Deletes the user's images from storage and then their account |
| `purge-images` | Deletes images no recipe points to. Called once a day by a `pg_cron` job, not by the app |
| `_shared/` | Error responses, rate limiter and RevenueCat helpers |

Each function has its own folder with an `index.ts` and a `deno.json`, and a `[functions.<name>]` block in `supabase/config.toml` with `verify_jwt = false`. The functions check the caller themselves, through `withSupabase({ auth: "user" })`, so a new function needs all three.

## Accounts and user data

- **Sign-up:** a new user gets a 6-digit code by email and has to enter it before the account is usable. The `profiles` row is only created once the email is confirmed (migration `20261003120000_profile_on_email_confirmed.sql`). Logging in with an unconfirmed email sends a new code.
- **Email and password changes:** changing the email needs a code from the current address and another from the new one. Codes are valid for an hour.
- **Teams:** members see each other's names, and only the host sees emails. This is enforced in `get-team` and in the database: `authenticated` can only read the `id` and `username` columns of `profiles`, so a new `profiles` column needs its own grant.
- **Recipe images** are in the private `recipe-images` bucket, under `<user_id>/<uuid>.jpg`. Only the owner and their team can see them, by the same `my_team_user_ids()` rule as recipes, and only the owner can upload or delete. A recipe keeps the object path, and the app loads it from Storage's authenticated endpoint with the user's token (`imageSource` in `utils/imageStorage.ts`).
- **Deleted recipes** are soft-deleted (`is_deleted`) so the deletion syncs to other devices, and removed for good after 30 days (see [Daily cleanup](#daily-cleanup-vault-secrets)).
- **Account deletion** (`delete-account`) removes the user's images, recipes, team and profile.
- **Logout** clears the recipes and images stored on the device.

## Translations

Hebrew is the default language, and the app follows the device language unless the user picks one. Every string lives in `i18n/locales/he/*.json` and `i18n/locales/en/*.json`. Both languages must have the same keys, since a missing key fails type checking.

The auth emails are in Hebrew unless the user's app is in English. The app saves its language in the user's metadata, and the templates and subjects in `supabase/config.toml` branch on it.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the local Supabase stack. This needs Docker.

   ```bash
   npx supabase start
   npx supabase migration up --local
   ```

   Emails sent by the local auth server (sign-up, password reset and email change codes) show up at http://127.0.0.1:54324.

   Changes to `supabase/config.toml` or `supabase/functions/.env` only apply after a restart: `npx supabase stop && npx supabase start`.

3. Set the app's environment in `.env.local`. To test on a physical device, point the app at your machine's LAN IP:

   ```bash
   EXPO_PUBLIC_SUPABASE_LOCAL_URL=http://<your-lan-ip>:54321
   EXPO_PUBLIC_REVENUECAT_TEST_KEY=...   # RevenueCat Test Store key, used by dev builds
   ```

4. Set the edge function secrets in `supabase/functions/.env`. Each one is optional locally, and only the feature that needs it stops working without it.

   ```bash
   # Rate limiting. Without these, rate limiting is turned off.
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...

   # Premium, for sync-premium and the webhook
   REVENUECAT_SECRET_API_KEY=...
   REVENUECAT_ENTITLEMENT_ID=...
   REVENUECAT_WEBHOOK_AUTH=...      # Must match the webhook's Authorization header in RevenueCat
   ALLOW_SANDBOX_PREMIUM=true       # Lets Test Store and sandbox purchases count as premium

   # Recipe import with AI
   ANTHROPIC_API_KEY=...

   # Lets the daily image cleanup call purge-images. Any long random value,
   # e.g. from `openssl rand -hex 32`
   PURGE_AUTH=...
   ```

   The cleanup job reads the function's address and the same `PURGE_AUTH` value from Vault. To run it locally, add them once (the address is the API gateway inside Docker):

   ```sql
   select vault.create_secret('http://supabase_kong_OurRecipes:8000', 'project_url');
   select vault.create_secret('<PURGE_AUTH value>', 'purge_auth');
   ```

   RevenueCat's webhooks can't reach a local Supabase, so locally premium only arrives through `sync-premium`.

5. Run the app. It uses a dev client, not Expo Go.

   ```bash
   npm run android   # or: npm run ios
   ```

Development builds (`__DEV__`) talk to the local stack and RevenueCat's Test Store. To run a dev build against production Supabase, use `npm run start:prod` (it sets `EXPO_PUBLIC_USE_PROD=1`). Release builds use these values from `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_KEY=...
EXPO_PUBLIC_REVENUECAT_IOS_KEY=...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=...
EXPO_PUBLIC_SENTRY_DSN=...            # Optional, see Crash reporting below
```

## Checks

```bash
npx tsc --noEmit
npm run lint
```

ESLint skips `supabase/functions`, which run on Deno.

## Database tests

```bash
npx supabase test db
```

The only test, `supabase/tests/create_recipe_test.sql`, is out of date and currently fails: its recipe insert is rejected by the `recipes` RLS policy.

## Regenerating database types

```bash
npx supabase gen types typescript --local > utils/database.types.ts
```

The `ingredients` and `instructions` columns are then retyped by hand, from `Json` to `Ingredient[]` and `Instruction[]` (see the import at the top of the file).

## Deploying

Migrations and edge functions are deployed with the Supabase CLI:

```bash
npx supabase db push
npx supabase functions deploy <name>
npx supabase secrets set --env-file supabase/functions/.env   # with production values
```

New tables need explicit grants for the `anon`, `authenticated` and `service_role` roles in their migration.

Builds and over-the-air updates go through EAS. The profiles in `eas.json` are `development`, `preview` (an internal Android APK), `production` and `ios-simulator`, each on its own update channel. Updates are tied to the app version (`runtimeVersion.policy` is `appVersion`).

```bash
eas build --profile production --platform all
eas update --channel production
```

`eas update` bundles the `EXPO_PUBLIC_*` values from your local environment, so make sure the release values are set when you run it.

### Auth settings

The `[auth]` settings in `supabase/config.toml` only apply to the local stack. Set the same ones in the production dashboard (**Authentication**):

| Setting | Value |
| --- | --- |
| **Confirm email** | On. Without it, sign-up needs no code and a single code is enough to change the email |
| **Secure email change** | On (a code to both addresses) |
| **Secure password change** | On |
| **Minimum password length** | 8, the same as the app's sign-up form |
| **Email OTP length / expiry** | 6 digits, 3600 seconds |
| **Email templates** | Paste each subject from `config.toml` and each body from `supabase/templates/`: confirm sign-up, change email address, reset password and magic link |
| **SMTP** | A custom SMTP provider. Supabase's built-in one only sends a few emails an hour |

### Daily cleanup (Vault secrets)

Two `pg_cron` jobs run every night. They're in the migration `20261003130000_purge_deleted_recipes.sql`:

- `purge_deleted_recipes` (03:00 UTC) deletes recipes that were soft-deleted more than 30 days ago.
- `purge_orphan_images` (03:30 UTC) calls the `purge-images` function, which deletes images no recipe points to. Storage doesn't allow deleting files from SQL, so this goes through the function.

The image job needs two Vault secrets, plus a function secret with the same password. Set them once per project:

1. Generate a password: `openssl rand -hex 32`.
2. Add it as an edge function secret named `PURGE_AUTH`: **Edge Functions → Secrets**, or `npx supabase secrets set PURGE_AUTH=<password>`.
3. In **Project Settings → Vault → Secrets** (or in the SQL Editor with `vault.create_secret`), add these two secrets with exactly these names:

   | Name | Value |
   | --- | --- |
   | `project_url` | `https://<project-ref>.supabase.co` |
   | `purge_auth` | The same password as `PURGE_AUTH` |

4. Deploy the function: `npx supabase functions deploy purge-images`.
5. Check it without waiting for the night. In the SQL Editor, copy the command from `select command from cron.job where jobname = 'purge_orphan_images';` and run it. A few seconds later, `select status_code, content from net._http_response order by created desc limit 1;` should show `200 {"success":true,...}`. A `401` means the two passwords don't match.

Past runs are listed in **Integrations → Cron**.

### Crash reporting (Sentry)

Release builds send crashes to [Sentry](https://sentry.io). The SDK is set up in `app/_layout.tsx`, and it stays off until a DSN is set.

- **What gets reported:** crashes, plus errors passed to `logger.error`. The user's own mistakes aren't reported: a 4xx answer (a wrong password or code, a rate limit, not allowed) or being offline.
- **What a report includes:** the user's ID and the app's last steps. In release builds, `utils/logger.ts` keeps each log line as a Sentry breadcrumb instead of printing it, so a report shows what that user did before the error.
- **Logs never include** emails, names, recipe names or codes. Log IDs instead.

Reports go to the `ourrecipes` project in the `matamim` Sentry organization. The DSN is in `.env`, and the plugin in `app.json` names the org and project. To finish turning it on for release builds:

1. Add the DSN to the EAS `production` and `preview` environments as `EXPO_PUBLIC_SENTRY_DSN` (expo.dev → project → **Environment variables**, or `eas env:create`).
2. For readable stack traces, `preview` and `production` builds upload source maps and native debug symbols. They need:
   - The Sentry CLI's install script approved: `npm install-scripts approve @sentry/cli`, then `npm install`.
   - An organization auth token (Sentry **Settings → Auth Tokens**) in EAS as a secret named `SENTRY_AUTH_TOKEN`.
   - After each `eas update`, its source maps uploaded: `SENTRY_AUTH_TOKEN=... npx sentry-expo-upload-sourcemaps dist`.
3. To test reporting from a dev build, add `EXPO_PUBLIC_SENTRY_IN_DEV=1` to `.env.local` and restart Metro with `-c`. Reports from dev builds are tagged with the `development` environment.
4. In the App Store privacy labels and the Play data-safety form, declare **crash logs and diagnostics**. They're used for app functionality and linked to the user (through the account ID), but not used for tracking.

### Website (privacy policy and terms)

The pages in `site/` are plain HTML, with no build step. Hebrew pages are at the root (`/privacy/`, `/terms/`, `/delete-account/`) and English ones under `/en/`. The app opens them from the paywall through `utils/legalLinks.ts`, in the app's language.

To preview locally: `python3 -m http.server -d site 8000`.

They're served by Cloudflare Pages and redeploy on every push. To set it up once:

1. The domain is `matamim.org`, registered on Cloudflare. The pages and `SITE_URL` in `utils/legalLinks.ts` already use it.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**. Pick this repo and the `master` branch, leave the build command empty, and set the output directory to `site`.
3. In the Pages project, go to **Custom domains** and add `matamim.org`.
4. Set up **Email → Email Routing** to forward `support@matamim.org` to your inbox.
5. Add the links to the stores:
   - **App Store Connect:** the privacy policy URL. For Terms, put the link in the app description, or add it as a custom EULA.
   - **Play Console:** the privacy policy URL, and `https://matamim.org/en/delete-account/` as the account deletion URL.

When something in the app changes what data is collected or who it's shared with, update the privacy policy in both languages and its date.

# E2E tests (Maestro, Android)

End-to-end flows run on a **release build** of a separate app,
`com.matamim.app.e2e` ("Matamim E2E"), against the **local** Supabase stack
and locally served edge functions only. External services are real: Claude API
and RevenueCat (Test Store only).

## Working agreement

- Flows are added one at a time. The product owner picks the flow and
  defines the expected behavior.
- Every new flow is reviewed by a separate agent, which checks that it really
  tests what it claims and wasn't weakened to get past a bug.
- If writing a flow uncovers an app bug, work stops and the bug is reported.
  A test is never written to work around one.
- Tests assert outcomes (data saved, list updated), not just that a screen
  appeared. Prefer `testID` over visible text, since the app is translated.
- Each flow sets up its own state and does not depend on another flow.

## Running

```sh
# Once: install Maestro
curl -fsSL "https://get.maestro.mobile.dev" | bash
# Once per clone: start the prod project's service versions, not the CLI's
# older defaults (the probe counts rows in Auth tables older Auth lacks).
# Without api.supabase.com, copying supabase/.temp/*-version and
# storage-migration from a linked clone does the same
supabase link --project-ref <prod ref>

supabase start
scripts/e2e/build-android.sh   # ~17 min clean, rebuild after app changes
scripts/e2e/swap-bundle.sh     # ~2 min, swaps only the JS bundle into the APK
scripts/e2e/run.sh             # all flows in Maestro/flows
scripts/e2e/run.sh Maestro/flows/<flow>.yaml
scripts/e2e/emulator.sh stop   # when done, the emulator is left running
```

Flows run on their own emulator, `Matamim_E2E` on `emulator-5580`, which
`run.sh` starts if needed (`scripts/e2e/emulator.sh`), with a window, or
none with `E2E_HEADLESS=1`. It's created once with the `Pixel_10_Pro` AVD's
hardware, so the screen is the same. Every `adb` and Maestro call targets
it, so another emulator or phone can stay connected.

`run.sh` **wipes the local database** on every run (`supabase db reset` and
then the e2e seed). It stops the e2e app first: one left open by an earlier
run would talk to the database while it's reset, e.g. writing back premium
from that run's purchase.

`swap-bundle.sh` is for changes to JS only, app code or a package without
native code. It bundles and compiles the JS like the Gradle build, swaps it
into `build/e2e/matamim-e2e.apk` and re-signs it with the same debug key,
keeping the previous APK as `matamim-e2e.before-swap.apk`. Native code stays
what the last `build-android.sh` compiled, so run that before trusting a
full suite for a release.

Optional: `supabase/functions/.env.e2e` (gitignored, see `.env.e2e.example`)
overrides `supabase/functions/.env` during runs, e.g. a separate
`ANTHROPIC_API_KEY`.

## Store screenshots

```sh
scripts/e2e/screenshots.sh   # wipes the local database, like run.sh
```

Captures the App Store and Play screenshots in English and Hebrew into
`store/screenshots/raw/` (gitignored), e.g. `en-01-recipes.png` …
`he-06-create.png`. It's not a test: `Maestro/screenshots/` is outside
`flows/`, so the suite doesn't run it.

- Data: `supabase/e2e/screenshots.sql`, loaded only when
  `E2E_SCREENSHOTS=1`. It holds two copies of one kitchen, an English one
  and a Hebrew one. Each has a premium host with cloud sync on (Dana /
  דנה, ids `…0060` / `…0070`), a premium teammate who shares two recipes
  (Tom / תום, `…0061` / `…0071`) and three free members, all with
  `@example.com` emails. The team screen is captured as the teammate,
  since the host's view shows emails and remove buttons. Everything else
  is captured as the host.
- Photos: one per dish in `store/screenshots/photos/`, named after
  `DEMO_DISHES` in `scripts/e2e/env.sh` (`shakshuka.jpg` …). jpg, png or
  webp; `seed.sh` turns them into JPEGs of at most 1600 px. The script
  stops first if one is missing.
- Status bar: Android demo mode (09:41, full battery and Wi-Fi), turned
  off when the script exits. Demo mode doesn't hide notification icons,
  such as Safety Center's "no screen lock" shield, so the script snoozes
  every notification for 3 hours.
- Hebrew: the flow logs in in English, then switches the language from the
  recipes screen, and the app reloads right to left.
- Screens: `Maestro/screenshots/capture.yaml`, opening the app as each
  account through `open-as.yaml`. Each screen's texts in both languages
  are in `all.yaml`.

## Guardrails against production

| Layer | Guard |
| --- | --- |
| Build | `build-android.sh` overrides `EXPO_PUBLIC_SUPABASE_*` with local values, so the prod URL and key never enter the bundle |
| Build | The APK's JS bundle is checked for the prod host (read from `.env`). The build fails if it's there |
| App | `utils/e2e.ts`: an e2e build throws at startup unless the Supabase URL is `127.0.0.1`, `localhost` or `10.0.2.2` |
| App | `app.config.ts`: OTA updates off, so a published update can't replace the e2e bundle |
| App | Separate package and scheme (`ourrecipes-e2e`), so flows can't drive the real app |
| App | Sentry off (DSN kept out of the bundle, checked like the prod host), RevenueCat Test Store key |
| App | Manifest-only `android:debuggable` so RevenueCat accepts the Test Store key. The build type stays release, so `BuildConfig.DEBUG` and dev support stay off |
| Run | `run.sh` checks that local Supabase is on loopback and re-checks the APK before seeding or running |
| Run | Device reaches the host only via `adb reverse tcp:54321` |
| Run | `run.sh` restarts Kong after serving the functions and checks Auth's email templates are served, or emails have no code (see caveats) |

## Seed

`supabase/e2e/seed.sql` is loaded on a reset database (`--no-seed`, the dev seed `supabase/seed.sql` is not used). Data is added
together with the flow that needs it.

Each flow that logs in has its own account, so a flow that changes or
deletes one can't affect another. All use the password `e2e-password-1`.
Seeded rows have ids starting with `e2e`.

| Account | Id ends | Used by |
| --- | --- | --- |
| `owner@e2e.test` (E2E Owner) | `…0001` | `account/login.yaml`, an existing email in `account/signup.yaml` and `free/change-email.yaml`. Premium in RevenueCat from earlier runs, so not used as a free account |
| `member@e2e.test` (E2E Member) | `…0002` | — |
| `local@e2e.test` (Local Cook) | `…0003` | `free/local-recipes.yaml` |
| `buyer@e2e.test` (Buyer Cook) | `…0004` | `free/premium-purchase.yaml`, which deletes it from RevenueCat first |
| `filters@e2e.test` (Filter Cook) | `…0005` | `free/filters.yaml`. A member of teamhost@'s team |
| `settings@e2e.test` (Settings Cook) | `…0006` | `free/account-settings.yaml` |
| `email@e2e.test` (Email Cook) | `…0007` | `free/change-email.yaml` |
| `password@e2e.test` (Password Cook) | `…0008` | `free/change-password.yaml` |
| `delete@e2e.test` (Delete Cook) | `…0009` | `free/delete-account.yaml`: a lapsed subscriber in keeper@'s team, with recipes, a photo in Storage, an expired entitlement and AI import rows |
| `keeper@e2e.test` (Keeper Cook) | `…0010` | `free/delete-account.yaml`: premium, hosts the team, the same kinds of rows, which must survive delete@'s deletion |
| `gone@e2e.test` (Gone Cook) | `…0011` | `free/delete-account-message.yaml` |
| `teamhost@e2e.test` (Team Host) | `…0012` | `free/filters.yaml`: premium, cloud sync on, hosts filters@'s team with a lunch tagged "Breakfast" and "Dinner" and a breakfast called "Dinner Rolls". `premium/sync-off.yaml` checks the purge keeps its cloud copy |
| `upload@e2e.test` (Upload Cook) | `…0013` | `premium/turn-on-sync.yaml`: premium, cloud sync off, nothing in the cloud |
| `cloud@e2e.test` (Cloud Cook) | `…0014` | `premium/fresh-install.yaml`: premium, cloud sync on, Magenta Soup (magenta photo) and Cloud Bread in the cloud, and Removed Stew, deleted |
| `offline@e2e.test` (Offline Cook) | `…0015` | `premium/offline.yaml`: premium, cloud sync on, Magenta Soup (magenta photo) and Offline Bread in the cloud |
| `syncoff@e2e.test` (Syncoff Cook) | `…0016` | `premium/sync-off.yaml`: premium, cloud sync on, Magenta Soup (magenta photo) and Syncoff Bread in the cloud |
| `editor@e2e.test` (Editor Cook) | `…0017` | `premium/edit-delete.yaml`: premium, cloud sync on, Editor Soup, Magenta Pie (magenta photo) and Editor Bread in the cloud |
| `sharer@e2e.test` (Sharer Cook) | `…0018` | `premium/team-purge.yaml`: premium, cloud sync on, hosts Sharing Team with Shared Stew in the cloud |
| `teammate@e2e.test` (Teammate Cook) | `…0019` | `premium/team-purge.yaml`: a free member of sharer@'s team |
| `lapsed@e2e.test` (Lapsed Cook) | `…0020` | `premium/sync-off.yaml`: premium ended 31 days ago, cloud sync still on, so the purge deletes its cloud copy |
| `grace@e2e.test` (Grace Cook) | `…0021` | `premium/sync-off.yaml`: premium, cloud sync off for 29 days, so the purge keeps its cloud copy |
| `creator@e2e.test` (Creator Cook) | `…0022` | `team/create-team.yaml`: premium, cloud sync on, no team |
| `joinhost@e2e.test` (Join Host) | `…0023` | `team/join-team.yaml`: premium, cloud sync on, hosts Join Team with Welcome Soup |
| `joiner@e2e.test` (Joiner Cook) | `…0024` | `team/join-team.yaml`: free, no team |
| `otherhost@e2e.test` (Other Host) | `…0025` | `team/join-team.yaml`: premium, hosts Other Team (only used through the probe) |
| `sharehost@e2e.test` (Share Host) | `…0026` | `team/shared-recipes.yaml`: premium, cloud sync on, hosts Share Team with Host Pie (magenta photo), Host Soup (Beans) and Host Bread |
| `viewer@e2e.test` (Share Viewer) | `…0027` | `team/shared-recipes.yaml`: free, member of Share Team |
| `sharemate@e2e.test` (Share Mate) | `…0028` | `team/shared-recipes.yaml`: premium, cloud sync on, member of Share Team with Mate Curry |
| `latejoin@e2e.test` (Late Joiner) | `…0029` | `team/shared-recipes.yaml`: free, no team (joins through the probe) |
| `rehost@e2e.test` (Reinstall Host) | `…0030` | `team/reinstall.yaml`: premium, cloud sync on, hosts Reinstall Team with Host Lasagna |
| `remember@e2e.test` (Reinstall Member) | `…0031` | `team/reinstall.yaml`: premium, cloud sync on, member of Reinstall Team with Member Tacos |
| `leavehost@e2e.test` (Leave Host) | `…0032` | `team/member-leaves.yaml`: premium, cloud sync on, hosts Leave Team with Host Stew |
| `leaver@e2e.test` (Leaver Cook) | `…0033` | `team/member-leaves.yaml`: premium, cloud sync on, member with Leaver Curry |
| `stayer@e2e.test` (Stayer Cook) | `…0034` | `team/member-leaves.yaml`: free member |
| `quitter@e2e.test` (Quitter Cook) | `…0035` | `team/member-leaves.yaml`: premium, cloud sync on, member with Quitter Pasta (leaves through the probe) |
| `movehost@e2e.test` (Transfer Host) | `…0036` | `team/host-leaves.yaml`: premium, cloud sync on, hosts Transfer Team with Old Host Soup |
| `oldlapsed@e2e.test` (Lapsed Member) | `…0037` | `team/host-leaves.yaml`: member since 4 days, premium ended 10 days ago |
| `earlyfree@e2e.test` (Early Free) | `…0038` | `team/host-leaves.yaml`: free member since 3 days |
| `firstprem@e2e.test` (First Premium) | `…0039` | `team/host-leaves.yaml`: premium, cloud sync on, member since 2 days with First Pie. Takes over Transfer Team |
| `secondprem@e2e.test` (Second Premium) | `…0040` | `team/host-leaves.yaml`: premium member since 1 day |
| `delhost@e2e.test` (Delete Host) | `…0041` | `team/host-leaves.yaml`: premium, hosts Heir Team, deletes its account |
| `heir@e2e.test` (Heir Cook) | `…0042` | `team/host-leaves.yaml`: premium member of Heir Team since 2 days. Takes over when delhost@ is deleted |
| `lateheir@e2e.test` (Late Heir) | `…0043` | `team/host-leaves.yaml`: premium member of Heir Team since 1 day |
| `solohost@e2e.test` (Solo Host) | `…0044` | `team/team-deleted.yaml`: premium, cloud sync on, hosts Solo Team with Solo Pie (leaves through the probe) |
| `solofree@e2e.test` (Free Member) | `…0045` | `team/team-deleted.yaml`: free member of Solo Team |
| `soloexpired@e2e.test` (Expired Member) | `…0046` | `team/team-deleted.yaml`: member, premium ended 10 days ago |
| `rmhost@e2e.test` (Remove Host) | `…0047` | `team/remove-member.yaml`: premium, cloud sync on, hosts Remove Team with Remove Host Pie |
| `removed@e2e.test` (Removed Cook) | `…0048` | `team/remove-member.yaml`: free member |
| `kept@e2e.test` (Kept Cook) | `…0049` | `team/remove-member.yaml`: free member |
| `kicked@e2e.test` (Kicked Cook) | `…0050` | `team/remove-member.yaml`: free member (removed through the probe) |
| `forgot@e2e.test` (Forgot Cook) | `…0051` | `account/forgot-password.yaml`, free, resets its password |

The team flows' accounts (22–50) are listed above; the premium ones are premium in the database, and a flow that logs one in gives it RevenueCat premium first. Host Pie's magenta photo is the team flows' one.

The magenta photos are uploaded to Storage by `scripts/e2e/seed.sh`. All
premium accounts are premium in the database, and each premium flow first
gives its account lifetime premium in RevenueCat (`scripts/revenuecat-grant.js`)
if it doesn't have it yet, since the app checks RevenueCat too.

Signup emails are caught by the local Mailpit (`supabase status` →
`MAILPIT_URL`). Flows can read the real code from there.

## Host probe

`scripts/e2e/probe.py` runs on `127.0.0.1:54399` during a run. Flows call it
through `Maestro/scripts/*.js` (Maestro's `runScript` runs on the host):

- requests that reached local Supabase, from Kong's access log
- row counts in local tables, leaving out the seed's rows
- the recipes in the app's own storage (MMKV, read with `run-as`, which the
  e2e build's debuggable manifest allows), so "deleted" means deleted and
  not just hidden, and how many changes wait to upload
- whether the app's window keeps the screen on (`dumpsys window`)
- an account's rows in every table that references a user, Auth's and
  Storage's included. It also reports any foreign key to a user it doesn't
  count, so a new table can't be missed
- an account's email and name in Auth and in `profiles`, and its premium in
  `premium_entitlements` and in RevenueCat's API
- deleting a seeded account's customer from RevenueCat (refused for any id
  that isn't a seeded one)
- moving an account's emailed codes' sent time back, to check expiry
  without waiting
- checking a code or a password login straight against local Auth
- cutting the device off (Wi-Fi, mobile data and `adb reverse`) and reconnecting it
- whether the device can reach the internet
- giving a seeded account lifetime premium in RevenueCat, unless it has it
- an account's recipes and photos in the cloud, and its cloud sync state
  (on or off, and since when)
- moving the time cloud sync was turned off back, and running the nightly
  purge of cloud copies and the cleanup of photos no recipe points to,
  instead of waiting 30 days or a night
- the photo copies the app keeps on the device while cloud sync is off, and
  every photo file the app has: expo-image's cache of downloaded ones, its
  own photos not uploaded yet, and those copies
- putting an all-magenta photo in the device's gallery, the only one, and
  the share of the screen in that color, to tell a photo is shown (no
  screen of the app has magenta)
- adding a recipe the way another device logged in to the account would
- calling a team edge function (`generate-invite`, `join-team`, `leave-team`,
  `edit-team`, `remove-member`) as a seeded account, without raising on a
  refusal (`as-user.js`)
- a team's title, host, members, unexpired invites and invite rows
  (`probe-team.js`), and making its invites expire without waiting 5 minutes
  (`age-invites.js`, which moves `expires_at`: invites have no created time)
- editing or deleting an account's recipe the way another device would
  (`other-device-edit.js`; the database bumps `updated_at` on every update)
- the live recipes an account can read through the API, to check row level
  security (`probe-visible-recipes.js`)
- moving the cursor to the end of the focused field. `eraseText` only
  deletes before the cursor, and a tap leaves it where it landed, so
  `subflows/replace-text.yaml` uses this to clear a field

## Known caveats

- Edge functions use the Upstash Redis from `functions/.env` for rate
  limiting. Override it in `.env.e2e` if that Redis is shared with production.
- `build-android.sh` regenerates `android/` for the e2e app id, and restores
  it when it exits. If a build is killed hard, run
  `npx expo prebuild --platform android --clean` before a normal build.
- Flows assert on English text. `run.sh` checks the device language, since a
  per-app locale is reset by `clearState`.
- Chrome's first-run screen is skipped by `subflows/dismiss-chrome-first-run.yaml`.
  Subflows live outside `flows/` so they don't run as tests.
- Airplane mode alone leaves the emulator's Wi-Fi on, and `adb reverse` works
  without any network. Offline checks go through the probe instead.
- Removing `adb reverse` only refuses new connections. The app keeps its
  connection to Kong open between requests, and that one kept working, so
  an edit "offline" was uploaded. The probe's network off also restarts
  Kong to close it (a few seconds).
- Guest recipes are queued to upload once a user logs in and cloud sync is
  on (`waitForSet` in `stores/recipeStore.ts`). The guest flows prove nothing
  is sent while a guest, and `account/login.yaml` that a guest's recipe stays
  on the device after logging in with cloud sync off, and now belongs to the
  account in the app's storage.
- A free account's recipes stay queued to upload, and logging out with a
  queued upload restarts the app to drop the queue. So a free user with a
  recipe lands on the guest recipes screen after logging out, not the login
  form, and without the "logged out" toast. Accepted as is.
- RevenueCat's Test Store keeps purchases per customer across runs, and the
  customer id is the Supabase user id, which is fixed for seeded accounts.
  `free/premium-purchase.yaml` deletes buyer@'s customer from RevenueCat
  first (the project production uses too, but only that test customer).
  Right after, RevenueCat can still answer with the deleted purchase for a
  while, so the flow waits until it reports the account free.
- The edge functions reach Upstash and RevenueCat from Docker. A VPN that
  turns off IPv4 forwarding (`net.ipv4.ip_forward = 0`) cuts them off, and
  `sync-premium` hangs until Kong answers 502. Fix with
  `sudo sysctl -w net.ipv4.ip_forward=1`.
- `supabase functions serve` reloads Kong without the server for Auth's
  email templates (port 8088). Auth then sends Supabase's default emails,
  with a link and no code. `run.sh` restarts Kong to bring it back. The same
  happens during development whenever the functions are served.
- Signup codes are read from Mailpit's API by `scripts/mailpit-code.js`.
  Flows clear their address's emails first (`scripts/mailpit-clear.js`).
- Legend-State 3.0.0-beta.47 is patched (`patches/`, applied by
  `patch-package` on install): after uploading one save that changed
  several fields of a recipe, its CRUD plugin cleared only one of them from
  the pending changes, so the recipe looked unsynced (bug (a) below). Still
  unfixed upstream in beta.48. Check the patch when upgrading.
- A team member row (`team-member`) is one accessible node whose label is
  `name, email, Premium, Head chef` (parts that don't apply left out). React
  Native flattens the row's children on Android, so `containsDescendants`
  can't match it. Match the whole label with `text:`.
- `signup_flow.yaml` is an old recorded draft, outside `flows/`, and is not
  run.

## Progress

| # | Flow | File | Status | Notes |
| --- | --- | --- | --- | --- |
| 0 | Foundation: e2e build, guardrails, seed, runner | `scripts/e2e/` | Done | APK built and verified, `run.sh` runs end to end |
| 1 | Guest first launch: recipes screen, guest with nothing stored, team locked, login form | `flows/guest/first-launch.yaml` | Passing, reviewed | ~25 s, tagged `smoke` |
| 2 | Guest premium: plans with yearly "Best value" selected, purchase and restore need login, legal pages, "Log in" opens the login form | `flows/guest/premium.yaml` | Passing, reviewed | ~2 min, live RevenueCat Test Store and matamim.org |
| 3 | Guest creates a recipe: form opens in edit mode, required fields refused one by one, recipe created and saved as entered, no requests at all to Supabase and no rows, survives a relaunch | `flows/guest/create-recipe.yaml` | Passing, reviewed | ~3.5 min, tagged `smoke` |
| 4 | Guest AI import is locked: from the form and from the create menu's link and photo options | `flows/guest/import-locked.yaml` | Passing, reviewed | ~50 s |
| 5 | Guest drafts and offline: draft survives tabs, saved recipes show on an offline relaunch, draft survives opening a recipe, and creating a restored draft leaves an empty form | `flows/guest/draft-persistence.yaml` | Passing, reviewed | Checks 8 and 10 are new or changed |
| 6 | Blank required fields (spaces-only title, empty ingredient and step rows) are refused. Blank rows are dropped when saving and the rest renumbered, a title is saved trimmed, an ingredient with an amount or unit but no name is refused once, and saving an edit checks the same (a spaces-only title is refused, an added empty row isn't kept or shown), all read from the device's storage | `flows/guest/create-recipe-blank-fields.yaml` | Passing, reviewed | No longer `known-bug` |
| 7 | Guest edits a recipe: save refused without a title, every field but the photo edited and saved, shown on the card, on reopen and after a relaunch, unsaved changes ask before being discarded, nothing sent to Supabase | `flows/guest/edit-recipe.yaml` | Passing, reviewed | ~4.5 min |
| 8 | Guest deletes a recipe: asks first, back on the recipes screen without it, still gone after a relaunch, nothing sent to Supabase | `flows/guest/delete-recipe.yaml` | Passing, reviewed | ~1.5 min |
| 9 | Sign up: log in and sign up forms switch, invalid fields refused one at a time, existing email refused, code screen refuses empty, short and wrong codes, back to sign up sends a new code, "Send a new code" emails another, the newest confirms. Then signed in: greeting, restore and purchase without a login prompt, AI imports open with 3 free imports, Account shows the account, session survives a relaunch. The profile only exists once confirmed | `flows/account/signup.yaml` | Passing, reviewed | ~9 min, real codes from Mailpit, live RevenueCat Test Store |
| 10 | Log in: empty fields refused, a wrong password and an unknown email get the same message (each attempt shown to reach Auth), the right account logs in with spaces around the email, "Welcome back", Account shows the account, recipes greet it, the guest's recipe is kept after a relaunch, now belongs to the account in the app's storage, and nothing of it is uploaded (cloud sync is off) | `flows/account/login.yaml` | Passing, reviewed | ~2.5 min, tagged `smoke` |
| 11 | Free account's recipes: created under the account in the app's storage, nothing uploaded, kept with the session after a relaunch. Logout warns, Cancel keeps the recipe and the session, confirming leaves no recipes in storage (not just hidden), revokes the session on the server, and stays so after a relaunch | `flows/free/local-recipes.yaml` | Passing, reviewed | ~2.5 min, tagged `smoke`. Lands on the guest recipes screen (accepted restart, see caveats) |
| 12 | Buying Premium: no login prompt, a failed purchase says so and leaves the account free (Purchase still offered, cloud sync locked, nothing in the database or RevenueCat), a successful one makes it premium in the app, the database and RevenueCat, kept after a relaunch | `flows/free/premium-purchase.yaml` | Passing, reviewed | ~2.5 min, live RevenueCat Test Store, resets buyer@ there first |
| 13 | Search and meal filters, on the account's 4 recipes and its team's 2: search by part of the title in any case, trimmed, titles only, no-match message, cleared. Each meal shows only recipes saved with it, not ones tagged with it or named after it, tapping again shows all. Meal and search together | `flows/free/filters.yaml` | Passing, reviewed | ~6.5 min |
| 14 | Account settings: keep screen on sets Android's keep-screen-on flag on an open recipe only, off and on, kept after a relaunch. Cloud sync needs Premium ("Go Premium" opens it), Shared team needs cloud sync, both stay off, no team on the server. Change username refuses what sign up refuses, saves 30 letters, saves a name trimmed in Auth and `profiles`, "Name updated", greeting updated, kept after a relaunch | `flows/free/account-settings.yaml` | Passing, reviewed | ~5 min |
| 15 | Change email: empty, invalid, the current email and another account's are refused, with no code sent. Both addresses get a code, the new address's code is refused in the current address's step, "Send a new code" replaces both, the old ones are refused, one code alone changes nothing, both newest change it in Auth and `profiles`, a used code is refused, login works with the new email only, kept after a relaunch | `flows/free/change-email.yaml` | Passing, reviewed | ~3 min, real codes from Mailpit |
| 16 | Change password: a code is emailed, empty, short, non-English and mismatched passwords are refused, a wrong code and a replaced code are refused, a code is refused at 3700 s old and accepted at 3500 s, the current password is refused without asking for the code again, then saved: login works with the new password only, the used code is refused, still logged in after a relaunch | `flows/free/change-password.yaml` | Passing, reviewed | ~5 min, real codes from Mailpit |
| 17 | Delete account: asks first, Cancel deletes nothing, then the account's rows are gone from every table that references a user (Auth and Storage included), the team's host keeps all of its own, the device has no recipes (the team's included), login is refused, still a guest after a relaunch | `flows/free/delete-account.yaml` | Passing, reviewed | ~2 min. A deleted team host isn't covered yet (premium flows) |
| 18 | Deleting the account says "Your account was deleted" | `flows/free/delete-account-message.yaml` | Passing, reviewed | No longer `known-bug`. Checks the deletion worked first, the message stays up until dismissed and doesn't come back after a relaunch |
| 19 | Turning cloud sync on: with it off, recipes (one with a photo) stay on the device with the gray chip and nothing is sent. Turned on without a dialog and saved on the server, both recipes and the photo upload and the cards turn orange, a new recipe with a photo uploads right away, still on and nothing duplicated after a relaunch | `flows/premium/turn-on-sync.yaml` | Passing, reviewed | ~4.5 min, tagged `premium` |
| 20 | Fresh install: nothing on the device, after logging in the cloud's recipes and photo come down, orange chips, the recipe as saved, a deleted one doesn't, cloud sync shows on. Logout doesn't ask and says so, removes the recipes and the photo's files from the device only, still so after a relaunch, logging in brings them back | `flows/premium/fresh-install.yaml` | Passing, reviewed | ~1.5 min, tagged `premium` |
| 21 | Local first and offline: a relaunch only fetches what changed (no full download, id check or photo), a recipe from another device comes down on the next launch, offline a relaunch shows all recipes with orange chips and the photo, nothing reaches Supabase meanwhile. A recipe created offline has the gray chip, stays gray, and uploads by itself once back online, then nothing waits to upload and logout doesn't warn | `flows/premium/offline.yaml` | Passing, reviewed | ~3 min, tagged `premium`. Failed on bug (b) until fixed |
| 22 | Turning cloud sync off: asks first (30 days), Cancel keeps it on. Off on the server with the countdown, cloud untouched, gray chips, photo copied to the device. Changes while off stay on the device. Back on within 30 days uploads only the changes, drops the device's photo copy, orange chips. Off for over 30 days, the purge deletes the cloud rows then the photo (also for premium ended 31 days ago, not for off 29 days or on), the device keeps everything. Turned on again re-uploads all with the same ids and photo path, no duplicates | `flows/premium/sync-off.yaml` | Passing, reviewed | ~3.5 min, tagged `premium`. The feature was built for this flow |
| 23 | A team's host turns cloud sync off: the teammate sees the shared recipe, the host is warned the team loses it in 30 days, the teammate still sees it within them, and loses it from its device on the next launch once the cloud copy is purged | `flows/premium/team-purge.yaml` | Passing, reviewed | ~2 min, tagged `premium` |
| 24 | Edits and deletions reach the cloud: an edit of title, meal and ingredient is saved to the same row, a new photo replaces the old one in Storage, a deleted recipe is marked deleted and its photo removed, nothing waits to upload after it (without a relaunch), an edit made offline isn't sent until back online, deleted recipes don't come back after a relaunch, logout doesn't warn | `flows/premium/edit-delete.yaml` | Passing, reviewed | ~3 min, tagged `premium`. Failed on bug (a) before the fix |
| 25 | Create a team: Team tab locked without one, Shared team on creates "New team" with the account as Premium Head chef, rename saved and an empty name refused, one 8-digit invite valid ~5 min, same when reopened, new once expired (old deleted), a host can't join another team, kept after a relaunch with the toggle locked, delete asks first, then toggle unlocked and tab locked, a new toggle makes a different team | `flows/team/create-team.yaml` | Passing, reviewed | tagged `team` |
| 26 | Join a team: a code that doesn't exist and an expired one are refused and nothing is joined, a valid one joins (title, 2 members, host Premium and Head chef without an email, own row without Premium). A member has no edit or invite controls and the server refuses edit-team, generate-invite and remove-member, leaving the team unchanged. Team recipe shown, a second team refused, Shared team on and locked, all kept after a relaunch | `flows/team/join-team.yaml` | Passing, reviewed | tagged `team`. That the 8 digits stay after a refusal isn't asserted (no testID) |
| 27 | Shared recipes: a free member sees the host's and the other member's recipes, opens them with the photo and the owner's name and without Edit and Delete, its own recipe has them and never reaches the cloud or the teammate. A host's edit and delete show after pull to refresh, on screen and on the device. The team screen changes only on its refresh button (rename, new member). Another member sees the current recipes and nothing of the first member's | `flows/team/shared-recipes.yaml` | Passing, reviewed | tagged `team`. The pull to refresh is a swipe, the first in the suite, may need tuning |
| 28 | Reinstall: a team member and then its host log in on a fresh install. Shared team turns on by itself and is locked, the team shows with 2 members, the host as Premium Head chef (no email for a member, with the member's email for the host), the member has no host controls and the host has them. Own recipes come from the cloud and the team's from the team, on screen and on the device | `flows/team/reinstall.yaml` | Passing, reviewed | tagged `team` |
| 29 | Members leave: a member who leaves through the server disappears from a teammate's pull to refresh (its recipe gone from the screen and from the device, which had it cached) and from the team screen. A member who leaves in the app is asked first (Cancel keeps it), is told, gets Shared team off and unlocked, keeps its own recipe in the cloud and on the device and loses the team's. Shared team on makes it the Premium head chef of a new team. The teammate logging in again sees 2 members and only the host's recipe | `flows/team/member-leaves.yaml` | Passing, reviewed | tagged `team`. The leave dialog is found by its message, its title is also the team's name |
| 30 | The host leaves: asked first with the hand-over message (Cancel changes nothing), told "Another member manages it now", Shared team off and unlocked. The oldest Premium member (not an earlier lapsed or free one) becomes host and the rest stay members. The new host sees the host controls and 4 members. A host who deletes the account hands the team over the same way | `flows/team/host-leaves.yaml` | Passing, reviewed | tagged `team`. A premium account stays on Account after deleting (a free one restarts). Heir Team's oldest member is also premium, so the premium filter is covered only by the leave case |
| 31 | The team is deleted under a member: the host leaves and no Premium member is left (outcome deleted). The member's screen shows the team until it taps the refresh button, which then says the team was deleted or it was removed, sends it to Account with Shared team off and unlocked and the Team tab locked, and the team's recipe is gone from the recipes and the device | `flows/team/team-deleted.yaml` | Passing, reviewed | tagged `team`. The refresh button is enough, no pull to refresh needed |
| 32 | The host removes members: each member's row shows its email and a remove button (none on the host's row), removing asks first (Cancel keeps all), then removes with a toast and "Members: 3", the server agrees, and with only free members the host's leave button offers to delete the team. A removed member who refreshes is told, lands on Account with Shared team off and unlocked, and loses the team's recipe from the screen and the device | `flows/team/remove-member.yaml` | Passing, reviewed | tagged `team`. The remove buttons are children of their member rows |
| 33 | Leaving an edit asks first: opening another recipe from the recipes screen, the create menu's "New recipe" and its link import each ask "Discard changes?". Keep editing stays on the recipe in edit mode with the change (and drops the pending import), Discard goes on (the import's "log in" alert, the empty form, the other recipe) and the saved title is kept. With no changes nothing is asked. A photo picked during the edit is removed from the device by Discard. The system back gesture goes to the recipes screen without asking and the edit is still there when the recipe is opened again | `flows/guest/edit-leave.yaml` | Passing, reviewed | tagged `guest` |
| 34 | Forgot password: an empty and an invalid email are refused without asking Auth, an email without an account gets the same answer and no email, the account gets a code. Empty fields, a code that isn't 6 digits and mismatched passwords are refused before Auth is asked. A wrong code, a replaced code and a code over an hour old are refused, each changing nothing. The newest code under the hour and a new password log the account in, "Your password was changed!", the new password works and the old doesn't, kept after a relaunch. A used code is refused, never because it was replaced or expired: the reset's code by the probe right after (its sent time put back), and in the app after logging out a fresh code that the probe accepted once. In the app the old password is refused and the new one logs in | `flows/account/forgot-password.yaml` | Passing, reviewed | tagged `account`, real codes from Mailpit, forgot@ |

## Bugs found by e2e work

| Found in | Bug | Status |
| --- | --- | --- |
| Foundation | All RevenueCat keys in `.env` are the Test Store key. RevenueCat closes any non-debuggable build using it, so a local release build closes at launch | Open (e2e works around it with a debuggable manifest) |
| Flow 3 planning | **Draft lost after opening a recipe.** The create screen and the recipe screen are the same tab (`app/(tabs)/[id].tsx`). Opening an existing recipe changes `id`, and going back to `new` runs `setCurrentRecipe("new")`, which resets the form to `EMPTY_RECIPE`. Confirmed on the device | Fixed: `app/(tabs)/[id].tsx` keeps a copy of the new recipe form in memory when another recipe opens and gives it back when the form opens again. It is dropped when the logged in user changes. Covered by `guest/draft-persistence.yaml` (checks 8 and 10) |
| Flow 3 planning | **Required fields accept blank content.** `checkInput` in `utils/recipeEditor.ts` only checks that ingredients and steps have at least one row, so empty rows pass, and a title of only spaces passes. Confirmed on the device | Fixed: `utils/recipeEditor.ts` trims the title, drops blank rows (renumbering the rest) and refuses an ingredient with no name, for create and edit alike. Covered by `guest/create-recipe-blank-fields.yaml` |
| Flow 1 | `supabase/seed.sql` fails on `supabase db reset` with `TEAM_PREMIUM_REQUIRED`: it creates a team for a user without premium | Fixed: the dev seed inserts a lifetime `premium_entitlements` row for the dev account before the team. Not run since |
| Flow 7 | **Edited ingredients not saved.** Editing was saved by a 2 s timer that handed the screen's own lists to the store. After reopening, the ingredients showed their old values while the other fields were new | Fixed: the timer is replaced by a Save button that saves a copy |
| Flow 7 | **Edit could remove the title.** Creating refused a recipe without a title, but an edit without one was saved | Fixed: Save uses the same validation as Create |
| Flow 7 | **Blank screen after tapping Edit.** Creating a recipe, opening it and tapping Edit in the same session blanked the whole screen, without a crash or a JS error. The ingredients and steps lists are hidden with `display: "none"` and shown with no style. RN makes a hidden View a native view and flattens a plain one away, and switching between the two while the rows changed broke Android's view tree (`Unable to find viewState for tag`, then `Unable to remove a view from a view that is not a ViewGroup`), which stopped all drawing | Fixed: the two list wrappers in `app/(tabs)/[id].tsx` are `collapsable={false}`. Covered by `guest/edit-recipe.yaml`, which failed 2 of 2 before and passed 2 of 2 after |
| Flow 7 review | **Edits dropped without asking when leaving another way.** The discard prompt covers Back and the edit button. Leaving edit mode by opening another recipe (tab bar, share or import) drops the edit silently, and a photo picked during the edit is left as an unused file | Fixed: the `id` change in `app/(tabs)/[id].tsx` asks with the same "Discard changes?" alert, for every way in. Covered by `guest/edit-leave.yaml` |
| Flow 27 (shared-recipes) | **Crash on pull to refresh when the host deleted a team recipe.** A member's recipes list showed "Something went wrong" after pull to refresh, once the host had deleted one team recipe and edited another from another device. Logcat: `TEAM_RECIPES_GONE_FROM_SERVER` count 1, `TEAM_RECIPES_FULL_RESYNC`, then `APP_CRASHED` "Cannot read property 'startsWith' of undefined" in a list row (`RecipeList.tsx` passes `item.image` to `imageSource`, so a row without `image` is the likely trigger). Cause: a full fetch (after the resync) sets the rows as one object, which leaves Legend-State's delete marker, a symbol, in the store for each deleted recipe; `getTeamRecipes` only skipped null, so the symbol reached the list. Repro: `flows/team/shared-recipes.yaml` step 4 (seed, then viewer@ opens the recipes list, `other-device-edit` deletes Host Bread and renames Host Soup as sharehost@, pull to refresh) | Fixed in `getTeamRecipes` (`stores/recipeStore.ts`: non-object values are skipped), covered by `team/shared-recipes.yaml` step 4 |
| Flow 27 (shared-recipes) | `seed.sh` failed at the photo upload (502 from Kong) after a database reset: the reset restarts Storage on a new address and Kong kept the old one | Fixed in `seed.sh` (restarts Kong after the reset), test setup only |
| Flow 9 | **Restore never finishes for a new account after a cancelled purchase.** A just signed up account opens Purchase, cancels the Test Store dialog, then taps "Restore purchase": `Purchases.restorePurchases()` never returns, so no toast and no alert, and nothing shows it's working. 2 of 2 runs. The seeded account (known to RevenueCat from earlier runs) restores in ~5 s after the same steps. Unknown whether it's the app or the Test Store. Restore also has no loading state or timeout | Mitigated: Restore shows a spinner, ignores taps while it runs and gives up after 30 s with "This is taking too long" (`app/(tabs)/premium.tsx`). The cause in the SDK or the Test Store is unknown. `account/signup.yaml` still restores before purchasing. The timeout isn't covered by a flow (a hang can't be forced) |
| Flow 9 | Local Auth emails had no code (see caveats) | Fixed in `run.sh`, test setup only |
| Flow 10 | **Spaces around the email broke login and sign up.** Validation trimmed the email but login and sign up sent it as typed, and Auth refuses it, so a keyboard's trailing space after a suggested email gave "Wrong email or password" | Fixed: `handleSubmit` in `app/(tabs)/account.tsx` trims it. Covered by `account/login.yaml` and `account/signup.yaml` |
| Free flows planning | **Change username saved spaces and showed two toasts.** The name was checked without surrounding spaces but saved as typed, in Auth and `profiles`. Saving showed "Username changed!" and immediately replaced it with "Name updated". Sign up also saved the full name untrimmed | Fixed: both save the trimmed name, only "Name updated" is shown. Covered by `free/account-settings.yaml` |
| Free flows planning | **Meal filters also matched tags.** A recipe showed under a meal if one of its tags contained the meal's name (case-sensitive), e.g. a lunch tagged "Dinner party" under Dinner | Fixed: meals filter by the recipe's meal only. Covered by `free/filters.yaml` with a seeded team recipe tagged with other meals |
| Flow 11 | **Logging out a free user with recipes restarts the app.** Its recipes wait in the upload queue, and logout restarts the app to drop the queue, so it lands on the guest recipes screen, not the login form, without the "logged out" toast | Accepted as is |
| Flow 18 | **Deleting the account doesn't say so.** Deleting logs out, and for a free user with a recipe that restarts the app, which drops the "Your account was deleted" message. The account is deleted correctly | Fixed: `logoutUser` takes a notice, saves it in MMKV before the restart and `app/_layout.tsx` shows it once on launch (without a restart it's shown at once). Covered by `free/delete-account-message.yaml`, dismissed in `free/delete-account.yaml` and `team/host-leaves.yaml` |
| Flow 24 | **(a) Edits stay pending.** After a save that changed a recipe's title, meal and ingredient with cloud sync on, the upload succeeded and the cloud had all three, but Legend-State still listed the meal and ingredients as pending. The card stayed gray "Saved only on this device", and logout warned about unsynced recipes and restarted the app. Its CRUD plugin cleared only one change per recipe after an upload | Fixed by patching Legend-State (see caveats). Covered by `premium/edit-delete.yaml`, passing |
| Flow 21 | **(b) Recipe created offline showed "Saved in the cloud".** With cloud sync on and no connection, a new recipe showed the orange chip before uploading (nothing was lost, it uploaded on reconnecting). The pending changes are saved a moment after the store changes and aren't observable, and the pending upload count doesn't move offline, so the chip read them too early | Fixed: `metadataSaves$` in `utils/persistStorage.ts` counts saves of the sync metadata, and `useIsInCloud` re-reads on it. Covered by `premium/offline.yaml`, passing |
| Team flows planning | **The host's leave dialog always said "Delete team".** The trash icon warned "All members will leave it" even when a Premium member exists and the team is handed over to them (`leave_team()` promotes the oldest one) | Fixed: with a Premium member the dialog says "Leave team" with a message about the hand-over (`team.leave.transferMessage`). Covered by `team/host-leaves.yaml` |
| Flow 24 | The probe's network cut left the app's open connection to Kong working, so an edit made "offline" uploaded at once (Kong logged the PATCH) and the card was rightly orange | Fixed in the probe (restarts Kong on cut), test setup only |
| Flow 12 | An e2e app left open by an earlier run wrote premium from that run's purchase into the freshly seeded database | Fixed in `run.sh` (stops the app before seeding), test setup only |
| Security fix F1 | The seeded magenta photo, `<user>/seed-magenta.jpg`, wasn't shown, kept or deleted: the app now only follows `<uuid>/<uuid>.<ext>` paths | Fixed: the seed names it `e2ef0700-0000-0000-0000-000000000001.jpg`, test setup only |
| Fresh clone | The probe's user rows check failed on `auth.mfa_recovery_code_sets`: the clone wasn't linked, so `supabase start` ran the CLI's default, older Auth (v2.192.0, prod is v2.197.0) without that table | `supabase link` once per clone (see Running), test setup only |

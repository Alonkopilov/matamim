# Plan: team e2e flows (for the executor)

You are implementing Maestro e2e flows for the Matamim team feature. The
cases, decisions and design below come from the product owner and the
planner. Follow them; where something turns out to be impossible as written,
stop and say so instead of improvising around it.

## 0. Rules (non-negotiable)

- **Never build or run anything that touches the device or the database.**
  No `scripts/e2e/build-android.sh`, `scripts/e2e/run.sh`, `scripts/e2e/seed.sh`,
  `supabase db reset`, `maestro`, `adb`. Give the user the exact commands,
  they run them and paste the results. You may run `npx tsc --noEmit`,
  `npx eslint` and `python3 -m py_compile scripts/e2e/probe.py`.
- **If you find an app bug, stop and report it** (what, where, how to
  reproduce). Never write a flow that steps around a bug or weakens an
  assertion so it passes. Ask before fixing anything not listed in section 2.
- **Every flow gets reviewed** by a separate agent before it counts as done:
  spawn a general-purpose agent with the flow, its seed rows, and the cases
  it claims to cover, and ask it to check that each assertion really proves
  the case and nothing was weakened. Apply its should-fixes and say what you
  changed. If you can't spawn agents, tell the user so they can run the
  review.
- Don't commit or push unless the user asks.
- Diagnose failures from `~/.maestro/tests/<timestamp>/` (screenshots,
  `commands*.json`, logcat) and Kong's `docker logs` when the user reports a
  run, before changing anything.
- Keep `Maestro/README.md` up to date as you go (section 6).

## 1. Read first

1. `Maestro/README.md`: working agreement, seed, host probe, caveats,
   progress and bugs tables. It's the record and the style guide.
2. `Maestro/flows/premium/team-purge.yaml`: the closest existing flow (two
   accounts on one device, logging in and out, probe asserts).
   `Maestro/flows/premium/sync-off.yaml` for probe-heavy steps.
3. `Maestro/subflows/login.yaml`, `replace-text.yaml`,
   `create-meal-recipe.yaml`, `find-card.yaml`.
4. `Maestro/scripts/other-device-recipe.js`, `probe-cloud.js`,
   `probe-device-recipes.js`, and the matching functions in
   `scripts/e2e/probe.py` (`other_device_recipe`, `device_recipes`, the
   `Handler` routes).
5. `supabase/e2e/seed.sql` (helpers `pg_temp.e2e_user`, `e2e_cloud_sync`,
   `e2e_recipe`) and `scripts/e2e/seed.sh` (magenta photo uploads).
6. The team code: `app/(tabs)/team.tsx`, `app/account/join.tsx`,
   `components/team/*`, `components/account/ConnectedAccount.tsx`
   (join button, Shared team toggle), `utils/teamManagement.ts`,
   `stores/teamStore.ts`, `stores/settingsStore.ts` (toggle → create team),
   `stores/recipeStore.ts` (`teamRecipeStore$`, `refreshRecipes`, team
   resync), `supabase/functions/{create-team,get-team,generate-invite,join-team,leave-team,edit-team,remove-member}`,
   and `leave_team()` in `supabase/migrations/20260923120000_security_hardening.sql`.

### Facts the planner already established (don't re-derive)

- Toggling **Shared team** on (Account, `setting-collaborativeTeam`) needs
  cloud sync on; after 500 ms it calls get-team, and with no team calls
  create-team with the title "New team" and navigates to `/team`. While in a
  team the toggle is **disabled**. Leaving a team sets it off.
- The **join screen** is `/account/join`, opened from the icon at the top
  left of the Account screen. Its keypad auto-submits on the 8th digit. On
  failure the 8 digits stay; ⌫ removes them one at a time (typing a 9th
  digit does nothing). On success it goes to the Team tab.
- The **team is fetched** only on login/launch (session change), the team
  screen's refresh button, the recipes screen's pull to refresh
  (`refreshRecipes` calls `refreshTeam` first), and the toggle. Not on tab
  focus. So "not updated before refresh" is a stable assertion.
- When a fetch finds no team but the device had one, the app shows the
  toast "The team was deleted or you were removed from it." and the team
  screen navigates to Account.
- Team recipes (`teamRecipeStore$`, MMKV key `team_recipes`) sync on launch
  and on pull to refresh, and are fully re-fetched when the team's id, host
  or member list changes. RLS (`my_team_user_ids()`) decides who sees what,
  for rows and for photos in Storage.
- Only the host gets other members' emails from get-team; a member sees
  their own email and nobody else's.
- Members' **Premium** badges come from `premium_entitlements` in the DB
  (expired = not premium). The host has the **Head chef** badge.
- `leave_team()`: a member is removed (`left`). A host hands the team to the
  premium member (`is_user_premium`) with the oldest `joined_at`, who is
  removed from `team_members` (`transferred`); with no premium member the
  team is deleted (`deleted`). Deleting an account runs `leave_team()` first.
  The product owner confirmed: **the oldest premium member takes over**.
- Invites: 8-digit code, `expires_at` defaults to now + 5 minutes.
  generate-invite returns the team's existing unexpired code if there is
  one, and deletes expired invites before creating a new one.
- Server error texts (English, `i18n/locales/en/errors.json`):
  `CANNOT_JOIN_AS_HOST` "You manage a team, so you can't join another one.",
  `ALREADY_IN_TEAM` "You're already a member of another team.",
  `INVITE_CODE_INVALID` "This invite code doesn't exist or has expired.",
  `TEAM_NAME_INVALID` "The team name must be 1 to 50 characters.",
  `NOT_TEAM_HOST` "Only the team's manager can do this." The product owner
  chose to **keep these texts** (case 4 checks the first two).
- Other texts (`i18n/locales/en/team.json`, `tabs.json`): toasts "Team name
  updated", "You left the team.", "You left the team. Another member manages
  it now.", "The team was deleted since no Premium member was left to manage
  it.", "{{name}} was removed from the team."; dialogs "Delete team",
  "Leave team", "Remove member"; "Temporary invite code", "The code is valid
  for about 5 minutes.", "Members: {{amount}}", "Head chef"; locked tab
  toast "Join or create a team from the Account tab first"; free member
  notice "You can see the team's recipes, but your recipes are saved only on
  this device and your teammates can't see them." with "Upgrade to Premium".
- Every edge function is rate limited to 5 requests per 10 s per user
  (join-team fails closed). Space probe calls for the same user if needed;
  a "too many requests" toast means the limiter, not a bug.
- A shared recipe opened by a non-owner hides the Edit and Delete buttons
  (`isOwner` in `app/(tabs)/[id].tsx`; accessibility labels "Edit" and
  "Delete", "Back" stays) and shows the owner's name.

## 2. App changes (do these first, the user rebuilds the APK once)

### 2a. Bug fix decided by the product owner: the host's leave dialog

Today the host's trash icon always says "Delete team … All members will
leave it", even when a premium member exists and the team is handed over.
Fix in `handleLeave` in `app/(tabs)/team.tsx`:

- member → unchanged (`leaveTitle` / `leaveMessage`).
- host, and some member in `team$.members` is in `team$.premiumUserIds` →
  title `team.leave.leaveTitle`, message new key `team.leave.transferMessage`.
- host, no premium member → unchanged (`deleteTitle` / `deleteMessage`).

New strings:
- en `team.leave.transferMessage`: "Are you sure you want to leave the team?
  The Premium member who joined first will manage it, and everyone's recipes
  will stay safe."
- he `team.leave.transferMessage`: "את/ה בטוח/ה שאת/ה רוצה לצאת מהקבוצה?
  הניהול יועבר לחבר הפרימיום הוותיק ביותר, והמתכונים של כולכם ישארו בטוחים."

Add it to the README bugs table as found in planning, fixed, covered by
`team/host-leaves.yaml`.

### 2b. testIDs (no behavior change)

| Where | testID |
| --- | --- |
| `ConnectedAccount.tsx`, join team Pressable (top left) | `join-team` |
| `join.tsx`, each keypad key (`renderKey`) | `join-key-${item.id}` (`join-key-0`…`join-key-9`, `join-key-back`) |
| `team.tsx`, edit/save Pressable | `team-edit` |
| `team.tsx`, trash/exit Pressable | `team-leave` |
| `team.tsx`, add members Pressable | `team-invite` |
| `team.tsx`, title TextInput | `team-title` |
| `RefreshButton.tsx`, the button | `team-refresh` (check `PressableScale` forwards `testID`) |
| `Member.tsx`, outer View | `team-member` |
| `Member.tsx`, remove Pressable | `team-member-remove` |
| `InviteModal.tsx`, code container View | `invite-code`, plus `accessible` and `accessibilityLabel={code}` so Maestro can match the whole code |

Run `npx tsc --noEmit`, then give the user:
`scripts/e2e/build-android.sh`.

## 3. Probe additions (`scripts/e2e/probe.py` + `Maestro/scripts/*.js`)

Follow the existing style (one function, one route, a small JS wrapper that
throws on `body.error` and sets documented `output.*` fields, a header
comment listing them). Reuse the password-login code from
`other_device_recipe` (extract a `login_session(email)` helper).

1. `POST /as-user?email=&fn=&body=<url-encoded JSON>`: log in as `email`
   (seeded only, password `E2E_PASSWORD`) and call edge function `fn` at
   `{LOCAL_API}/functions/v1/{fn}` with the user's token. Allow only
   `generate-invite`, `join-team`, `leave-team`, `edit-team`,
   `remove-member`. Return `{status, body}` without raising on 4xx.
   Wrapper `as-user.js` → `output.asUserStatus`, `output.asUserBody`
   (parsed), and `output.inviteCode` when the body has `invite.code`,
   `output.leaveOutcome` when it has `outcome`.
2. `GET /team?id=<team uuid>` or `GET /team?user=<user uuid>` (the team the
   user hosts or belongs to): `{exists, id, title, host_id, members: [user_id
   by joined_at], invites: [{code, seconds_left}] (unexpired only),
   invite_rows (all rows)}`. Wrapper `probe-team.js` → `output.teamExists`,
   `teamId`, `teamTitle`, `teamHost`, `teamMembers` (ids joined by "|"),
   `teamInviteCodes` ("|"), `teamInviteSecondsLeft` (first, or -1),
   `teamInviteRows`.
3. `POST /age-invites?team=&seconds=`: move `expires_at` and `created_at` of
   the team's invites back. Wrapper `age-invites.js`.
4. `POST /other-device-edit?email=&id=&name=&ingredient=&deleted=`: as the
   owner, PATCH the recipe through REST (only the given fields; `deleted=1`
   sets `is_deleted`). Check how `updated_at` is maintained (trigger or
   client); the app pulls with `changesSince: "last-sync"`, so the row must
   get a new `updated_at` exactly as an app edit would. Wrapper
   `other-device-edit.js`.
5. `GET /visible-recipes?email=`: log in as `email` and list live recipe
   names it can read through REST (RLS), sorted. Wrapper
   `probe-visible-recipes.js` → `output.visibleNames` ("|").

Check with `python3 -m py_compile` and add the five to the README's probe
list.

## 4. Seed (`supabase/e2e/seed.sql`, `scripts/e2e/seed.sh`)

All accounts use the helpers and the shared password. Ids:
user `e2e00000-0000-0000-0000-0000000000NN`, team
`e2e7ea00-0000-0000-0000-0000000000NN` (NN = host's number), recipe
`e2ec0000-0000-0000-0000-0000000NNxx`. "Premium" = a `premium_entitlements`
row with `expires_at NULL`; "expired" = `now() - interval '10 days'`.
"Sync on" = `e2e_cloud_sync(id, true)`. Set `joined_at` explicitly where
order matters. Comment each block with the flow that uses it, like the
existing ones.

| NN | Email | Name | Setup | Flow |
| --- | --- | --- | --- | --- |
| 22 | creator@ | Creator Cook | premium, sync on, no team | create-team |
| 23 | joinhost@ | Join Host | premium, sync on, hosts "Join Team", recipe Welcome Soup | join-team |
| 24 | joiner@ | Joiner Cook | free, no team | join-team |
| 25 | otherhost@ | Other Host | premium, hosts "Other Team" | join-team |
| 26 | sharehost@ | Share Host | premium, sync on, hosts "Share Team", recipes Host Pie (magenta photo), Host Soup (ingredient Beans), Host Bread | shared-recipes |
| 27 | viewer@ | Share Viewer | free, member of Share Team | shared-recipes |
| 28 | sharemate@ | Share Mate | premium, sync on, member of Share Team, recipe Mate Curry | shared-recipes |
| 29 | latejoin@ | Late Joiner | free, no team | shared-recipes |
| 30 | rehost@ | Reinstall Host | premium, sync on, hosts "Reinstall Team", recipe Host Lasagna | reinstall |
| 31 | remember@ | Reinstall Member | premium, sync on, member, recipe Member Tacos | reinstall |
| 32 | leavehost@ | Leave Host | premium, sync on, hosts "Leave Team", recipe Host Stew | member-leaves |
| 33 | leaver@ | Leaver Cook | premium, sync on, member, recipe Leaver Curry | member-leaves |
| 34 | stayer@ | Stayer Cook | free, member | member-leaves |
| 35 | quitter@ | Quitter Cook | premium, sync on, member, recipe Quitter Pasta | member-leaves |
| 36 | movehost@ | Transfer Host | premium, sync on, hosts "Transfer Team", recipe Old Host Soup | host-leaves |
| 37 | oldlapsed@ | Lapsed Member | expired, member, joined 4 days ago | host-leaves |
| 38 | earlyfree@ | Early Free | free, member, joined 3 days ago | host-leaves |
| 39 | firstprem@ | First Premium | premium, sync on, member, joined 2 days ago, recipe First Pie | host-leaves |
| 40 | secondprem@ | Second Premium | premium, member, joined 1 day ago | host-leaves |
| 41 | delhost@ | Delete Host | premium, hosts "Heir Team" | host-leaves |
| 42 | heir@ | Heir Cook | premium, member, joined 2 days ago | host-leaves |
| 43 | lateheir@ | Late Heir | premium, member, joined 1 day ago | host-leaves |
| 44 | solohost@ | Solo Host | premium, sync on, hosts "Solo Team", recipe Solo Pie | team-deleted |
| 45 | solofree@ | Free Member | free, member | team-deleted |
| 46 | soloexpired@ | Expired Member | expired, member | team-deleted |
| 47 | rmhost@ | Remove Host | premium, sync on, hosts "Remove Team", recipe Remove Host Pie | remove-member |
| 48 | removed@ | Removed Cook | free, member | remove-member |
| 49 | kept@ | Kept Cook | free, member | remove-member |
| 50 | kicked@ | Kicked Cook | free, member | remove-member |

All emails are `@e2e.test`. Shared recipes of a host set `team_id` like
Shared Stew does. Upload sharehost@'s magenta photo in `seed.sh` (see how
`e2ef0700-0000-0000-0000-000000000001.jpg` is uploaded for other users). Every premium account that
**logs in on the device** runs `revenuecat-grant.js` at the start of its
flow, as the premium flows do.

## 5. Flows (`Maestro/flows/team/`, tag `team`)

One at a time, in this order. For each: header comment (purpose, seed,
numbered checks, like team-purge.yaml), write it, get it reviewed, give the
user `scripts/e2e/run.sh Maestro/flows/team/<file>.yaml`, wait for the
result. Start each with `launchApp: clearState: true`. Assert both UI and
server/device state (probe) for every outcome. Product-owner case numbers
are in brackets.

Maestro notes: member rows are checked with
`id: team-member` + `containsDescendants` (e.g. name + "Head chef" +
"Premium"); a missing badge with `assertNotVisible` of the same row
selector including the badge. A disabled toggle: assert `enabled: false`.
Pull to refresh = a swipe down from the top of the recipes list.

### 5.1 `create-team.yaml`: creator@ [1, 2, 3, 4, 11, 16]

1. Before a team: tapping the Team tab shows "Join or create a team from the
   Account tab first" and stays on Account.
2. [1] Toggle Shared team on → Team screen: title "New team", "Members: 1",
   one `team-member` with "Creator Cook", "creator@e2e.test", "Premium",
   "Head chef". Probe: one team hosted by creator, title "New team", no
   members.
3. [2] `team-edit`, `team-invite`, `team-leave` visible. Rename to "Creator
   Kitchen" (`team-edit`, replace text in `team-title`, `team-edit`) →
   "Team name updated", probe title. An empty name is refused with "The
   team name must be 1 to 50 characters." and the DB title is unchanged;
   put "Creator Kitchen" back.
4. [3] `team-invite` → "Temporary invite code", "The code is valid for about
   5 minutes."; probe: exactly one unexpired invite, `seconds_left` in
   240–300, and `invite-code` matches it and the regex `\d{8}`. "Got it",
   reopen → same code, still one invite row. Close, `age-invites` 301 s,
   reopen → a different 8-digit code, matching the probe; the old code is
   gone from the DB.
5. [4] Account → `join-team` → type the team's active code →
   "You manage a team, so you can't join another one."; probe: still host,
   no `team_members` row for creator.
6. [11] Relaunch → Team tab shows "Creator Kitchen", "Members: 1"; the
   Shared team toggle is on and disabled.
7. [2] `team-leave` → "Delete team" with the delete message → Cancel → team
   still exists (probe). Again → Confirm → Account, "The team was deleted
   since no Premium member was left to manage it.", toggle off and enabled,
   no team (probe), Team tab locked again.
8. [16] Toggle on again → a new team "New team" (probe: a different id).

### 5.2 `join-team.yaml`: joiner@ (free), joinhost@ and otherhost@ via probe [4, 5, 6, 11]

1. [5] joiner logs in → Account → `join-team` → "Enter team code".
   Invalid code `00000000` → "This invite code doesn't exist or has
   expired.", still on the join screen, no membership (probe). ⌫ ×8.
2. [5] Expired: `as-user` joinhost generate-invite, `age-invites` 301 s,
   type it → same message, no membership. ⌫ ×8.
3. [5] Valid: `as-user` joinhost generate-invite (assert it differs from
   the expired one), type it → Team tab: "Join Team", "Members: 2", host row
   "Join Host" + "Head chef" + "Premium" and **no** "joinhost@e2e.test",
   own row "Joiner Cook" + "joiner@e2e.test" without "Premium". Probe:
   joiner is a member of Join Team.
4. [6] No `team-edit`, no `team-invite`; `team-leave` visible (positive
   control). The free member notice and "Upgrade to Premium" are shown.
   Server side, `as-user` joiner `edit-team`, `generate-invite` and
   `remove-member` (joinhost's id) are each refused (4xx, `NOT_TEAM_HOST`),
   and the probe shows title, invites and members unchanged.
5. Recipes tab shows Welcome Soup.
6. [4] `as-user` otherhost generate-invite → joiner opens `join-team`,
   types it → "You're already a member of another team."; probe: still
   only in Join Team.
7. Account: Shared team toggle on and disabled.
8. [11] Relaunch → Team tab "Join Team", "Members: 2"; Welcome Soup listed.

### 5.3 `shared-recipes.yaml`: viewer@ (free), sharemate@, via probe sharehost@, latejoin@ [7, 8, 9, 10]

1. [7] viewer logs in → Recipes shows Host Pie, Host Soup, Host Bread, Mate
   Curry.
2. [9] Open Host Pie: the magenta photo is shown (`probe-screen-color`, as
   the premium flows do), the owner name "Share Host" is shown, "Back" is
   visible and "Edit" and "Delete" are not. Same for Mate Curry (owner
   "Share Mate").
3. [7] viewer creates "Viewer Salad" (`create-meal-recipe`). It has Edit and
   Delete (positive control). Probe: no cloud row for viewer, and
   `visible-recipes` as sharemate doesn't list it.
4. [10] `other-device-edit` as sharehost: Host Soup → name "Host Soup
   Deluxe", ingredient "Lentils"; Host Bread → deleted. Pull to refresh →
   "Host Soup Deluxe" listed, Host Bread gone, on screen and in the device's
   team recipes (probe); open Host Soup Deluxe → "Lentils".
5. [8] Team tab: "Share Team", "Members: 3". `as-user` sharehost
   edit-team "Share Team Two"; `as-user` sharehost generate-invite and
   `as-user` latejoin join-team with it. Without refreshing: still "Share
   Team" and "Members: 3". Tap `team-refresh` → "Share Team Two",
   "Members: 4", a row "Late Joiner".
6. [7] Log out (viewer has a device-only recipe: confirm the warning; the
   accepted restart applies). sharemate logs in → Recipes shows Host Pie,
   Host Soup Deluxe, Mate Curry and **not** Viewer Salad or Host Bread.

### 5.4 `reinstall.yaml`: remember@, rehost@ [12]

1. Fresh install (clearState) → remember logs in → the Shared team toggle
   turns on by itself and is disabled; Team tab "Reinstall Team",
   "Members: 2"; Recipes shows Member Tacos (own, from the cloud) and Host
   Lasagna (team); probe: device team recipes = Host Lasagna.
2. `stopApp`, `launchApp: clearState: true` (a second fresh install) →
   rehost logs in → same checks from the host's side: "Members: 2" with
   "Reinstall Member" and its email, host controls visible, Recipes shows
   Host Lasagna and Member Tacos.

### 5.5 `member-leaves.yaml`: stayer@ (free), leaver@, via probe quitter@ [13, 16]

1. stayer logs in → "Members: 4"; Recipes shows Host Stew, Leaver Curry,
   Quitter Pasta.
2. [13] `as-user` quitter leave-team (outcome `left`). stayer pulls to
   refresh → Quitter Pasta gone from the screen and the device; Team tab
   "Members: 3", no "Quitter Cook". (Cached on the device before, so this
   proves it's removed, not just never downloaded.)
3. Log out. leaver logs in → Team tab → `team-leave` → "Leave team" with
   the leave message → Cancel → still a member (probe) → Confirm → Account,
   "You left the team.", toggle off and enabled. Probe: not in the team,
   Leaver Curry still in the cloud and on the device, device team recipes
   0.
4. [16] Toggle Shared team on → Team screen "New team", "Members: 1",
   leaver with "Premium" + "Head chef"; probe: a new team hosted by leaver.
5. [13] Log out. stayer logs in → "Members: 2" (Leave Host, Stayer Cook),
   no "Leaver Cook"; Recipes shows Host Stew, not Leaver Curry or Quitter
   Pasta; `visible-recipes` as stayer agrees.

### 5.6 `host-leaves.yaml`: movehost@, firstprem@, delhost@ [14, + host deletes account]

1. [14] movehost logs in → Team tab "Members: 5" → `team-leave` → the
   **new** dialog: "Leave team" with the transfer message (section 2a) →
   Cancel → unchanged (probe) → Confirm → Account, "You left the team.
   Another member manages it now.", toggle off and enabled. Probe: host is
   firstprem (not oldlapsed, whose premium expired, nor earlyfree, who is
   free, though both joined earlier), members are oldlapsed, earlyfree,
   secondprem; movehost is in no team; device team recipes 0.
2. Log out. firstprem logs in → Team tab: firstprem's row has "Head chef",
   `team-edit`/`team-invite`/`team-leave` visible, "Members: 4", no
   "Transfer Host". Recipes doesn't show Old Host Soup (`visible-recipes`
   agrees).
3. Product owner's decision, host deletes the account: log out, delhost
   logs in → Account → Delete account → confirm. Probe: delhost is gone,
   Heir Team's host is heir (oldest premium), lateheir still a member, heir
   no longer in `team_members`.

### 5.7 `team-deleted.yaml`: solofree@, via probe solohost@ [15]

1. solofree logs in → Team tab "Solo Team", "Members: 3"; Recipes shows
   Solo Pie.
2. [15] `as-user` solohost leave-team → outcome `deleted` (soloexpired is
   not premium). Probe: Solo Team gone, no members left.
3. solofree on the Team tab taps `team-refresh` → "The team was deleted or
   you were removed from it.", lands on Account, toggle off and enabled,
   Team tab locked. Solo Pie gone from Recipes and the device's team
   recipes. If it only disappears after a pull to refresh or a relaunch,
   **stop and report it** rather than adding the pull.

### 5.8 `remove-member.yaml`: rmhost@, kicked@ (extra: host removes members)

1. rmhost logs in → "Members: 4"; each member row shows its email and
   `team-member-remove`, the host row doesn't.
2. Remove "Removed Cook": "Remove member", "Remove Removed Cook from the
   team? …" → Cancel → still 4 (probe) → Confirm → "Removed Cook was
   removed from the team.", "Members: 3"; probe.
3. `team-leave` shows "Delete team" (only free members left, so no
   transfer) → Cancel; the team still exists.
4. Log out. kicked logs in → Team tab, Remove Host Pie in Recipes.
   `as-user` rmhost remove-member kicked. kicked taps `team-refresh` →
   "The team was deleted or you were removed from it.", Account, toggle off
   and enabled; Remove Host Pie gone from Recipes and the device.

## 6. README updates (`Maestro/README.md`)

- Seed accounts table: rows 22–50.
- Host probe list: the five new endpoints.
- Progress table: rows 25–32, one per flow (what it checks, status, time,
  tag `team`).
- Bugs table: the host dialog (2a), and anything else found on the way.

## 7. When done

Report to the user: flows written and their run status, review findings
and what changed, bugs found, anything from this plan you couldn't follow
and why.

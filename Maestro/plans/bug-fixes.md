# Plan: app bug fixes found by e2e (for the executor)

You are fixing app bugs in Matamim that the Maestro e2e suite found, and
turning their tests green. The planner and the product owner have already
made the decisions below. Follow them. If something can't be done as written,
stop and say why rather than improvising.

## 0. Rules (non-negotiable)

- **Never build or run anything that touches the device or the database.**
  That means no `scripts/e2e/build-android.sh`, `scripts/e2e/run.sh`,
  `scripts/e2e/seed.sh`, `supabase db reset`, `maestro` or `adb`. Give the
  user the exact commands. They run them and paste the results back. You may
  run `npx tsc --noEmit`, `npx eslint <files>` and
  `python3 -m py_compile scripts/e2e/probe.py`.
- **Fix only what's listed here.** If you find another app bug, stop and
  report it: what it is, where it is, and how to reproduce it. Ask before
  fixing it.
- **Never weaken an existing assertion** so that a flow passes. Each
  `known-bug` flow below fails today for the right reason, and should pass
  after the fix without its checks changing. You may add checks and remove
  the `known-bug` tag.
- **Every changed or new flow, and every app fix, gets reviewed** by a
  separate agent before it counts as done. Spawn a general-purpose agent and
  give it:
  - the diff;
  - the decisions in section 2;
  - the flows involved.

  Ask it to check two things: that the fix matches the decisions without
  side effects, and that each assertion really proves its case. Apply its
  should-fixes and say what you changed. If you can't spawn agents, tell the
  user so they can run the review.
- Don't commit or push unless the user asks.
- When the user reports a run, diagnose it before changing anything. Use
  `~/.maestro/tests/<timestamp>/` (screenshots, `commands*.json` and
  `logs/device-logcat.txt`) and Kong's `docker logs`.
- Server errors stay generic in the client. Don't log edge function error
  bodies (see the memory note).
- Match the surrounding code: comment density, naming and idioms. Comments
  explain why, in short plain sentences, like the existing ones.

## 1. Read first

1. `Maestro/README.md`: the working agreement, the caveats, the progress
   table and the bugs table. It's the record and the style guide.
2. `app/(tabs)/[id].tsx`: the create and recipe screen. It's one tab that
   stays mounted. The `id` param switches between `"new"` and a recipe. Read:
   - `setCurrentRecipe`, and the `useEffect` on `[id]`;
   - `startEditing`, `discardChanges`, `stopEditing`, `toggleEditMode`,
     `saveEdit`, `goBack` and `createRecipe`;
   - the `pendingShare` effect.
3. `utils/recipeEditor.ts` (`checkInput`, `isValid`, `saveRecipe` and
   `saveChanges`), and `components/Ingredient.tsx` and
   `components/Instruction.tsx`.
4. `components/FloatingTabBar.tsx` and `components/CreateMenu.tsx` (Create
   menu → `navigate(CREATE_ROUTE, { id: "new" })`, and
   `pendingShare$` for the link and photo imports).
5. `utils/userManagement.ts` (`logoutUser`, which calls `reloadAppAsync()`
   when there were pending changes, and `deleteUser`), and
   `components/account/ConnectedAccount.tsx` (`handleDeleteAccount` and
   `logout`).
6. `utils/persistStorage.ts` (MMKV), `stores/alertStore.ts` and
   `app/_layout.tsx` (where `AlertModal` and `Toast` are mounted).
7. The flows:
   - `Maestro/flows/guest/draft-persistence.yaml`
   - `Maestro/flows/guest/create-recipe-blank-fields.yaml`
   - `Maestro/flows/guest/edit-recipe.yaml` (the discard prompt checks; the
     new flow follows its style)
   - `Maestro/flows/free/delete-account-message.yaml`
   - `Maestro/flows/free/delete-account.yaml`

### Facts the planner already established (don't re-derive)

- **Draft bug.** Opening an existing recipe changes `id`. Coming back to
  "New recipe" runs `setCurrentRecipe("new")`, which resets the form to
  `EMPTY_RECIPE`. Switching tabs alone keeps the draft, because the tab stays
  mounted and `id` doesn't change.
- **Blank fields bug.** `checkInput` compares the title with `""`, so spaces
  pass. It only checks that the ingredient and step lists aren't empty, so
  blank rows pass. Saving an edit (`saveChanges`) uses the same `isValid`.
- **Edit dropped bug.** While an existing recipe is in edit mode, anything
  that changes `id` drops the edit silently, through `setCurrentRecipe`. A
  photo picked during the edit is left as an unused file. The ways in:
  - opening another recipe from the Recipes tab (the user got there through
    the tab bar or Back);
  - the Create menu's "New recipe";
  - the Create menu's link and photo imports (they go to `/new` with
    `pendingShare$` set);
  - a share from another app (`/new`).

  Back (`goBack`) and the edit button already go through `stopEditing`,
  which asks. Switching tabs alone doesn't drop the edit, for the same
  reason as the draft.
- **Delete message bug.**
  - `handleDeleteAccount` calls `await logout()`, then `showAlert(successTitle,
    successMessage)`.
  - When the account had pending changes, `logoutUser` calls
    `reloadAppAsync()`. That covers a free user with any recipe, since those
    wait in the upload queue. The reload drops the alert.
  - A premium account doesn't restart and sees the alert today, as checked in
    `team/host-leaves.yaml` at about line 244.
  - The restart itself was accepted by the product owner. Keep it. Only the
    message has to survive it.

## 2. App changes (do these first, the user rebuilds the APK once)

### 2a. Draft survives opening a recipe (decided: only while the app is open)

- When `id` changes **away from `"new"`**, keep the draft: a copy of
  `ui$.recipe`, plus its edit mode or preview state. Keep it in a ref or in
  `ui$`, not in storage.
- When `id` changes **to `"new"`** and a draft is kept, restore it instead of
  `EMPTY_RECIPE`.
- `createRecipe` clears the kept draft. After creating, "New recipe" shows an
  empty form, as it does today.
- When the logged-in user changes (login, logout or delete), drop the kept
  draft and reset the new-recipe form. Remove the draft's picked photo file
  if no saved recipe uses it (see `discardChanges` for the check). The next
  user must not see the previous user's draft.
- No prompt for drafts. Leaving a draft keeps it, it doesn't discard it.

### 2b. Blank required fields (decided: drop fully blank rows)

In `utils/recipeEditor.ts`:

- A title of only whitespace is missing ("Missing a title"). Save the title
  trimmed.
- An **ingredient row is blank** when its amount, unit and item are all
  empty after trimming. A **step row is blank** when its text is empty after
  trimming.
- Blank rows are **dropped on save**, for both create and edit. The remaining
  rows are renumbered in `sort_order`, in their current order. If no rows are
  left, the result is "Missing ingredients" or "Missing steps".
- An ingredient with an amount or a unit but **no item** is refused with a
  new problem, `recipe.validation.ingredientMissingName`:
  - en: "An ingredient is missing its name"
  - he: "לאחד המרכיבים חסר שם"

  Show it once, however many rows have the problem. It goes in the same
  alert as the other problems.
- Validate the cleaned recipe: trimmed title, blank rows dropped. Save that
  same cleaned copy.
- After a successful edit save, set the screen's recipe to the cleaned copy,
  so view mode doesn't show the dropped empty rows.
- Ingredient and step text is otherwise saved as typed. Don't trim inside
  rows that have content.

### 2c. Leaving an edit another way asks first (decided: prompt)

Handle it at the one place that sees every way in: the `id` change in
`app/(tabs)/[id].tsx`. Don't add guards to each caller.

- Track the id the screen currently shows, in a ref. When `id` changes while
  an **existing** recipe (not `"new"`) is in edit mode:
  - **Without changes** (compared with `beforeEdit`, like `stopEditing`):
    leave edit mode and load the new id, as today.
  - **With changes:** don't load the new id yet. Show the same "Discard
    changes?" alert that `stopEditing` uses:
    - **Keep editing:** go back to the shown recipe with
      `router.setParams({ id: shownId })` or an equivalent that adds no
      history. Edit mode and the changes stay. The effect must treat the id
      coming back as "already shown": no reload, no scroll to top.
    - **Discard:** run `discardChanges()`, which removes the photo picked
      during the edit, then load the new id as today, scroll included.
- **The pending import:** while the alert is up, the `pendingShare` effect
  must not open the import. On Keep editing, drop the pending share
  (`pendingShare$.set(null)`, and `discardPhotoFiles` for a photos share,
  like `openImport` does for a refused share). On Discard, it proceeds as
  today, through the same checks: login required, used up, or opens.
- Reuse `stopEditing` and `discardChanges`. Don't copy the alert. Refactor
  them a little if needed, e.g. so `stopEditing` takes a Keep editing
  callback.
- Two things stay as they are: Back and the edit button work as today, and
  switching tabs still doesn't ask, since the edit isn't lost.
- Check what Android's system back gesture does while editing. **Only report
  it, don't fix it.**

### 2d. "Your account was deleted" survives the restart

- Add a one-shot alert that can outlive a restart. Store `{ titleKey,
  messageKey }` (i18n keys, not text) in MMKV under its own key. Prefer the
  existing `createMMKV` setup in `utils/persistStorage.ts` over a new storage
  library. On launch, show it once with `showAlert` after i18n is ready,
  e.g. from `app/_layout.tsx`, and clear it.
- `logoutUser` takes an optional notice. When it reloads, it saves the notice
  **synchronously, before `reloadAppAsync()`**. When it doesn't reload, the
  notice is shown right away. Either way it's shown **exactly once**: never
  twice, and never again on a later launch.
- `handleDeleteAccount` passes `deleteAccount.successTitle` and
  `deleteAccount.successMessage` as the notice, instead of calling
  `showAlert` itself after `logout()`.
- The logout toast and the restart itself don't change. The accepted
  behavior stays: a free user's plain logout lands on guest recipes without
  a toast.

### 2e. Small fixes

- **Hebrew toast.** In `i18n/locales/he/team.json`, change
  `leftOutcomes.left` from "הוסרת מהקבוצה בהצלחה" ("you were removed") to
  "עזבת את הקבוצה", to match the English "You left the team." This matches
  the wording of `transferred`.
- **Dev seed.** `supabase/seed.sql` (the dev seed, not the e2e one) inserts a
  team for the dev account, who isn't premium, so `supabase db reset`
  fails with `TEAM_PREMIUM_REQUIRED`. Insert a `public.premium_entitlements`
  row for that user (`expires_at` NULL, lifetime) before the team. See
  `supabase/e2e/seed.sql` around line 56 for the shape. Check that nothing
  else in the file trips another trigger, such as `MEMBER_CANNOT_HOST`.

Run `npx tsc --noEmit` and `npx eslint` on the changed files, then give the
user the build command (`scripts/e2e/build-android.sh`).

## 3. Probe

`device_recipes()` in `scripts/e2e/probe.py` returns only the id, name,
user_id and image. For 2b, add per recipe:

- `ingredients`: a list of `{amount, unit, item}` in `sort_order`;
- `steps`: the list of step texts in `sort_order`;
- `sort_orders_ok`: true when both lists are numbered 0..n-1.

Keep the existing fields as they are, since other flows read them.

## 4. Flows

### 4.1 `guest/draft-persistence.yaml`: unchanged checks, tag cleanup

- Check 8 must pass without changes. Remove the "fails until…" comments.
  Move check 8 back where it reads best, or leave it last.
- Add a check: with a draft kept (after check 8), creating it gives an empty
  "New recipe" form. All fields are empty and there are no rows. This proves
  2a clears the draft.

### 4.2 `guest/create-recipe-blank-fields.yaml`: remove `known-bug`

Its current checks stay as they are and must pass. Add:

1. Mixed rows. Add a filled ingredient row, then an empty one. Add a step
   row of only spaces, then a filled step, then an empty one. Fill the title
   with spaces around it. Create succeeds. The probe shows the recipe saved
   with:
   - the trimmed title;
   - 1 ingredient and 1 step, as typed;
   - `sort_orders_ok`.

   Opening the recipe shows one ingredient and one step.
2. An ingredient with an amount but no item is refused with "An ingredient
   is missing its name", and "Recipe created!" isn't shown.
3. Edit: on a saved recipe, setting the title to spaces is refused with
   "Missing a title". Adding an empty ingredient row and saving leaves the
   recipe unchanged in the probe, and the view shows no empty row.

Split it into two files if it gets long. Tag them `guest`.

### 4.3 New `guest/edit-leave.yaml` (tag `guest`): case 2c

A guest with two saved recipes, A and B. Create them with
`subflows/create-meal-recipe.yaml`. Each check starts with A in edit mode
and its title changed, unless it says otherwise.

1. Recipes tab, open B: "Discard changes?" is shown.
   - **Keep editing:** A's screen, still in edit mode, with the changed
     title.
   - Recipes tab, open B, then **Discard:** B is shown. Reopening A shows its
     saved title. The probe has A's saved title and no pending change, since
     this is a guest.
2. Create menu, "New recipe", **Discard:** the new-recipe form is shown, and
   A is unchanged.
3. Create menu, link import, as a guest:
   - **Keep editing:** back on A in edit mode, and no "log in" alert. Then
     Back → Discard. Create menu → "New recipe" opens without the "log in"
     alert, which proves the pending share was dropped.
   - Again, but **Discard:** the import's "log in" alert is shown, which
     proves the share went on.
4. Edit mode on A **without changes**, then open B: no alert, and B is
   shown.
5. Optional, if picking a photo works in guest flows (check how the premium
   flows pick one): pick a photo during the edit, leave through the Recipes
   tab, then Discard. The picked file is gone from the device, and A's
   image is unchanged. Skip it and say so if it isn't practical.

Use the alert's texts and testIDs from `edit-recipe.yaml`, e.g.
`Discard changes\\?` and `Keep editing`.

### 4.4 `free/delete-account-message.yaml`: remove `known-bug`

- Its checks stay as they are. Rename the flow (`name:`) so it no longer
  says "(known bug)", and update the header comment.
- Add: the alert stays up until it's dismissed. Then relaunch the app: the
  alert doesn't come back.
- Check every flow that **taps** "Delete account". The word also appears as
  a scroll anchor in many flows, so grep for the tap. At least these:
  - `free/delete-account.yaml`: now gets the alert after its restart, which
    may cover what it taps next. Dismiss it there with an explicit
    `assertVisible`, not `optional`.
  - `team/host-leaves.yaml`: a premium account, alert without restart. Make
    sure it's still shown exactly once.

  Update their comments where they mention the bug.

## 5. Commands for the user

After section 2, ask the user to run:

```sh
scripts/e2e/build-android.sh
scripts/e2e/run.sh Maestro/flows/guest/draft-persistence.yaml
scripts/e2e/run.sh Maestro/flows/guest/create-recipe-blank-fields.yaml
scripts/e2e/run.sh Maestro/flows/guest/edit-leave.yaml
scripts/e2e/run.sh Maestro/flows/free/delete-account-message.yaml
scripts/e2e/run.sh Maestro/flows/free/delete-account.yaml
scripts/e2e/run.sh Maestro/flows/team/host-leaves.yaml
scripts/e2e/run.sh Maestro/flows/guest/edit-recipe.yaml
scripts/e2e/run.sh Maestro/flows/guest/create-recipe.yaml
```

Also ask for a `supabase db reset` (dev seed, not e2e) to confirm 2e. Then
ask for a **full** `scripts/e2e/run.sh`. The `getTeamRecipes` change from the
team work hasn't had a full run yet, and these fixes touch the recipe
screen that most flows use.

## 6. README updates (`Maestro/README.md`)

- **Progress table:**
  - rows 5, 6 and 18 become "Passing, reviewed" (remove "Failing on a known
    bug");
  - add a row for `guest/edit-leave.yaml`;
  - update the description of row 6 for the new checks.
- **Bugs table:** mark these Fixed, each with what was changed and which flow
  covers it:
  - Draft lost
  - Required fields accept blank content
  - Edits dropped when leaving another way
  - Deleting the account doesn't say so
  - `supabase/seed.sql` TEAM_PREMIUM_REQUIRED
- Add any new bug you found and reported.

## 7. When done

Report to the user:

- what changed, by file;
- each flow's last run result;
- what the review agents found and what you applied;
- what Android's system back does while editing (2c);
- anything you skipped (e.g. 4.3 check 5).

Don't commit unless the user asks.

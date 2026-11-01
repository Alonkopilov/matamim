# Design overhaul audit

Tracks the move to a more modern UI, on the `feat/next-step-design` branch.

## Done

- **Theme tokens** (`constants/theme.ts`): colors, radius, spacing, fonts and a floating shadow. Exact color matches across the app were moved onto them.
- **Floating tab bar** (`components/FloatingTabBar.tsx`): a rounded pill that floats over the screens, with Create as a centered yellow button. The Team tab is always shown and is blocked with a toast for users without a team.
- **Home screen**: recipe cards with the title over a gradient and chips for prep time and difficulty, a scrolling row of category chips, a search bar with a focus state and a clear button, skeleton cards while loading, and a "no matching recipes" message when a filter hides everything.
- **Bottom sheets** (`components/ui/Sheet.tsx`): the alert, invite, account update and recipe import dialogs are swipeable sheets that also close on Android back.
- **Toasts**: a pill with a status icon that slides down from the top and can be swiped away.
- **Shared components**: `PressableScale` (press feedback) and `Button` (48dp, primary / secondary / destructive).
- **Tab bar extras**: a frosted blur behind the bar (`expo-blur`), haptics on tab switches, Create and the locked Team tab (`expo-haptics`), and a create menu (`components/CreateMenu.tsx`) with a new recipe, import from a link and import from a photo.
- **Recipe screen**: the photo stretches when pulled past the top (iOS only, Android doesn't overscroll); frosted round back, edit and delete buttons (`components/ui/GlassButton.tsx`); a frosted header with the title that fades in as the content covers the photo; a toggle between ingredients and steps (`components/ui/SegmentedControl.tsx`); ingredients you tick off with a strike-through; a full-screen cook mode with one step at a time that keeps the screen on (`components/recipes/CookMode.tsx`); the new recipe buttons on the shared `Button`. Opening a recipe now also scrolls the screen back to the top.
- **Account**: settings and actions in rounded groups with colored icon tiles, iOS Settings style (`components/account/SettingsGroup.tsx`, `IconTile.tsx`), replacing the `Divider`s. Log out and delete account have their own group.
- **Home header**: the greeting, tagline and search bar scroll with the list as a large title, and a compact bar with the greeting fades in over the list as they scroll away. The language button lives in that bar, so it stays reachable.
- **Cleanup**: the one-off colors (`#2b2c2f`, `#2a2c30`, `#6c6c6c` and the refresh button's grays) are on the tokens. `TouchableOpacity` is gone: the import sheet's mode switch is the shared `SegmentedControl`, and its photo buttons, the property pickers, the empty-list button and the team refresh button use `PressableScale`. The tab bar, the account rows and the join keypad keep their background highlights on purpose.
- **Premium**: a header card on a yellow-to-amber gradient that keeps moving across it in one direction (`components/premium/PremiumHero.tsx`), plan cards with an accent border when selected and a "Best value" badge on the yearly plan, and the purchase button on the shared `Button`.

## Remaining steps

### 1. Home screen extras
- [ ] Filter button in the search bar (difficulty, prep time). On hold for now.

### 2. Motion
- [x] Entering animation for the recipe cards: the first screenful rises in one after another (`components/recipes/RecipeList.tsx`). Layout animations were left out, since the masonry `FlashList` positions and recycles its cells itself.
- Shared-element transition from a card's photo to the recipe screen: dropped. Reanimated only supports it inside a native stack, and the recipe screen is a tab (it's also the Create tab).

## Not yet tested on a device

- [ ] Recipe import sheet in shared-text mode (from sharing text into the app), and that its `ScrollView` scrolls inside the sheet. The link and photo modes were checked.
- [ ] Change email / password sheet, through every step. The edit name sheet was checked.
- [ ] Team invite sheet, which needs a team.
- [ ] The blur's fallback on Android 11 and below, where the bar is only tinted.
- [ ] The recipe photo stretching on overscroll, which needs an iOS device.
- [ ] The Premium gradient loop in Hebrew. It was checked in English.
- [ ] The home screen's collapsing header, in both languages: where the compact bar fades in, the pull-to-refresh spinner below it, and the search bar keeping focus while results change.
- [ ] The recipe cards' staggered entrance, including that cells mounted while scrolling don't replay it.
- [ ] The import sheet's mode switch, now the shared `SegmentedControl`.

## Known issues

- [ ] **Shared link import loaded forever once (not reproduced).** A link shared from the browser filled the import sheet, the logs showed `IMPORT_RECIPE_SUCCESS` (cached), but the sheet kept loading. The same share worked when retried, both from the recipe screen and the home screen. If it comes back, note which screen the app was on, whether the link field was focused, and whether the spinner was in the button or the whole screen.
- [ ] Not checked on a device: the red border on the photo buttons when starting a photo import without photos (the test account ran out of free imports), and the sign-in screens without the logo.

- [ ] **Switching a recipe between edit and view mode takes 400-800ms** in a dev build. About 250ms is React rendering the rows, about 350ms is Android creating ~30 text inputs. Check a release build first (`npx expo run:android --variant release`). If it's still slow, show inputs only for the row being edited instead of every row at once.

## Gotchas found along the way

- **Android drops `borderRadius` on a background added after mount.** A view that gets its `backgroundColor` only on a later render (e.g. when selected) is drawn with square corners. Give it a background from the first render and only change the color, or keep a rounded highlight mounted and toggle its opacity (see `FloatingTabBar`).
- **Fast refresh is unreliable for the tab bar.** It has shown stale styles more than once. Force-close the app before judging a change there.
- **A custom tab bar must report its height.** `FloatingTabBar` calls `BottomTabBarHeightCallbackContext`, otherwise `useBottomTabBarHeight()` returns a guess. Scrollable screens pad their content by that height, since the bar floats over them.
- **Sheets that unmount on close** should close through the `Sheet` ref's `dismiss()`, so they animate out before the parent removes them.
- **A blur can't sit inside its own target on Android 12+.** It recurses until the app crashes natively. Each tab screen is a `BlurTargetView` (through `screenLayout`) and the bar, outside them, blurs the focused one.
- **`BlurView` reads its target's ref only when the ref's `current` changes.** A ref set after the bar mounts is never picked up, so a target is passed only once it's laid out.
- **Don't dismiss a bottom sheet that never opened.** It stops it from presenting later. `Sheet` only dismisses after a present.
- **Sheet keyboard handling needs `android_keyboardInputMode="adjustPan"`.** With edge-to-edge, `"adjustResize"` leaves the sheet under the keyboard. Closing a sheet also closes the keyboard, which a focused input would otherwise keep up.
- **The RevenueCat "Error fetching offerings" banner** in dev comes from the Test Store API key having no Test Store products in the RevenueCat dashboard. It covers the bottom of the screen until dismissed.

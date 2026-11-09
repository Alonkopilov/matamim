#!/usr/bin/env bash
# Captures the store screenshots in English and Hebrew on the e2e emulator,
# from the demo kitchens in supabase/e2e/screenshots.sql.
#
#   scripts/e2e/screenshots.sh
#
# Needs one photo per dish in store/screenshots/photos/ (names in env.sh's
# DEMO_DISHES). Like run.sh, it wipes the local database. The screenshots
# land in store/screenshots/raw/, e.g. en-01-recipes.png, ready for Figma.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$ROOT"

# Fail before the long setup, not halfway through seeding
for dish in "${DEMO_DISHES[@]}"; do demo_photo "$dish" >/dev/null; done

"$ROOT/scripts/e2e/emulator.sh"
export ANDROID_SERIAL="$E2E_SERIAL"

# A clean status bar: 09:41, full battery and signal, no notifications
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
adb shell settings put global sysui_demo_allowed 1
demo enter
trap 'demo exit || true' EXIT
demo clock -e hhmm 0941
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e fully true
demo network -e mobile hide
demo notifications -e visible false
# Demo mode doesn't hide notification icons on this Android version, e.g.
# Safety Center's "no screen lock" shield next to the clock. Snoozed for 3
# hours instead, every notification on the device.
adb shell dumpsys notification --noredact |
  sed -n 's/.*NotificationRecord(.* key=\([^ ]*\): Notification(.*/\1/p' |
  while read -r key; do
    adb shell cmd notification snooze --for 10800000 "'$key'" >/dev/null </dev/null
  done

out="$ROOT/build/e2e/screenshots"
raw="$ROOT/store/screenshots/raw"
rm -rf "$out"
mkdir -p "$out" "$raw"
rm -f "$raw"/*.png

E2E_SCREENSHOTS=1 "$ROOT/scripts/e2e/run.sh" \
  --test-output-dir "$out" Maestro/screenshots/all.yaml

# Maestro saves takeScreenshot files in the output folder or the folder it
# runs in, depending on the version
name='[a-z][a-z]-[0-9][0-9]-*.png'
mapfile -t shots < <(
  find "$out" -name "$name"
  find "$ROOT" "$ROOT/Maestro/screenshots" -maxdepth 1 -name "$name"
)
((${#shots[@]} > 0)) || die "no screenshots found in $out"
mv "${shots[@]}" "$raw/"
echo "e2e: ${#shots[@]} screenshots in store/screenshots/raw/"

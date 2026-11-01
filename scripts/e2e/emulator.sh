#!/usr/bin/env bash
# The emulator e2e runs use, separate from the one used day to day.
#
#   scripts/e2e/emulator.sh        start it if it isn't running, wait for boot
#   scripts/e2e/emulator.sh stop   shut it down
#
# The AVD is created once, with the hardware of the Pixel_10_Pro AVD, so
# flows see the same screen. It runs on its own port, so it never clashes
# with an emulator started from Android Studio. It opens a window, or none
# with E2E_HEADLESS=1. A running one is used as it is.
set -euo pipefail
source "$(dirname "$0")/env.sh"

SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
AVD_HOME="$HOME/.android/avd"
TEMPLATE_AVD="Pixel_10_Pro"

is_running() {
  [[ "$(adb -s "$E2E_SERIAL" get-state 2>/dev/null)" == "device" ]]
}

if [[ "${1:-}" == "stop" ]]; then
  is_running && adb -s "$E2E_SERIAL" emu kill >/dev/null
  exit 0
fi

create_avd() {
  local template="$AVD_HOME/$TEMPLATE_AVD.avd/config.ini"
  [[ -f "$template" ]] ||
    die "no $TEMPLATE_AVD AVD to copy the hardware from, create it in Android Studio"
  mkdir -p "$AVD_HOME/$E2E_AVD.avd"
  sed -e "s/^AvdId=.*/AvdId=$E2E_AVD/" \
    -e "s/^avd.ini.displayname=.*/avd.ini.displayname=Matamim E2E/" \
    -e "s/^showDeviceFrame=.*/showDeviceFrame=no/" \
    -e "s/^hw.audioInput=.*/hw.audioInput=no/" \
    -e "s/^disk.dataPartition.size=.*/disk.dataPartition.size=8G/" \
    "$template" >"$AVD_HOME/$E2E_AVD.avd/config.ini"
  sed -e "s#^path=.*#path=$AVD_HOME/$E2E_AVD.avd#" \
    -e "s#^path.rel=.*#path.rel=avd/$E2E_AVD.avd#" \
    "$AVD_HOME/$TEMPLATE_AVD.ini" >"$AVD_HOME/$E2E_AVD.ini"
}

is_running && exit 0
[[ -f "$AVD_HOME/$E2E_AVD.ini" ]] || create_avd

mkdir -p "$ROOT/build/e2e"
window=()
[[ "${E2E_HEADLESS:-0}" == "1" ]] && window=(-no-window)
echo "e2e: starting the emulator ($E2E_SERIAL)"
nohup "$SDK/emulator/emulator" -avd "$E2E_AVD" -port "$E2E_EMULATOR_PORT" \
  "${window[@]}" -no-audio -no-boot-anim \
  >"$ROOT/build/e2e/emulator.log" 2>&1 &

for _ in $(seq 180); do
  [[ "$(adb -s "$E2E_SERIAL" shell getprop sys.boot_completed 2>/dev/null |
    tr -d '\r')" == "1" ]] && exit 0
  sleep 2
done
die "the emulator didn't boot, see build/e2e/emulator.log"

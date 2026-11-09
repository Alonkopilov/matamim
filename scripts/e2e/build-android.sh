#!/usr/bin/env bash
# Builds the e2e release APK into build/e2e/matamim-e2e.apk.
#
# The Supabase variables are overridden in the environment (Expo prefers them
# over .env files), so the production URL and key never enter the bundle. The
# native project is regenerated for the e2e app id, then restored on exit.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$ROOT"

restore() {
  echo "e2e: restoring the regular android project"
  env -u EXPO_PUBLIC_E2E npx expo prebuild --platform android --clean --no-install >/dev/null
}
trap restore EXIT

assert_local_supabase
export_e2e_bundle_env
npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleRelease)

mkdir -p "$(dirname "$APK")"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
assert_apk_is_local
echo "e2e: built $APK"

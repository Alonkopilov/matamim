#!/usr/bin/env bash
# Rebuilds only the JS bundle and swaps it into the existing e2e APK, about
# 2 minutes instead of build-android.sh's ~17. For changes to JS only (app
# code, or a pure JS package): native code stays what the last full build
# compiled, so a native change or a package with native code still needs
# build-android.sh.
#
# The previous APK is kept as build/e2e/matamim-e2e.before-swap.apk.
# run.sh installs the result as usual.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$ROOT"

[[ -f "$APK" ]] || die "no e2e APK at $APK, run build-android.sh first"

BUILD_TOOLS="$(ls -d "${ANDROID_HOME:-$HOME/Android/Sdk}"/build-tools/* | sort -V | tail -1)"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"
HERMESC="$ROOT/node_modules/hermes-compiler/hermesc/linux64-bin/hermesc"
# The keystore every Expo prebuild writes, which signed the full build
KEYSTORE="$ROOT/android/app/debug.keystore"
for tool in "$ZIPALIGN" "$APKSIGNER" "$HERMESC" "$KEYSTORE"; do
  [[ -e "$tool" ]] || die "missing $tool"
done
command -v zip >/dev/null || die "zip is not installed"

assert_local_supabase
export_e2e_bundle_env

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/stage/assets" "$work/res"

# The same bundling the Gradle build runs for a Hermes release
entry="$(node -e "require('expo/scripts/resolveAppEntry')" "$ROOT" android absolute)"
echo "e2e: bundling $entry"
npx expo export:embed \
  --platform android \
  --dev false \
  --minify false \
  --reset-cache \
  --entry-file "$entry" \
  --bundle-output "$work/index.android.bundle.js" \
  --assets-dest "$work/res"

echo "e2e: compiling to Hermes bytecode"
"$HERMESC" -w -O -emit-binary -out "$work/stage/assets/index.android.bundle" \
  "$work/index.android.bundle.js"

echo "e2e: swapping the bundle into the APK"
cp "$APK" "$work/app.apk"
# Stored, not compressed, like the Gradle build packs it
(cd "$work/stage" && zip -q -0 "$work/app.apk" assets/index.android.bundle)
"$ZIPALIGN" -f -p 4 "$work/app.apk" "$work/aligned.apk"
"$APKSIGNER" sign \
  --ks "$KEYSTORE" --ks-pass pass:android \
  --ks-key-alias androiddebugkey --key-pass pass:android \
  --out "$work/signed.apk" "$work/aligned.apk"

# Same signer as the installed build, or adb install -r would refuse it
# Only the digest: the line's label differs ("V2 Signer" for Gradle's
# signature, "V3.0 Signer" for apksigner's)
signer() {
  "$APKSIGNER" verify --print-certs "$1" |
    sed -nE 's/.*certificate SHA-256 digest: ([0-9a-f]+).*/\1/p' | head -1
}
[[ "$(signer "$APK")" == "$(signer "$work/signed.apk")" ]] ||
  die "the swapped APK's signer differs from $APK's, android/app/debug.keystore changed"

# The same guard run.sh applies, on the new APK before it replaces the old
(APK="$work/signed.apk" && assert_apk_is_local)

cp "$APK" "$ROOT/build/e2e/matamim-e2e.before-swap.apk"
mv "$work/signed.apk" "$APK"
echo "e2e: swapped the JS bundle into $APK"

# Shared settings and guardrails for the e2e scripts. Sourced, not executed.

E2E_APP_ID="com.matamim.app.e2e"
E2E_PASSWORD="e2e-password-1" # Must match supabase/e2e/seed.sql
LOCAL_API_URL="http://127.0.0.1:54321"
LOCAL_KONG_CONTAINER="supabase_kong_OurRecipes"
LOCAL_DB_CONTAINER="supabase_db_OurRecipes"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APK="$ROOT/build/e2e/matamim-e2e.apk"
# The headless emulator runs use (see emulator.sh)
E2E_AVD="Matamim_E2E"
E2E_EMULATOR_PORT=5580
E2E_SERIAL="emulator-$E2E_EMULATOR_PORT"

die() { echo "e2e: $*" >&2; exit 1; }

# The store screenshots' dishes, in the order of supabase/e2e/screenshots.sql
# (dish 01 first). Each needs a photo in store/screenshots/photos/.
DEMO_DISHES=(shakshuka lemon-pasta roast-chicken greek-salad chocolate-babka banana-pancakes lentil-soup apple-crumble)
DEMO_PHOTOS_DIR="$ROOT/store/screenshots/photos"

# The dish's photo (any of jpg, jpeg, png, webp), or fails naming the file
demo_photo() {
  local ext
  for ext in jpg jpeg png webp; do
    [[ -f "$DEMO_PHOTOS_DIR/$1.$ext" ]] && { echo "$DEMO_PHOTOS_DIR/$1.$ext"; return; }
  done
  die "no photo for $1, add store/screenshots/photos/$1.jpg"
}

# The production Supabase host, read from .env, so the guardrails can look for it
prod_host() {
  grep -E '^EXPO_PUBLIC_SUPABASE_URL=' "$ROOT/.env" | cut -d= -f2- |
    sed -E 's#^https?://([^/:]+).*#\1#'
}

# Fails unless the local Supabase stack is up and serving on loopback
assert_local_supabase() {
  local api_url
  api_url="$(cd "$ROOT" && supabase status -o json 2>/dev/null |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["API_URL"])')" ||
    die "local Supabase is not running (run: supabase start)"
  [[ "$api_url" == "$LOCAL_API_URL" ]] ||
    die "local Supabase API is at $api_url, expected $LOCAL_API_URL"
}

# The environment the e2e JS bundle is built with. The Supabase variables
# are overridden here (Expo prefers them over .env files), so the
# production URL and key never enter the bundle
export_e2e_bundle_env() {
  export EXPO_PUBLIC_E2E=1
  export EXPO_PUBLIC_SUPABASE_URL="$LOCAL_API_URL"
  export EXPO_PUBLIC_SUPABASE_LOCAL_URL="$LOCAL_API_URL"
  EXPO_PUBLIC_SUPABASE_KEY="$(cd "$ROOT" && supabase status -o json |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["PUBLISHABLE_KEY"])')"
  export EXPO_PUBLIC_SUPABASE_KEY
  export EXPO_PUBLIC_SUPABASE_LOCAL_KEY="$EXPO_PUBLIC_SUPABASE_KEY"
  export EXPO_PUBLIC_SENTRY_DSN=""
  export SENTRY_DISABLE_AUTO_UPLOAD=true
}

# The Sentry ingest host, e2e builds must not report to it
sentry_host() {
  grep -E '^EXPO_PUBLIC_SENTRY_DSN=' "$ROOT/.env" | cut -d= -f2- |
    sed -E 's#^https?://[^@]*@([^/:]+).*#\1#'
}

# Fails if the APK's JS bundle mentions the production Supabase or Sentry
# hosts, or lacks the local Supabase URL
assert_apk_is_local() {
  local host bundle
  host="$(prod_host)"
  [[ -n "$host" ]] || die "could not read the production host from .env"
  [[ -f "$APK" ]] || die "no e2e APK at $APK (run: scripts/e2e/build-android.sh)"
  bundle="$(mktemp)"
  unzip -p "$APK" assets/index.android.bundle >"$bundle" ||
    die "could not extract the JS bundle from $APK"
  if grep -aqF "$host" "$bundle"; then
    rm -f "$bundle"
    die "the e2e APK contains the production host $host, refusing to run"
  fi
  local sentry
  sentry="$(sentry_host)"
  if [[ -n "$sentry" ]] && grep -aqF "$sentry" "$bundle"; then
    rm -f "$bundle"
    die "the e2e APK contains the Sentry DSN, refusing to run"
  fi
  if ! grep -aqF "$LOCAL_API_URL" "$bundle"; then
    rm -f "$bundle"
    die "the e2e APK does not contain $LOCAL_API_URL"
  fi
  rm -f "$bundle"
}

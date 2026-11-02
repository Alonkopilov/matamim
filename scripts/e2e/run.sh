#!/usr/bin/env bash
# Runs Maestro flows against the e2e APK and the local Supabase stack.
#
#   scripts/e2e/run.sh                      all flows (Maestro/config.yaml)
#   scripts/e2e/run.sh Maestro/flows/x.yaml one flow
#
# Edge functions are served with supabase/functions/.env, with
# supabase/functions/.env.e2e (optional) layered on top, e.g. to use a
# separate ANTHROPIC_API_KEY for test runs.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$ROOT"

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
command -v maestro >/dev/null || die "maestro is not installed"
# Every adb call below, and the probe's, goes to the e2e emulator only
"$ROOT/scripts/e2e/emulator.sh"
export ANDROID_SERIAL="$E2E_SERIAL"

# Flows assert on English text. A per-app locale would be reset by
# clearState, so the device itself has to be in English.
device_locale="$(adb shell getprop persist.sys.locale | tr -d '\r')"
[[ -z "$device_locale" ]] && device_locale="$(adb shell getprop ro.product.locale | tr -d '\r')"
[[ "$device_locale" == en* ]] ||
  die "device language is $device_locale, flows need English"

assert_local_supabase
assert_apk_is_local

# The app from an earlier run may still be open, and logged in. It would
# talk to the database as it's reset and seeded, e.g. writing back premium
# from a purchase that run made.
adb shell am force-stop "$E2E_APP_ID"

# Reset first, a db reset restarts parts of the stack
"$(dirname "$0")/seed.sh"

# Edge function secrets: .env, then .env.e2e overrides
env_file="$(mktemp)"
functions_pid=""
probe_pid=""
cleanup() {
  [[ -n "$functions_pid" ]] && kill "$functions_pid" 2>/dev/null || true
  [[ -n "$probe_pid" ]] && kill "$probe_pid" 2>/dev/null || true
  rm -f "$env_file"
}
trap cleanup EXIT
cat supabase/functions/.env >"$env_file"
[[ -f supabase/functions/.env.e2e ]] && cat supabase/functions/.env.e2e >>"$env_file"

supabase functions serve --env-file "$env_file" >build/e2e/functions.log 2>&1 &
functions_pid=$!
for _ in $(seq 120); do
  grep -q "Serving functions" build/e2e/functions.log 2>/dev/null && break
  kill -0 "$functions_pid" 2>/dev/null || die "edge functions failed, see build/e2e/functions.log"
  sleep 1
done
grep -q "Serving functions" build/e2e/functions.log ||
  die "edge functions did not start, see build/e2e/functions.log"

# Serving functions reloads Kong without its email template server (port
# 8088), and Auth then sends its default emails, which have no code. A Kong
# restart brings it back and keeps the functions route.
docker restart "$LOCAL_KONG_CONTAINER" >/dev/null
for _ in $(seq 30); do
  docker exec "$LOCAL_KONG_CONTAINER" \
    wget -qO- http://127.0.0.1:8088/email/confirmation.html 2>/dev/null |
    grep -q "{{ .Token }}" && break
  sleep 1
done
docker exec "$LOCAL_KONG_CONTAINER" \
  wget -qO- http://127.0.0.1:8088/email/confirmation.html 2>/dev/null |
  grep -q "{{ .Token }}" ||
  die "local Auth's email templates aren't served, emails would have no code"


# The app reaches the host's Supabase through the device's loopback
adb reverse tcp:54321 tcp:54321 >/dev/null
adb install -r "$APK" >/dev/null

# Lets flows check requests and rows on the host (see probe.py)
python3 -I "$ROOT/scripts/e2e/probe.py" >build/e2e/probe.log 2>&1 &
probe_pid=$!
for _ in $(seq 20); do
  curl -sf http://127.0.0.1:54399/now >/dev/null && break
  sleep 0.5
done
curl -sf http://127.0.0.1:54399/now >/dev/null ||
  die "probe did not start, see build/e2e/probe.log"

maestro --device "$E2E_SERIAL" test \
  -e APP_ID="$E2E_APP_ID" \
  -e E2E_PASSWORD="$E2E_PASSWORD" \
  "${@:-Maestro}"

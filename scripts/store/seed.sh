#!/usr/bin/env bash
# Seeds the LOCAL database with the store screenshot accounts
# (supabase/store/seed.sql), uploads their recipe photos and gives the two
# hosts premium in RevenueCat (Test Store). Safe to run again, and runs on
# top of the e2e seed, which scripts/e2e/run.sh resets on every run.
#
# Photos are read from build/store/photos/<photo>.jpg, the name each recipe
# gives in seed.sql. A recipe whose photo is missing is left without one.
#
# Log in to the e2e app (scripts/e2e/build-android.sh) as
#   noa.cohen@example.com   Hebrew family
#   emma.carter@example.com English family
# with the e2e password, e2e-password-1.
set -euo pipefail
source "$(dirname "$0")/../e2e/env.sh"
cd "$ROOT"

PHOTOS="$ROOT/build/store/photos"
HOSTS=(e2e00000-0000-0000-0000-000000000701 e2e00000-0000-0000-0000-000000000801)

assert_local_supabase

psql_local() {
  docker exec -i "$LOCAL_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres "$@"
}
psql_local <supabase/store/seed.sql >/dev/null

service_key="$(supabase status -o json 2>/dev/null |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"
resized="$(mktemp --suffix=.jpg)"
trap 'rm -f "$resized"' EXIT

# Scaled and compressed like the app saves a picked photo (utils/imageStorage.ts)
missing=()
while IFS='|' read -r id image; do
  photo="$PHOTOS/$(basename "$image")"
  if [[ ! -f "$photo" ]]; then
    missing+=("$(basename "$image" .jpg)")
    # Not from the loop's input, which docker exec -i would read
    psql_local -c "UPDATE public.recipes SET image = '' WHERE id = '$id'" </dev/null >/dev/null
    continue
  fi
  convert "$photo" -auto-orient -resize '1600x1600>' -strip -quality 80 "$resized"
  curl -sf -o /dev/null -X POST \
    "$LOCAL_API_URL/storage/v1/object/recipe-images/$image" \
    -H "Authorization: Bearer $service_key" -H "Content-Type: image/jpeg" \
    -H "x-upsert: true" --data-binary "@$resized" ||
    die "couldn't upload $image"
done < <(psql_local -At -F '|' -c \
  "SELECT id, image FROM public.recipes WHERE image <> ''
   AND user_id::text ~ '^e2e00000-0000-0000-0000-0000000(007|008)'")

# The hosts are the accounts logged in on the device, which reads premium
# from RevenueCat. The members only need it in the database.
for host in "${HOSTS[@]}"; do
  python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
import probe
result = probe.grant_revenuecat(sys.argv[2])
if not result["active"]:
    sys.exit(f"RevenueCat does not report premium for {sys.argv[2]}")
' "$ROOT/scripts/e2e" "$host"
done

if ((${#missing[@]})); then
  printf 'store: no photo in build/store/photos for: %s\n' "$(printf '%s ' $(printf '%s\n' "${missing[@]}" | sort -u))"
fi
echo "store: screenshot accounts seeded"

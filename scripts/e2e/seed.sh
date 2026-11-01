#!/usr/bin/env bash
# Resets the LOCAL database (migrations only, not the dev seed) and loads the e2e
# seed on top. This wipes local dev data.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$ROOT"

assert_local_supabase
supabase db reset --local --no-seed
# The reset restarts Storage on a new address, and Kong keeps sending to the
# old one (502 on every upload), so it restarts too
docker restart "$LOCAL_KONG_CONTAINER" >/dev/null
docker exec -i "$LOCAL_DB_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <supabase/e2e/seed.sql >/dev/null

# Photos in Storage, which SQL can't add: the file has to exist for Storage
# to remove it. One for the account flows/free/delete-account.yaml deletes,
# and one for the account that must keep it.
service_key="$(supabase status -o json 2>/dev/null |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"
photo="$(mktemp)"
magenta="$(mktemp)"
trap 'rm -f "$photo" "$magenta"' EXIT
# A 1x1 PNG
printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x06\0\0\0\x1f\x15\xc4\x89\0\0\0\rIDATx\x9cc\xf8\xff\xff?\0\x05\xfe\x02\xfe\xa7\x35\x81\x84\0\0\0\0IEND\xaeB`\x82' >"$photo"
# The premium flows' photo, all magenta, a color no screen of the app has,
# so a flow can tell from a screenshot that it's shown
python3 -c 'import sys; from PIL import Image; Image.new("RGB", (800, 600), (255, 0, 255)).save(sys.argv[1], "JPEG", quality=95)' "$magenta"
upload_photo() {
  local path="$1" file="$2" type="$3"
  # Storage may still be restarting after the reset
  for attempt in $(seq 30); do
    curl -sf -o /dev/null -X POST \
      "$LOCAL_API_URL/storage/v1/object/recipe-images/$path" \
      -H "Authorization: Bearer $service_key" -H "Content-Type: $type" \
      --data-binary "@$file" && return
    sleep 1
  done
  die "couldn't upload the seed photo $path"
}
for user in e2e00000-0000-0000-0000-000000000009 e2e00000-0000-0000-0000-000000000010; do
  upload_photo "$user/seed-photo.png" "$photo" image/png
done
for user in 14 15 16 17 18 26; do
  upload_photo "e2e00000-0000-0000-0000-0000000000$user/seed-magenta.jpg" "$magenta" image/jpeg
done
echo "e2e: database seeded"

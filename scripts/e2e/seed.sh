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
# Named <uuid>.jpg like the app's uploads, the only paths the app loads
# (storagePath in utils/imageStorage.ts)
for user in 14 15 16 17 18 26; do
  upload_photo "e2e00000-0000-0000-0000-0000000000$user/e2ef0700-0000-0000-0000-000000000001.jpg" "$magenta" image/jpeg
done

# The store screenshots' demo kitchens (scripts/e2e/screenshots.sh), only on
# request. Dish NN's photo is store/screenshots/photos/<DEMO_DISHES[NN-1]>.*,
# saved as a JPEG of at most 1600 px like the app's own uploads.
if [[ "${E2E_SCREENSHOTS:-}" == 1 ]]; then
  docker exec -i "$LOCAL_DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <supabase/e2e/screenshots.sql >/dev/null
  dish_photo="$(mktemp)"
  trap 'rm -f "$photo" "$magenta" "$dish_photo"' EXIT
  for i in "${!DEMO_DISHES[@]}"; do
    source_photo="$(demo_photo "${DEMO_DISHES[$i]}")"
    python3 -I -c 'import sys; from PIL import Image, ImageOps
im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGB")
im.thumbnail((1600, 1600))
im.save(sys.argv[2], "JPEG", quality=90)' "$source_photo" "$dish_photo"
    dish="$(printf '%02d' $((i + 1)))"
    # Dishes 07 and 08 are the teammate's
    for kitchen in 6 7; do
      owner=0
      ((i >= 6)) && owner=1
      upload_photo "e2e00000-0000-0000-0000-0000000000$kitchen$owner/e2ef0700-0000-0000-0000-0000000060$dish.jpg" "$dish_photo" image/jpeg
    done
  done
  echo "e2e: screenshot demo data seeded"
fi
echo "e2e: database seeded"

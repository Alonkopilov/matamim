"""Host-side helper for Maestro flows, started by run.sh on 127.0.0.1 only.

Maestro's runScript runs on the host, so flows call this to check what the
device can't show: requests that reached local Supabase, rows in the local
database, and to cut the device off from local Supabase.

  GET  /now                               current time, to mark a flow's start
  GET  /requests?since=<epoch>&path=<p>   requests through Kong since then
                                          whose path starts with <p>
  GET  /count?table=<public table>        rows in a local table, leaving out
                                          the seed's
  POST /network?state=off|on              cut the device off (Wi-Fi, mobile
                                          data, `adb reverse`, and a Kong
                                          restart to close open connections)
                                          or reconnect it
  GET  /online                            whether the device reaches the
                                          internet (a ping from the device)
  POST /cursor-end                        moves the cursor of the focused
                                          field to the end of its line
  GET  /device-recipes                    the recipes saved in the app's own
                                          storage on the device, and how many
                                          changes wait to upload
  GET  /keep-screen-on?watch=<seconds>    whether the app's window keeps the
                                          screen on, or ever did while
                                          sampled for that long
  GET  /user-rows?user=<id>               the account's rows in every table
                                          that references a user
  GET  /account?user=<id>                 the account's email and name in
                                          Auth and in profiles
  GET  /premium?user=<id>                 the account's premium in the
                                          database and in RevenueCat
  POST /revenuecat-reset?user=<id>        deletes a seeded account's customer
                                          from RevenueCat
  POST /revenuecat-grant?user=<id>        gives a seeded account lifetime
                                          premium in RevenueCat, unless it has
                                          premium there already
  POST /age-codes?user=<id>&seconds=<n>   makes the account's emailed codes
                                          look sent n seconds earlier
  GET  /cloud?user=<id>                   the account's recipes and images in
                                          the cloud, and its cloud sync state
  POST /age-sync-off?user=<id>&days=<n>   makes cloud sync look turned off n
                                          days earlier
  POST /purge-cloud                       runs the nightly purge of cloud
                                          copies (sync off or premium ended)
  POST /purge-images?user=<id>            runs the nightly cleanup of images
                                          no recipe points to, for the
                                          account's images
  GET  /kept-images                       the image copies the app keeps on
                                          the device while cloud sync is off
  GET  /device-images                     every photo file the app has on the
                                          device: downloads cached by
                                          expo-image, its own photos and kept
                                          copies
  POST /gallery-photo                     puts an all-magenta photo in the
                                          device's gallery, the only one
  GET  /screen-color?rgb=<hex>            the share of the screen in that
                                          color, to tell an image is shown
  POST /other-device?email=&name=&category=
                                          adds a recipe the way another device
                                          logged in to the account would
  POST /as-user?email=&fn=&body=          calls a team edge function (generate-
                                          invite, join-team, leave-team,
                                          edit-team, remove-member) as a seeded
                                          account, body is URL-encoded JSON;
                                          answers its status and body
  GET  /team?id=<team>|user=<user>        a team (the one the user hosts or
                                          belongs to): title, host, members by
                                          joined_at, unexpired invites and all
                                          invite rows
  POST /age-invites?team=&seconds=<n>     makes the team's invites look created
                                          n seconds earlier (expired sooner)
  POST /other-device-edit?email=&id=&name=&ingredient=&deleted=
                                          edits (or with deleted=1 deletes) the
                                          account's recipe the way another
                                          device would; only the given fields
  GET  /visible-recipes?email=            the live recipes the account can read
                                          through the API (row level security)
  POST /verify-code?email=&code=&type=    tries a code against local Auth
  POST /login-check?email=&password=      tries a password login against
                                          local Auth
"""
import json
import re
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

KONG = "supabase_kong_OurRecipes"
DB = "supabase_db_OurRecipes"
PORT = 54399
# Every seeded account's password (scripts/e2e/env.sh, supabase/e2e/seed.sql)
E2E_PASSWORD = "e2e-password-1"
REQUEST_LINE = re.compile(r'"([A-Z]+) (\S+) HTTP/[\d.]+"')
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
# Only seeded accounts (supabase/e2e/seed.sql) are ever deleted from RevenueCat
SEEDED_USER = re.compile(r"^e2e00000-0000-0000-0000-[0-9]{12}$")
APP_ID = "com.matamim.app.e2e"
ROOT = Path(__file__).resolve().parents[2]
LOCAL_API = "http://127.0.0.1:54321"
REVENUECAT_API = "https://api.revenuecat.com/v1/subscribers/"


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True)


def kong_requests(since, prefix):
    # Docker takes fractional seconds. Whole seconds would count up to a
    # second of earlier requests.
    logs = run("docker", "logs", "--since", f"{since:.9f}", KONG)
    requests = []
    for line in (logs.stdout + logs.stderr).splitlines():
        match = REQUEST_LINE.search(line)
        if match and match.group(2).startswith(prefix):
            requests.append(f"{match.group(1)} {match.group(2)}")
    return requests


# Rows the seed adds have ids starting with "e2e", so they're left out
SEEDED_ID = {"recipes": "id", "profiles": "id"}


def count_rows(table):
    if table not in SEEDED_ID:
        raise ValueError(f"no seeded id column known for {table}")
    result = run(
        "docker", "exec", DB, "psql", "-U", "postgres", "-d", "postgres",
        "-tAc",
        f"SELECT count(*) FROM public.{table} "
        f"WHERE {SEEDED_ID[table]}::text NOT LIKE 'e2e%'",
    )
    return int(result.stdout.strip())


def wait_for_kong():
    # Any HTTP answer, even an error status, means Kong is serving again
    for _ in range(60):
        try:
            urllib.request.urlopen(f"{LOCAL_API}/rest/v1/", timeout=2)
            return
        except urllib.error.HTTPError:
            return
        except OSError:
            time.sleep(0.5)
    raise ValueError("Kong didn't come back after the restart")


# Airplane mode alone leaves the emulator's Wi-Fi on, and adb reverse works
# without any network, so all three are turned off
def set_network(state):
    if state == "off":
        run("adb", "reverse", "--remove", "tcp:54321")
        # Removing the reverse only refuses new connections. One the app keeps
        # open (HTTP keep-alive) would still reach Kong, so Kong is restarted
        # to close it, as run.sh does at the start of a run. Nothing reaches
        # Kong while offline, so it's waited for when reconnecting.
        run("docker", "restart", KONG)
        run("adb", "shell", "svc", "wifi", "disable")
        run("adb", "shell", "svc", "data", "disable")
    elif state == "on":
        wait_for_kong()
        run("adb", "shell", "svc", "wifi", "enable")
        run("adb", "shell", "svc", "data", "enable")
        run("adb", "reverse", "tcp:54321", "tcp:54321")
    else:
        raise ValueError(f"bad state {state}")


def device_online():
    result = subprocess.run(
        ["adb", "shell", "ping", "-c", "1", "-W", "2", "8.8.8.8"],
        capture_output=True, text=True,
    )
    return result.returncode == 0


# Maestro's eraseText deletes before the cursor, and a tap leaves the cursor
# where it landed, so a field is only cleared from its end
def cursor_to_end():
    run("adb", "shell", "input", "keyevent", "KEYCODE_MOVE_END")


def check_uuid(value):
    if not UUID.match(value):
        raise ValueError(f"bad user id {value}")
    return value


def sql(query):
    result = run(
        "docker", "exec", DB, "psql", "-U", "postgres", "-d", "postgres",
        "-v", "ON_ERROR_STOP=1", "-tAc", query,
    )
    return result.stdout.strip()


def sql_json(query):
    return json.loads(sql(f"SELECT coalesce(json_agg(q), '[]') FROM ({query}) q"))


def env_file_values():
    """The edge functions' secrets, .env.e2e over .env, as run.sh serves them"""
    values = {}
    for name in (".env", ".env.e2e"):
        path = ROOT / "supabase" / "functions" / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                values[key.strip()] = value.strip().strip('"')
    return values


def anon_key():
    result = run("supabase", "status", "-o", "json")
    return json.loads(result.stdout[result.stdout.index("{"):])["ANON_KEY"]


# MMKV keeps every write appended to the file, the last one for a key wins.
# The meta file says where the writes end.
def varint(data, i):
    value = shift = 0
    while True:
        byte = data[i]
        i += 1
        value |= (byte & 0x7F) << shift
        shift += 7
        if byte < 0x80:
            return value, i


def read_app_file(path):
    return subprocess.run(
        ["adb", "exec-out", "run-as", APP_ID, "cat", path],
        capture_output=True, check=True,
    ).stdout


def mmkv_values(name):
    data = read_app_file(f"files/mmkv/{name}")
    meta = read_app_file(f"files/mmkv/{name}.crc")
    end = 4 + struct.unpack("<I", meta[28:32])[0]
    _, i = varint(data, 4)
    values = {}
    while i < end:
        key_length, i = varint(data, i)
        key = data[i:i + key_length].decode()
        i += key_length
        value_length, i = varint(data, i)
        value = data[i:i + value_length]
        i += value_length
        if value_length == 0:
            values.pop(key, None)  # removed
            continue
        # A string value is itself length-prefixed
        string_length, j = varint(value, 0)
        values[key] = value[j:j + string_length].decode()
    return values


def recipe_rows(recipe):
    # The ingredients and steps in sort_order, and whether both are numbered
    # 0..n-1 (what saving a recipe with dropped rows has to leave)
    ingredients = sorted(
        recipe.get("ingredients") or [], key=lambda row: row.get("sort_order", 0)
    )
    steps = sorted(
        recipe.get("instructions") or [], key=lambda row: row.get("sort_order", 0)
    )
    return {
        "ingredients": [
            {"amount": row.get("amount"), "unit": row.get("unit"), "item": row.get("item")}
            for row in ingredients
        ],
        "steps": [row.get("text") for row in steps],
        "sort_orders_ok": all(
            [row.get("sort_order") for row in rows] == list(range(len(rows)))
            for rows in (ingredients, steps)
        ),
    }


def device_recipes():
    values = mmkv_values("legend_state")
    recipes = json.loads(values.get("recipes", "{}")) or {}
    meta = json.loads(values.get("recipes__m", "{}")) or {}
    team_recipes = json.loads(values.get("team_recipes", "{}")) or {}
    return {
        # Written once on first launch and never cleared, so its absence means
        # the storage wasn't read, and a count of 0 would mean nothing
        "storage_read": "migrated_from_async_storage" in values,
        "team_recipes": len(team_recipes),
        "team_names": sorted(
            r.get("name") for r in team_recipes.values() if isinstance(r, dict)
        ),
        "recipes": [
            {
                "id": r.get("id"), "name": r.get("name"),
                "user_id": r.get("user_id"), "image": r.get("image"),
                **recipe_rows(r),
            }
            for r in recipes.values()
            if isinstance(r, dict)
        ],
        "pending": len(meta.get("pending") or {}),
    }


def kept_images():
    # exec-out mixes in errors and always succeeds, so the app's folder is
    # checked to be readable first. No kept-images folder is no copies.
    output = run(
        "adb", "exec-out", "run-as", APP_ID, "sh", "-c",
        "ls -d files/mmkv >/dev/null && echo READABLE; "
        "ls files/kept-images 2>/dev/null",
    ).stdout.split()
    if not output or output[0] != "READABLE":
        raise ValueError("the app's files couldn't be read")
    return sorted(output[1:])


# Where the app keeps photos: expo-image's disk cache (Glide's default
# internal cache folder) for downloaded ones, photos not uploaded yet
# (utils/imageStorage.ts) and the copies kept while cloud sync is off
IMAGE_FOLDERS = {
    "cached": "cache/image_manager_disk_cache",
    "local": "files/recipe-images",
    "kept": "files/kept-images",
}


def device_images():
    # As in kept_images, the app's folder is checked to be readable first. A
    # missing folder has no files. Glide's cache keeps a journal next to the
    # files, which isn't a photo.
    script = "ls -d files/mmkv >/dev/null && echo READABLE; " + "".join(
        f"echo '#{name}'; ls {folder} 2>/dev/null; "
        for name, folder in IMAGE_FOLDERS.items()
    )
    output = run(
        "adb", "exec-out", "run-as", APP_ID, "sh", "-c", script,
    ).stdout.split()
    if not output or output[0] != "READABLE":
        raise ValueError("the app's files couldn't be read")
    files = {name: [] for name in IMAGE_FOLDERS}
    current = None
    for line in output[1:]:
        if line.startswith("#") and line[1:] in files:
            current = line[1:]
        elif current and not line.startswith("journal"):
            files[current].append(line)
    return {name: sorted(names) for name, names in files.items()}


GALLERY_PHOTO = "/sdcard/Pictures/e2e-magenta.jpg"


def gallery_photo():
    from PIL import Image
    import tempfile
    with tempfile.TemporaryDirectory() as directory:
        path = f"{directory}/e2e-magenta.jpg"
        Image.new("RGB", (800, 600), (255, 0, 255)).save(path, "JPEG", quality=95)
        # Other photos would make which one is picked unclear
        run("adb", "shell", "rm -rf /sdcard/Pictures/* /sdcard/DCIM/*; true")
        run("adb", "shell", "mkdir", "-p", "/sdcard/Pictures")
        run("adb", "push", path, GALLERY_PHOTO)
    run(
        "adb", "shell", "content", "call", "--method", "scan_volume",
        "--uri", "content://media", "--arg", "external_primary",
    )
    photos = run(
        "adb", "shell", "content", "query", "--uri",
        "content://media/external/images/media", "--projection", "_display_name",
    ).stdout
    if photos.count("Row:") != 1 or "e2e-magenta.jpg" not in photos:
        raise ValueError(f"the gallery should have only the e2e photo: {photos}")


def screen_color(rgb, tolerance=40):
    from io import BytesIO
    from PIL import Image
    png = subprocess.run(
        ["adb", "exec-out", "screencap", "-p"], capture_output=True, check=True,
    ).stdout
    image = Image.open(BytesIO(png)).convert("RGB")
    image.thumbnail((360, 800))
    target = tuple(int(rgb[i:i + 2], 16) for i in (0, 2, 4))
    pixels = list(image.getdata())
    matching = sum(
        1 for pixel in pixels
        if all(abs(pixel[c] - target[c]) <= tolerance for c in range(3))
    )
    return matching / len(pixels)


def keeps_screen_on():
    windows = run("adb", "shell", "dumpsys", "window", "windows").stdout
    # The app's activity window, and its flags line
    for block in re.split(r"\n  Window #", windows):
        if APP_ID in block.split("\n", 1)[0]:
            flags = re.search(r"fl=([A-Z_ |]+)", block)
            if flags:
                return "KEEP_SCREEN_ON" in flags.group(1)
    raise ValueError("the app has no window")


# Every column that points at a user. Any foreign key to a user that isn't
# here is reported, so a new table can't go unchecked.
USER_COLUMNS = {
    "auth.users": "id",
    "auth.identities": "user_id",
    "auth.sessions": "user_id",
    "auth.refresh_tokens": "user_id",
    "auth.one_time_tokens": "user_id",
    "auth.mfa_factors": "user_id",
    "auth.mfa_recovery_code_sets": "user_id",
    "auth.oauth_authorizations": "user_id",
    "auth.oauth_consents": "user_id",
    "auth.scim_users": "user_id",
    "auth.webauthn_challenges": "user_id",
    "auth.webauthn_credentials": "user_id",
    "public.profiles": "id",
    "public.recipes": "user_id",
    "public.teams": "host_id",
    "public.team_members": "user_id",
    "public.team_invites": "created_by",
    "public.premium_entitlements": "user_id",
    "public.cloud_sync_state": "user_id",
    "public.free_ai_imports": "user_id",
    "public.ai_import_events": "user_id",
}


def user_rows(user):
    check_uuid(user)
    counts = {
        table: int(sql(f"SELECT count(*) FROM {table} WHERE {column}::text = '{user}'"))
        for table, column in USER_COLUMNS.items()
    }
    counts["storage.objects"] = int(sql(
        f"SELECT count(*) FROM storage.objects WHERE name LIKE '{user}/%'"
    ))
    referencing = sql(
        "SELECT DISTINCT c.conrelid::regclass::text || '.' || a.attname "
        "FROM pg_constraint c JOIN pg_attribute a "
        "ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) "
        "WHERE c.contype = 'f' AND c.confrelid IN "
        "('auth.users'::regclass, 'public.profiles'::regclass)"
    ).splitlines()
    covered = set()
    for table, column in USER_COLUMNS.items():
        covered.add(f"{table}.{column}")
        covered.add(f"{table.removeprefix('public.')}.{column}")
    return {
        "rows": counts,
        "total": sum(counts.values()),
        "uncovered": sorted(set(referencing) - covered),
    }


def account(user):
    check_uuid(user)
    rows = sql_json(
        "SELECT u.email AS auth_email, "
        "u.raw_user_meta_data->>'display_name' AS display_name, "
        "p.email AS profile_email, p.username AS profile_username "
        f"FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id "
        f"WHERE u.id = '{user}'"
    )
    return rows[0] if rows else {}


def revenuecat(method, user, path="", payload=None):
    secrets = env_file_values()
    request = urllib.request.Request(
        REVENUECAT_API + quote(user, safe="") + path,
        method=method,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {secrets['REVENUECAT_SECRET_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read() or b"{}")


def entitlement_id():
    return env_file_values().get("REVENUECAT_ENTITLEMENT_ID", "premium")


def revenuecat_active(user):
    subscriber = revenuecat("GET", user).get("subscriber") or {}
    entitlement = (subscriber.get("entitlements") or {}).get(entitlement_id())
    expires = entitlement and entitlement.get("expires_date")
    return bool(entitlement) and (
        expires is None
        or datetime.fromisoformat(expires.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    )


def premium(user):
    check_uuid(user)
    rows = sql_json(
        "SELECT expires_at, (expires_at IS NULL OR expires_at > now()) AS active "
        f"FROM public.premium_entitlements WHERE user_id = '{user}'"
    )
    return {
        "db_rows": len(rows),
        "db_active": any(row["active"] for row in rows),
        "revenuecat_active": revenuecat_active(user),
    }


# Seeded premium accounts get premium once, and keep it across runs, so no
# purchases or customers pile up in RevenueCat
def grant_revenuecat(user):
    if not SEEDED_USER.match(user):
        raise ValueError(f"{user} is not a seeded e2e account")
    if revenuecat_active(user):
        return {"granted": False, "active": True}
    path = f"/entitlements/{quote(entitlement_id(), safe='')}/promotional"
    revenuecat("POST", user, path, {"duration": "lifetime"})
    return {"granted": True, "active": revenuecat_active(user)}


def reset_revenuecat(user):
    if not SEEDED_USER.match(user):
        raise ValueError(f"{user} is not a seeded e2e account")
    try:
        revenuecat("DELETE", user)
    except urllib.error.HTTPError as error:
        if error.code != 404:  # Never seen by RevenueCat is already reset
            raise ValueError(f"RevenueCat answered {error.code}") from error


# Codes expire by the time they were sent, which Auth keeps on the user
def age_codes(user, seconds):
    check_uuid(user)
    seconds = int(seconds)
    shift = f"interval '{seconds} seconds'"
    sql(
        f"UPDATE auth.users SET "
        f"recovery_sent_at = recovery_sent_at - {shift}, "
        f"confirmation_sent_at = confirmation_sent_at - {shift}, "
        f"email_change_sent_at = email_change_sent_at - {shift}, "
        f"reauthentication_sent_at = reauthentication_sent_at - {shift} "
        f"WHERE id = '{user}'"
    )
    sql(
        f"UPDATE auth.one_time_tokens SET created_at = created_at - {shift}, "
        f"updated_at = updated_at - {shift} WHERE user_id = '{user}'"
    )


def cloud(user):
    check_uuid(user)
    recipes = sql_json(
        "SELECT id, name, category, image, is_deleted, updated_at, "
        "jsonb_array_length(ingredients) AS ingredient_count, "
        "ingredients->0->>'item' AS first_ingredient "
        f"FROM public.recipes WHERE user_id = '{user}' ORDER BY name"
    )
    images = sql_json(
        "SELECT name, (metadata->>'size')::int AS size, created_at "
        f"FROM storage.objects WHERE bucket_id = 'recipe-images' "
        f"AND name LIKE '{user}/%' ORDER BY name"
    )
    state = sql_json(
        "SELECT off_since, purged_at, "
        "extract(epoch FROM now() - off_since)::int AS off_seconds "
        f"FROM public.cloud_sync_state WHERE user_id = '{user}'"
    )
    setting = sql(
        "SELECT raw_user_meta_data->>'is_syncing_to_cloud' "
        f"FROM auth.users WHERE id = '{user}'"
    )
    return {
        "recipes": recipes,
        "images": images,
        "state": state[0] if state else None,
        "setting": setting or None,
    }


def age_sync_off(user, days):
    check_uuid(user)
    sql(
        f"UPDATE public.cloud_sync_state SET off_since = off_since - "
        f"interval '{int(days)} days' WHERE user_id = '{user}'"
    )


def purge_cloud():
    return int(sql("SELECT public.purge_cloud_sync_off_recipes()"))


# The nightly job only removes images older than a week, so the account's
# images are made to look older first. Then it's the real function.
def purge_images(user):
    check_uuid(user)
    sql(
        "UPDATE storage.objects SET created_at = created_at - interval '8 days' "
        f"WHERE bucket_id = 'recipe-images' AND name LIKE '{user}/%'"
    )
    request = urllib.request.Request(
        f"{LOCAL_API}/functions/v1/purge-images",
        method="POST",
        data=b"{}",
        headers={
            "Authorization": env_file_values()["PURGE_AUTH"],
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def login_session(email):
    request = urllib.request.Request(
        f"{LOCAL_API}/auth/v1/token?grant_type=password",
        method="POST",
        data=json.dumps({"email": email, "password": E2E_PASSWORD}).encode(),
        headers={"apikey": anon_key(), "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read())


def other_device_recipe(email, name, category):
    session = login_session(email)
    recipe = {
        "user_id": session["user"]["id"],
        "name": name,
        "category": category,
        "prep_time": "20",
        "servings": "2",
        "difficulty": "easy",
        "ingredients": [{"id": "i1", "sort_order": 0, "item": "Salt", "amount": "1", "unit": ""}],
        "instructions": [{"id": "s1", "sort_order": 0, "text": "Mix"}],
    }
    request = urllib.request.Request(
        f"{LOCAL_API}/rest/v1/recipes",
        method="POST",
        data=json.dumps(recipe).encode(),
        headers={
            "apikey": anon_key(),
            "Authorization": f"Bearer {session['access_token']}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read())[0]["id"]


AS_USER_FUNCTIONS = {
    "generate-invite", "join-team", "leave-team", "edit-team", "remove-member",
}


def check_seeded_email(email):
    if not re.match(r"^[a-z0-9]+@e2e\.test$", email):
        raise ValueError(f"{email} is not a seeded e2e account")
    return email


def as_user(email, fn, body):
    if fn not in AS_USER_FUNCTIONS:
        raise ValueError(f"{fn} can't be called as a user")
    session = login_session(check_seeded_email(email))
    request = urllib.request.Request(
        f"{LOCAL_API}/functions/v1/{fn}",
        method="POST",
        data=body.encode(),
        headers={
            "apikey": anon_key(),
            "Authorization": f"Bearer {session['access_token']}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    try:
        parsed = json.loads(raw or b"null")
    except json.JSONDecodeError:
        parsed = raw.decode(errors="replace")
    return {"status": status, "body": parsed}


def team(team_id=None, user=None):
    if team_id:
        where = f"t.id = '{check_uuid(team_id)}'"
    elif user:
        check_uuid(user)
        where = (
            f"t.host_id = '{user}' OR t.id IN "
            f"(SELECT team_id FROM public.team_members WHERE user_id = '{user}')"
        )
    else:
        raise ValueError("id or user is needed")
    rows = sql_json(
        f"SELECT t.id, t.title, t.host_id FROM public.teams t WHERE {where}"
    )
    if not rows:
        return {
            "exists": False, "id": None, "title": None, "host_id": None,
            "members": [], "invites": [], "invite_rows": 0,
        }
    found = rows[0]
    members = [
        row["user_id"] for row in sql_json(
            "SELECT user_id FROM public.team_members "
            f"WHERE team_id = '{found['id']}' ORDER BY joined_at, user_id"
        )
    ]
    invites = sql_json(
        "SELECT code, extract(epoch FROM expires_at - now())::int AS seconds_left "
        f"FROM public.team_invites WHERE team_id = '{found['id']}' "
        "AND expires_at > now() ORDER BY expires_at DESC"
    )
    invite_rows = int(sql(
        f"SELECT count(*) FROM public.team_invites WHERE team_id = '{found['id']}'"
    ))
    return {
        "exists": True, "id": found["id"], "title": found["title"],
        "host_id": found["host_id"], "members": members, "invites": invites,
        "invite_rows": invite_rows,
    }


# team_invites keeps only expires_at, so an invite is aged by moving that back
def age_invites(team_id, seconds):
    check_uuid(team_id)
    sql(
        "UPDATE public.team_invites SET expires_at = expires_at - "
        f"interval '{int(seconds)} seconds' WHERE team_id = '{team_id}'"
    )


def rest_headers(session):
    return {
        "apikey": anon_key(),
        "Authorization": f"Bearer {session['access_token']}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def rest(method, path, session, payload=None):
    request = urllib.request.Request(
        f"{LOCAL_API}/rest/v1/{path}",
        method=method,
        data=None if payload is None else json.dumps(payload).encode(),
        headers=rest_headers(session),
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read() or b"[]")


# The recipes table's handle_times trigger sets updated_at on every UPDATE,
# as for an edit from the app, so the change is pulled like one
def other_device_edit(email, recipe_id, name, ingredient, deleted):
    check_uuid(recipe_id)
    session = login_session(check_seeded_email(email))
    user = session["user"]["id"]
    path = f"recipes?id=eq.{recipe_id}&user_id=eq.{user}"
    change = {}
    if name:
        change["name"] = name
    if ingredient:
        current = rest("GET", path + "&select=ingredients", session)
        if not current:
            raise ValueError("the account has no such recipe")
        ingredients = current[0]["ingredients"]
        ingredients[0]["item"] = ingredient
        change["ingredients"] = ingredients
    if deleted:
        change["is_deleted"] = True
    if not change:
        raise ValueError("nothing to change")
    rows = rest("PATCH", path, session, change)
    if len(rows) != 1:
        raise ValueError("the account has no such recipe")
    return {"id": rows[0]["id"], "updated_at": rows[0]["updated_at"]}


def visible_recipes(email):
    session = login_session(check_seeded_email(email))
    rows = rest("GET", "recipes?is_deleted=eq.false&select=name", session)
    return sorted(row["name"] for row in rows)


def verify_code(email, code, kind):
    return auth_post("verify", {"email": email, "token": code, "type": kind})


def auth_post(path, payload):
    request = urllib.request.Request(
        f"{LOCAL_API}/auth/v1/{path}",
        method="POST",
        data=json.dumps(payload).encode(),
        headers={"apikey": anon_key(), "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def login_check(email, password):
    return auth_post("token?grant_type=password", {"email": email, "password": password})


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_request(self, method):
        url = urlparse(self.path)
        query = {key: values[0] for key, values in parse_qs(url.query).items()}
        try:
            if method == "GET" and url.path == "/now":
                return self.reply(200, {"now": time.time()})
            if method == "GET" and url.path == "/requests":
                found = kong_requests(float(query["since"]), query["path"])
                return self.reply(200, {"count": len(found), "requests": found})
            if method == "GET" and url.path == "/count":
                return self.reply(200, {"count": count_rows(query["table"])})
            if method == "GET" and url.path == "/online":
                return self.reply(200, {"online": device_online()})
            if method == "POST" and url.path == "/network":
                set_network(query["state"])
                return self.reply(200, {"state": query["state"]})
            if method == "POST" and url.path == "/cursor-end":
                cursor_to_end()
                return self.reply(200, {})
            if method == "GET" and url.path == "/device-recipes":
                return self.reply(200, device_recipes())
            if method == "GET" and url.path == "/keep-screen-on":
                on = keeps_screen_on()
                deadline = time.time() + float(query.get("watch", 0))
                while not on and time.time() < deadline:
                    time.sleep(0.3)
                    on = keeps_screen_on()
                return self.reply(200, {"on": on})
            if method == "GET" and url.path == "/user-rows":
                return self.reply(200, user_rows(query["user"]))
            if method == "GET" and url.path == "/account":
                return self.reply(200, account(query["user"]))
            if method == "GET" and url.path == "/premium":
                return self.reply(200, premium(query["user"]))
            if method == "POST" and url.path == "/revenuecat-grant":
                return self.reply(200, grant_revenuecat(query["user"]))
            if method == "POST" and url.path == "/revenuecat-reset":
                reset_revenuecat(query["user"])
                return self.reply(200, {})
            if method == "POST" and url.path == "/age-codes":
                age_codes(query["user"], query["seconds"])
                return self.reply(200, {})
            if method == "GET" and url.path == "/cloud":
                return self.reply(200, cloud(query["user"]))
            if method == "POST" and url.path == "/age-sync-off":
                age_sync_off(query["user"], query["days"])
                return self.reply(200, {})
            if method == "POST" and url.path == "/purge-cloud":
                return self.reply(200, {"purged": purge_cloud()})
            if method == "POST" and url.path == "/purge-images":
                return self.reply(200, purge_images(query["user"]))
            if method == "GET" and url.path == "/kept-images":
                return self.reply(200, {"files": kept_images()})
            if method == "GET" and url.path == "/device-images":
                return self.reply(200, device_images())
            if method == "POST" and url.path == "/gallery-photo":
                gallery_photo()
                return self.reply(200, {})
            if method == "GET" and url.path == "/screen-color":
                return self.reply(200, {"share": screen_color(query["rgb"])})
            if method == "POST" and url.path == "/other-device":
                recipe_id = other_device_recipe(
                    query["email"], query["name"], query["category"],
                )
                return self.reply(200, {"id": recipe_id})
            if method == "POST" and url.path == "/as-user":
                return self.reply(200, as_user(
                    query["email"], query["fn"], query.get("body", "{}"),
                ))
            if method == "GET" and url.path == "/team":
                return self.reply(200, team(query.get("id"), query.get("user")))
            if method == "POST" and url.path == "/age-invites":
                age_invites(query["team"], query["seconds"])
                return self.reply(200, {})
            if method == "POST" and url.path == "/other-device-edit":
                return self.reply(200, other_device_edit(
                    query["email"], query["id"], query.get("name"),
                    query.get("ingredient"), query.get("deleted") == "1",
                ))
            if method == "GET" and url.path == "/visible-recipes":
                return self.reply(200, {"names": visible_recipes(query["email"])})
            if method == "POST" and url.path == "/verify-code":
                status = verify_code(query["email"], query["code"], query["type"])
                return self.reply(200, {"status": status})
            if method == "POST" and url.path == "/login-check":
                status = login_check(query["email"], query["password"])
                return self.reply(200, {"status": status})
            return self.reply(404, {"error": "unknown endpoint"})
        except (
            KeyError, ValueError, json.JSONDecodeError, urllib.error.URLError,
            subprocess.CalledProcessError,
        ) as error:
            return self.reply(400, {"error": str(error)})

    def do_GET(self):
        self.handle_request("GET")

    def do_POST(self):
        self.handle_request("POST")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"probe listening on 127.0.0.1:{PORT}", flush=True)
    sys.stdout.flush()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

"""Smoke test of the production backend, before a release or on a schedule.

Checks what the e2e flows can't, since they only run against local Supabase:

  1. Every local migration is applied on prod
  2. Every edge function is deployed and active, and none is older than its
     last commit (a warning, since a deploy can come before the commit)
  3. A real sign-up: Supabase sends the code email through Resend to one of
     Resend's test addresses, the code from it confirms the account, and the
     account gets a profile
  4. sync-premium answers for the new account (reaches RevenueCat)
  5. delete-account removes the account, which also cleans up after the run

Needs:
  - the Supabase CLI logged in and linked to prod (checks 1 and 2), or
    SUPABASE_ACCESS_TOKEN set
  - RESEND_API_KEY, a full access key (sending only keys can't read emails)

Run from anywhere: python3 scripts/smoke/prod.py
Exits non-zero if any check fails.
"""

import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESEND_API = "https://api.resend.com"
# How long Resend gets to show the code email
EMAIL_TIMEOUT_SECONDS = 90
# Must match the subject in supabase/config.toml, the account is made in English
EXPECTED_SUBJECT = "Your Matamim sign up code"

failures: list[str] = []


def ok(message: str):
    print(f"  PASS  {message}")


def warn(message: str):
    print(f"  WARN  {message}")


def fail(message: str):
    print(f"  FAIL  {message}")
    failures.append(message)


def read_env_file() -> dict[str, str]:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key] = value
    return env


def request(method: str, url: str, headers: dict, body=None):
    """Returns (status, parsed JSON or raw text), also for error statuses"""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Content-Type": "application/json",
        # Resend's API sits behind Cloudflare, which blocks urllib's default
        "User-Agent": "matamim-smoke-test",
        **headers,
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            status, raw = res.status, res.read().decode()
    except urllib.error.HTTPError as err:
        status, raw = err.code, err.read().decode()
    try:
        return status, json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return status, raw


def supabase_cli(*args: str):
    result = subprocess.run(
        ["supabase", *args, "-o", "json"],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return json.loads(result.stdout)


def check_linked_to_prod(supabase_url: str) -> bool:
    print("Linked project")
    ref_file = ROOT / "supabase" / ".temp" / "project-ref"
    prod_ref = re.sub(r"^https?://([^.]+)\..*$", r"\1", supabase_url)
    linked_ref = ref_file.read_text().strip() if ref_file.exists() else None
    if linked_ref != prod_ref:
        fail(f"the CLI is linked to {linked_ref}, not prod ({prod_ref}). "
             f"Run: supabase link --project-ref {prod_ref}")
        return False
    ok(f"linked to prod ({prod_ref})")
    return True


def check_migrations():
    print("Migrations")
    local = {
        path.name.split("_", 1)[0]
        for path in (ROOT / "supabase" / "migrations").glob("*.sql")
    }
    try:
        result = supabase_cli(
            "db", "query", "--linked",
            "select version from supabase_migrations.schema_migrations",
        )
    except Exception as err:
        fail(f"could not read prod's migrations: {err}")
        return
    # --linked returns the rows as a list, --local wraps them in "rows"
    rows = result["rows"] if isinstance(result, dict) else result
    remote = {row["version"] for row in rows}

    missing = sorted(local - remote)
    if missing:
        fail(f"not applied on prod: {', '.join(missing)} "
             f"(run: supabase db push)")
    else:
        ok(f"all {len(local)} migrations applied")
    extra = sorted(remote - local)
    if extra:
        warn(f"applied on prod but not in the repo: {', '.join(extra)}")


def last_commit_time(*paths: str) -> int:
    out = subprocess.run(
        ["git", "log", "-1", "--format=%ct", "--", *paths],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout.strip()
    return int(out) if out else 0


def check_functions():
    print("Edge functions")
    local = sorted(
        path.name for path in (ROOT / "supabase" / "functions").iterdir()
        if path.is_dir() and not path.name.startswith("_")
    )
    try:
        result = supabase_cli("functions", "list")
        deployed = {fn["slug"]: fn for fn in result}
    except Exception as err:
        fail(f"could not list prod's functions: {err}")
        return

    for slug in local:
        fn = deployed.get(slug)
        if not fn:
            fail(f"{slug} is not deployed "
                 f"(run: supabase functions deploy {slug})")
            continue
        if fn.get("status") != "ACTIVE":
            fail(f"{slug} is {fn.get('status')}")
            continue
        # updated_at is in milliseconds
        deployed_at = int(fn.get("updated_at", 0)) // 1000
        committed_at = last_commit_time(
            f"supabase/functions/{slug}", "supabase/functions/_shared",
        )
        if deployed_at < committed_at:
            warn(f"{slug} was deployed before its last commit, "
                 f"it may be outdated")
        else:
            ok(f"{slug} is deployed")


def find_resend_email(resend_key: str, address: str):
    """Waits for the email to the address to show up in Resend, returns it"""
    headers = {"Authorization": f"Bearer {resend_key}"}
    deadline = time.time() + EMAIL_TIMEOUT_SECONDS
    while time.time() < deadline:
        status, body = request("GET", f"{RESEND_API}/emails?limit=20", headers)
        if status != 200:
            raise RuntimeError(f"Resend answered {status}: {body}")
        for item in body.get("data", []):
            if address in item.get("to", []):
                status, email = request(
                    "GET", f"{RESEND_API}/emails/{item['id']}", headers,
                )
                if status != 200:
                    raise RuntimeError(f"Resend answered {status}: {email}")
                return email
        time.sleep(5)
    return None


def check_signup_flow(supabase_url: str, publishable_key: str, resend_key: str):
    print("Sign-up through Resend")
    # A Resend test address: delivered for real, but to no one
    address = f"delivered+smoke-{int(time.time())}@resend.dev"
    # The suffix meets any password requirements prod might have
    password = secrets.token_urlsafe(24) + "Aa1!"
    api_headers = {"apikey": publishable_key}

    status, body = request(
        "POST", f"{supabase_url}/auth/v1/signup", api_headers,
        {
            "email": address,
            "password": password,
            "data": {
                "full_name": "Smoke Test",
                "display_name": "Smoke Test",
                "language": "en",
            },
        },
    )
    if status != 200:
        fail(f"sign-up answered {status}: {body}")
        return
    if body.get("access_token"):
        fail("sign-up logged in right away, email confirmation is off on prod")
        return
    ok(f"signed up {address}")

    try:
        email = find_resend_email(resend_key, address)
    except Exception as err:
        fail(f"could not read emails from Resend: {err}")
        return
    if not email:
        fail(f"no email to {address} in Resend after "
             f"{EMAIL_TIMEOUT_SECONDS}s. Check Logs > Auth in Supabase. "
             f"The unconfirmed account stays behind, delete it in "
             f"Authentication > Users")
        return
    ok(f"Resend has the email (last event: {email.get('last_event')})")

    if email.get("subject") != EXPECTED_SUBJECT:
        fail(f"subject is {email.get('subject')!r}, expected "
             f"{EXPECTED_SUBJECT!r}. Prod's email templates don't match "
             f"config.toml (Authentication > Email Templates)")
    else:
        ok("subject comes from the app's template")

    match = re.search(r">\s*(\d{6,10})\s*<", email.get("html") or "")
    if not match:
        fail("no code in the email")
        return

    status, session = request(
        "POST", f"{supabase_url}/auth/v1/verify", api_headers,
        {"type": "email", "email": address, "token": match.group(1)},
    )
    if status != 200 or not session.get("access_token"):
        fail(f"the emailed code didn't confirm the account ({status}): "
             f"{session}")
        return
    ok("the emailed code confirmed the account")

    user_id = session["user"]["id"]
    user_headers = {
        **api_headers,
        "Authorization": f"Bearer {session['access_token']}",
    }

    try:
        status, rows = request(
            "GET",
            f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}&select=id",
            user_headers,
        )
        if status == 200 and len(rows) == 1:
            ok("the account has a profile")
        else:
            fail(f"no profile for the account ({status}): {rows}")

        status, body = request(
            "POST", f"{supabase_url}/functions/v1/sync-premium", user_headers, {},
        )
        if status == 200 and body.get("isPremium") is False:
            ok("sync-premium answered, the account is free")
        else:
            fail(f"sync-premium answered {status}: {body}")
    finally:
        # Always, so a failed check doesn't leave the account behind
        status, body = request(
            "POST", f"{supabase_url}/functions/v1/delete-account",
            user_headers, {},
        )
        if status == 200:
            ok("delete-account removed the account")
        else:
            fail(f"delete-account answered {status}: {body}. Delete "
                 f"{address} in Authentication > Users")


def main():
    env = read_env_file()
    supabase_url = env.get("EXPO_PUBLIC_SUPABASE_URL")
    publishable_key = env.get("EXPO_PUBLIC_SUPABASE_KEY")
    resend_key = os.environ.get("RESEND_API_KEY")
    if not supabase_url or not publishable_key:
        sys.exit("smoke: no prod Supabase URL or key in .env")
    if not resend_key:
        sys.exit("smoke: set RESEND_API_KEY (a full access key)")

    print(f"Smoke testing {supabase_url}\n")
    if check_linked_to_prod(supabase_url):
        check_migrations()
        check_functions()
    check_signup_flow(supabase_url, publishable_key, resend_key)

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        sys.exit(1)
    print("All checks passed")


if __name__ == "__main__":
    main()

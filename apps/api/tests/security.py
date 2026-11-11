#!/usr/bin/env python3
"""
POLARSIGHT security regression suite.

Authorised probes against a LOCAL development stack. Each check carries
the vulnerability id it covers (PS-xx, see
docs/security/VULNERABILITY_REGISTER.md), so the same file reproduces
a finding before its fix and proves the fix afterwards.

    python3 apps/api/tests/security.py
    python3 apps/api/tests/security.py --with-bruteforce   # exhausts this address's sign-in limit

Never point this at production: it creates administrators and roles,
submits applications with deliberately malformed files and, with
--with-bruteforce, locks this address out of sign-in for the rate
limit window. Every fixture is synthetic and harmless.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import http.cookiejar
import json
import os
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from integration import Client, LocalhostCookiePolicy, Results, decode, dig, load_env  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]


# ── Helpers ─────────────────────────────────────────────────────────


def raw(method: str, url: str, *, headers=None, body: bytes | None = None):
    """One request with explicit headers and no cookie jar. Returns status, headers, body."""
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, {k.lower(): v for k, v in res.headers.items()}, decode(res.read(), False)
    except urllib.error.HTTPError as err:
        return err.code, {k.lower(): v for k, v in err.headers.items()}, decode(err.read(), False)
    except urllib.error.URLError as err:
        return 0, {}, {"error": {"message": str(err.reason)}}


def cookie_value(client: Client, name: str) -> str | None:
    return next((c.value for c in client.jar if c.name == name), None)


def totp(secret_b32: str, at: float | None = None) -> str:
    """RFC 6238, matching apps/api/src/lib/totp.ts."""
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    bits = "".join(f"{alphabet.index(c):05b}" for c in secret_b32.upper() if c in alphabet)
    key = bytes(int(bits[i : i + 8], 2) for i in range(0, len(bits) - len(bits) % 8, 8))
    counter = int((at or time.time()) // 30)
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    code = (int.from_bytes(mac[offset : offset + 4], "big") & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def storage_key_of_latest_resume() -> str | None:
    """Reads the newest private asset's key straight from the database."""
    try:
        out = subprocess.run(
            ["docker", "exec", "polarsight-postgres", "psql", "-U", "polarsight", "-d", "polarsight", "-At", "-c",
             "select storage_key from media_assets where is_private order by created_at desc limit 1"],
            capture_output=True, text=True, timeout=20,
        ).stdout.strip()
        return out or None
    except Exception:
        return None


# ── Fixtures: synthetic and harmless ───────────────────────────────

PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF\n"
)
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def form(run: str, tag: str) -> dict[str, object]:
    return {
        "fullName": f"Probe {tag} {run}",
        "email": f"probe.{tag}.{run}@example.com",
        "appliedPosition": "Security probe position",
    }


# ── Suite ───────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5000")
    ap.add_argument("--web", default="http://localhost:3000")
    ap.add_argument("--admin", default="http://localhost:3001")
    ap.add_argument("--with-bruteforce", action="store_true")
    args = ap.parse_args()

    env = load_env()
    email = os.environ.get("SEED_ADMIN_EMAIL") or env.get("SEED_ADMIN_EMAIL")
    password = os.environ.get("SEED_ADMIN_PASSWORD") or env.get("SEED_ADMIN_PASSWORD")
    if not email or not password:
        print("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set", file=sys.stderr)
        return 2

    host = args.base.rstrip("/")
    base = f"{host}/api"
    r = Results()
    run = uuid.uuid4().hex[:8]
    cleanup: list[str] = []

    admin = Client(base)
    code, body = admin.post("/auth/login", {"email": email, "password": password})
    if code != 200:
        print(f"Cannot sign in as the seed administrator ({code}); is the API running?", file=sys.stderr)
        return 2
    super_id = dig(body, "user.id")
    admin.post("/auth/reauth", {"password": password})
    anon = Client(base)

    code, integ = admin.get("/settings/integrations")
    scanner_ok = bool(dig(integ, "malwareScanner.ok"))
    r.note(f"scanner reachable: {scanner_ok}")

    # ── A07 · Session handling ─────────────────────────────────
    r.heading("PS-05 · The session token never reaches JavaScript")
    r.assert_true("sign-in body carries no access token", "accessToken" not in body)
    status, headers, _ = raw("POST", f"{base}/auth/login",
                             headers={"Content-Type": "application/json", "Origin": "http://localhost:3001"},
                             body=json.dumps({"email": email, "password": password}).encode())
    sc = headers.get("set-cookie", "").lower()
    r.assert_true("session cookie is HttpOnly", "httponly" in sc)
    r.assert_true("session cookie declares SameSite", "samesite" in sc)
    r.assert_true("authenticated responses are not cacheable", "no-store" in headers.get("cache-control", ""))

    r.heading("PS-04 · Signing out ends the session at once")
    victim = Client(base)
    victim.post("/auth/login", {"email": email, "password": password})
    token = cookie_value(victim, "ps_access")
    code, _ = victim.post("/auth/logout")
    r.expect("sign out", 204, code)
    status, _, _ = raw("GET", f"{base}/auth/me", headers={"Authorization": f"Bearer {token}"})
    r.assert_true("a captured access token is dead after sign-out", status == 401, f"got {status}")

    r.heading("PS-07 · Refresh-token rotation and reuse detection")
    c = Client(base)
    c.post("/auth/login", {"email": email, "password": password})
    old_refresh = cookie_value(c, "ps_refresh")
    code, _ = c.post("/auth/refresh")
    r.expect("rotate", 200, code)
    new_refresh = cookie_value(c, "ps_refresh")
    r.assert_true("refresh token changed", old_refresh != new_refresh)
    status, _, _ = raw("POST", f"{base}/auth/refresh", headers={"Cookie": f"ps_refresh={old_refresh}", "Origin": "http://localhost:3001"})
    r.assert_true("replaying the old refresh token is refused", status == 401, f"got {status}")
    status, _, _ = raw("POST", f"{base}/auth/refresh", headers={"Cookie": f"ps_refresh={new_refresh}", "Origin": "http://localhost:3001"})
    r.assert_true("the whole family is revoked after a replay", status == 401, f"got {status}")

    r.heading("PS-14 · Sign-in failures do not reveal account state")
    _, wrong = Client(base).post("/auth/login", {"email": email, "password": f"wrong-{run}"})
    _, nobody = Client(base).post("/auth/login", {"email": f"nobody-{run}@example.com", "password": "wrong"})
    r.assert_true(
        "unknown address and wrong password produce the same message",
        dig(wrong, "error.message") == dig(nobody, "error.message"),
        f"{dig(wrong, 'error.message')!r} vs {dig(nobody, 'error.message')!r}",
    )

    r.heading("PS-06 · Client-supplied forwarding headers are not trusted")
    spoof = Client(base)
    status, _, _ = raw("POST", f"{base}/auth/login",
                       headers={"Content-Type": "application/json", "Origin": "http://localhost:3001",
                                "X-Forwarded-For": "203.0.113.9"},
                       body=json.dumps({"email": email, "password": password}).encode())
    code, detail = admin.get(f"/admin-users/{super_id}")
    ips = {s.get("ip") for s in dig(detail, "sessions", [])}
    r.assert_true("a forged X-Forwarded-For does not become the recorded address", "203.0.113.9" not in ips, str(ips))

    # ── A01 · Access control ───────────────────────────────────
    r.heading("PS-02 / PS-03 / PS-16 · Privilege boundaries")
    code, body = admin.post("/roles", {
        "name": f"Probe Limited {run}",
        "permissionKeys": ["admin:read", "admin:write", "role:read", "enquiry:read", "programme:read"],
    })
    role_id = dig(body, "item.id")
    r.expect("create a role holding admin:write but not the Super Admin set", 201, code, body)
    cleanup.append(f"/roles/{role_id}")
    limited_email = f"probe.limited.{run}@example.com"
    code, body = admin.post("/admin-users", {"email": limited_email, "name": "Probe Limited", "password": "ProbePassphrase99", "roleId": role_id})
    limited_id = dig(body, "item.id")
    r.expect("create an administrator with that role", 201, code, body)
    cleanup.insert(0, f"/admin-users/{limited_id}")

    limited = Client(base)
    code, _ = limited.post("/auth/login", {"email": limited_email, "password": "ProbePassphrase99"})
    r.expect("sign in as the limited administrator", 200, code)

    code, body = limited.post(f"/admin-users/{super_id}/revoke-sessions")
    r.assert_true("PS-16: a sensitive action without recent authentication is refused", code == 403 and dig(body, "error.code") == "REAUTH_REQUIRED", f"{code} {dig(body, 'error.code')}")
    code, _ = limited.post("/auth/reauth", {"password": "ProbePassphrase99"})
    r.expect("PS-16: re-authenticate", 200, code)

    code, body = limited.post(f"/admin-users/{super_id}/revoke-sessions")
    r.assert_true("PS-02: ending a Super Admin's sessions is refused", code == 403, f"got {code}")
    code, body = limited.post(f"/admin-users/{super_id}/reset-password", {"password": "Hijacked-Passphrase-123"})
    r.assert_true("PS-02: resetting a Super Admin's password is refused", code == 403, f"got {code}")
    code, body = limited.patch(f"/admin-users/{super_id}", {"isActive": False})
    r.assert_true("PS-02: disabling a Super Admin is refused", code in (400, 403), f"got {code}")
    code, _ = Client(base).post("/auth/login", {"email": email, "password": password})
    r.assert_true("the Super Admin account is intact", code == 200, f"got {code}")

    code, _ = limited.get("/enquiries")
    r.expect("PS-03: limited admin reads enquiries before the change", 200, code)
    code, body = admin.put(f"/roles/{role_id}/permissions", {"permissionKeys": ["admin:read", "admin:write", "role:read", "programme:read"]})
    r.expect("PS-03: remove enquiry:read from the role", 200, code, body)
    code, _ = limited.get("/enquiries")
    r.assert_true("PS-03: the existing session loses the permission on its next request", code == 403, f"got {code}")

    for path in ["/applications", "/admin-users", "/audit", "/settings", "/media", "/enquiries"]:
        code, _ = anon.get(path)
        r.assert_true(f"unauthenticated {path} is refused", code == 401, f"got {code}")
    code, _ = anon.get("/public/programmes?status=DRAFT")
    r.assert_true("public API ignores a status filter", code == 200)

    # ── A05 · Injection ────────────────────────────────────────
    r.heading("Injection resistance")
    code, body = admin.get("/enquiries?search=" + urllib.parse.quote("' OR 1=1 --"))
    r.assert_true("SQL-looking search is handled as text", code == 200, f"got {code}")
    code, body = anon.post("/public/enquiries", {"name": "Probe", "email": f"x.{run}@example.com",
                                                 "message": "<img src=x onerror=alert(1)> hello there"})
    r.assert_true("inline event handler in a message is refused", code == 400, f"got {code}")
    code, body = anon.post("/public/enquiries", {"name": "Probe", "email": f"y.{run}@example.com",
                                                 "message": "hello there friend", "__proto__": {"admin": True}})
    r.assert_true("unknown/prototype keys are refused", code == 400, f"got {code}")
    status, _, _ = raw("GET", f"{host}/media/..%2f..%2f.env")
    r.assert_true("path traversal on /media is refused", status in (400, 403, 404), f"got {status}")
    code, body = anon.post("/public/applications", form={**form(run, "nl"), "fullName": "Probe\r\nBcc: x"})
    r.assert_true("PS-13: a line break in a name is refused", code == 400, f"got {code}")

    # ── A02 · Configuration ────────────────────────────────────
    r.heading("PS-08 · CORS and CSRF")
    status, headers, body = raw("GET", f"{base}/public/site", headers={"Origin": "https://evil.example"})
    r.assert_true("a disallowed Origin is refused with 403, not a 500", status == 403, f"got {status}")
    r.assert_true("no Access-Control-Allow-Origin for it", "access-control-allow-origin" not in headers)
    r.assert_true("no debug detail leaks", "debug" not in json.dumps(body))
    access = cookie_value(admin, "ps_access")
    status, _, body = raw("POST", f"{base}/auth/reauth",
                          headers={"Cookie": f"ps_access={access}", "Content-Type": "application/json", "Origin": "https://evil.example"},
                          body=json.dumps({"password": password}).encode())
    r.assert_true("a cookie-authenticated write from a foreign origin is refused", status == 403, f"got {status}")
    status, _, body = raw("POST", f"{base}/auth/reauth",
                          headers={"Cookie": f"ps_access={access}", "Content-Type": "application/json"},
                          body=json.dumps({"password": password}).encode())
    r.assert_true("a cookie-authenticated write with no Origin at all is refused", status == 403, f"got {status}")

    r.heading("PS-12 · Security headers")
    for name, url in [("API", f"{base}/public/site"), ("website", args.web + "/"), ("admin portal", args.admin + "/")]:
        status, headers, _ = raw("GET", url)
        for h in ["content-security-policy", "x-content-type-options", "referrer-policy"]:
            r.assert_true(f"{name} sends {h}", h in headers, f"status {status}")
        r.assert_true(f"{name} forbids framing", "frame-ancestors 'none'" in headers.get("content-security-policy", "") or headers.get("x-frame-options", "").upper() in ("DENY", "SAMEORIGIN"))
        r.assert_true(f"{name} hides its server software", "x-powered-by" not in headers)

    r.heading("PS-09 · Upload errors are client errors, not crashes")
    code, body = anon.post("/public/applications", form=form(run, "field"), files={"wrongfield": ("a.pdf", PDF, "application/pdf")})
    r.assert_true("unexpected file field → 400", code == 400, f"got {code}")
    code, body = anon.post("/public/applications", form=form(run, "big"), files={"resume": ("resume.pdf", PDF + b" " * (6 * 1024 * 1024), "application/pdf")})
    r.assert_true("6 MB resume → 413", code == 413, f"got {code}")

    # ── A08 / uploads ──────────────────────────────────────────
    r.heading("PS-10 · Resume policy: one PDF, 5 MB, nothing else")
    rejects = [
        ("not a PDF", "resume.pdf", b"plain text pretending " * 50, "application/pdf"),
        ("truncated PDF", "resume.pdf", b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n", "application/pdf"),
        ("double extension", "resume.pdf.exe", PDF, "application/pdf"),
        ("Word document", "resume.docx", b"PK\x03\x04" + b"\x00" * 60, DOCX_MIME),
        ("zip archive", "resume.zip", b"PK\x03\x04" + b"\x00" * 60, "application/zip"),
        ("HTML", "resume.pdf", b"<html><body>hi</body></html>" + b" " * 100, "application/pdf"),
        ("SVG", "resume.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>" + b" " * 100, "image/svg+xml"),
        ("declared type mismatch", "resume.pdf", PDF, "image/png"),
        ("null byte in the file name", "resume.pdf\x00.exe", PDF, "application/pdf"),
    ]
    for label, name, content, mime in rejects:
        code, body = anon.post("/public/applications", form=form(run, label[:4].strip().replace(" ", "")), files={"resume": (name, content, mime)})
        r.assert_true(f"{label} is refused", code == 400, f"got {code} {dig(body, 'error.message', '')[:60]}")
    # A path in the file name is stripped by the multipart parser before
    # the API sees it; what matters is that nothing of it reaches disk or
    # the record: the stored key is random and the name is metadata.
    code, body = anon.post("/public/applications", form=form(run, "path"), files={"resume": ("../../etc/passwd.pdf", PDF, "application/pdf")})
    if code == 201:
        cleanup.append(f"/applications/{dig(body, 'id')}")
        code2, detail = admin.get(f"/applications/{dig(body, 'id')}")
        stored = str(dig(detail, "item.resume.originalName", ""))
        r.assert_true("a path in the file name is reduced to its base name", "/" not in stored and ".." not in stored, stored)
    else:
        r.assert_true("a path in the file name is refused", code == 400, f"got {code}")

    code, body = anon.post("/public/applications", form=form(run, "ok"), files={"resume": ("resume.pdf", PDF, "application/pdf")})
    r.expect("a plain PDF is accepted", 201, code, body)
    app_id = dig(body, "id")
    if app_id:
        cleanup.append(f"/applications/{app_id}")

    r.heading("PS-01 / PS-11 · Resumes are private, quarantined and scan-gated")
    key = storage_key_of_latest_resume()
    if key:
        status, _, _ = raw("GET", f"{host}/media/{urllib.parse.quote(key)}")
        r.assert_true("the stored resume is not reachable from /media", status == 404, f"got {status} for {key}")
        r.assert_true("the storage key is random, not derived from the upload", "probe" not in key.lower() and len(key.split(".")[0]) == 32, key)
        r.assert_true("the file lives outside the public upload directory",
                      not (REPO_ROOT / "apps/api/uploads" / key).exists() and (REPO_ROOT / "apps/api/private-uploads" / key).exists())
    else:
        r.skip("stored resume location", "could not read the storage key from the database")
    if app_id:
        code, detail = admin.get(f"/applications/{app_id}")
        scan = dig(detail, "item.resume.scanStatus")
        code, raw_body = admin.get(f"/applications/{app_id}/resume", raw=True)
        if scanner_ok:
            r.assert_true("scanned clean by the daemon", scan == "CLEAN", str(scan))
            r.assert_true("a clean resume downloads for an elevated reviewer", code == 200 and isinstance(raw_body, bytes) and raw_body.startswith(b"%PDF"), f"got {code}")
        else:
            r.assert_true("with no scanner the file stays quarantined", scan in ("SCAN_FAILED", "QUARANTINED"), str(scan))
            r.assert_true("an unscanned resume cannot be downloaded (fail closed)", code == 409, f"got {code}")
        code, _ = Client(base).get(f"/applications/{app_id}/resume", raw=True)
        r.assert_true("download needs a session", code == 401, f"got {code}")
        fresh = Client(base)
        fresh.post("/auth/login", {"email": email, "password": password})
        code, body = fresh.get(f"/applications/{app_id}/resume", raw=True)
        r.assert_true("download needs recent re-authentication", code == 403, f"got {code}")

    # ── A07 · MFA ──────────────────────────────────────────────
    r.heading("PS-15 · Two-factor authentication")
    mfa_email = f"probe.mfa.{run}@example.com"
    code, body = admin.post("/admin-users", {"email": mfa_email, "name": "Probe MFA", "password": "ProbePassphrase99", "roleId": role_id})
    mfa_id = dig(body, "item.id")
    cleanup.insert(0, f"/admin-users/{mfa_id}")
    u = Client(base)
    u.post("/auth/login", {"email": mfa_email, "password": "ProbePassphrase99"})
    code, body = u.post("/auth/mfa/setup")
    r.expect("begin enrolment", 200, code, body)
    secret = dig(body, "secret", "")
    r.assert_true("otpauth URI issued", str(dig(body, "otpauth", "")).startswith("otpauth://totp/"))
    code, body = u.post("/auth/mfa/confirm", {"code": "000000"})
    r.assert_true("a wrong code does not enable MFA", code == 400, f"got {code}")
    code, body = u.post("/auth/mfa/confirm", {"code": totp(secret)})
    r.expect("a correct code enables MFA", 200, code, body)
    recovery = dig(body, "recoveryCodes", [])
    r.assert_true("eight single-use recovery codes issued", len(recovery) == 8)

    code, body = Client(base).post("/auth/login", {"email": mfa_email, "password": "ProbePassphrase99"})
    r.assert_true("sign-in now stops for a second factor", code == 200 and dig(body, "mfaRequired") is True and "user" not in body, f"{code} {list(body) if isinstance(body, dict) else body}")
    challenge = dig(body, "challenge")
    status, headers, _ = raw("POST", f"{base}/auth/login", headers={"Content-Type": "application/json", "Origin": "http://localhost:3001"},
                             body=json.dumps({"email": mfa_email, "password": "ProbePassphrase99"}).encode())
    r.assert_true("no session cookie is set before the second factor", "ps_access" not in headers.get("set-cookie", ""))
    code, body = Client(base).post("/auth/mfa/verify", {"challenge": challenge, "code": "123456"})
    r.assert_true("a wrong code is refused", code == 401, f"got {code}")
    two = Client(base)
    code, body = two.post("/auth/mfa/verify", {"challenge": challenge, "code": totp(secret)})
    r.expect("the right code completes sign-in", 200, code, body)
    code, _ = two.get("/auth/me")
    r.expect("the session works", 200, code)
    code, body = Client(base).post("/auth/login", {"email": mfa_email, "password": "ProbePassphrase99"})
    code, body = Client(base).post("/auth/mfa/verify", {"challenge": dig(body, "challenge"), "code": recovery[0]})
    r.expect("a recovery code signs in", 200, code, body)
    code, body = Client(base).post("/auth/login", {"email": mfa_email, "password": "ProbePassphrase99"})
    code, body = Client(base).post("/auth/mfa/verify", {"challenge": dig(body, "challenge"), "code": recovery[0]})
    r.assert_true("the same recovery code does not work twice", code == 401, f"got {code}")
    code, body = two.post("/auth/reauth", {"password": "ProbePassphrase99"})
    r.assert_true("re-authentication also demands the second factor", code == 401, f"got {code}")
    code, body = two.post("/auth/reauth", {"password": "ProbePassphrase99", "code": totp(secret)})
    r.expect("re-authentication with the code", 200, code, body)
    code, body = two.post("/auth/mfa/disable", {"password": "ProbePassphrase99", "code": totp(secret)})
    r.expect("the account can turn MFA off again (not a required role)", 200, code, body)

    # ── A03 · Supply chain ─────────────────────────────────────
    r.heading("PS-17 · Dependencies")
    try:
        audit = json.loads(subprocess.run(["npm", "audit", "--json"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=120).stdout or "{}")
        v = audit.get("metadata", {}).get("vulnerabilities", {})
        r.assert_true("no high or critical advisories", v.get("high", 0) == 0 and v.get("critical", 0) == 0, str(v))
        r.assert_true("no moderate advisories", v.get("moderate", 0) == 0, str(v))
    except Exception as err:  # noqa: BLE001
        r.skip("npm audit", str(err))

    # ── Brute force (opt-in) ───────────────────────────────────
    if args.with_bruteforce:
        r.heading("Per-address sign-in throttle")
        hit = None
        for i in range(40):
            code, _ = Client(base).post("/auth/login", {"email": f"spray-{i}-{run}@example.com", "password": "x"})
            if code == 429:
                hit = i + 1
                break
        r.assert_true("spraying many accounts from one address is throttled", hit is not None, f"throttled after {hit} attempts")
    else:
        r.skip("per-address sign-in throttle", "pass --with-bruteforce (locks this address out for the window)")

    # ── Cleanup ────────────────────────────────────────────────
    r.heading("Clean up")
    removed = 0
    for path in cleanup:
        code, _ = admin.delete(path)
        removed += code in (204, 200)
    r.assert_true("probe records removed", removed == len(cleanup), f"{removed}/{len(cleanup)}")

    print("\n" + "─" * 60)
    if r.failed:
        print(f"\033[31m\033[1m{len(r.failed)} of {r.passed + len(r.failed)} checks failed\033[0m\n")
        for f in r.failed:
            print(f"  \033[31m•\033[0m {f}")
        return 1
    print(f"\033[32m\033[1mall {r.passed} security checks passed\033[0m" + (f"  \033[2m({len(r.skipped)} skipped)\033[0m" if r.skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

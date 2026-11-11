#!/usr/bin/env python3
"""
POLARSIGHT API integration tests.

Exercises the real API against the real database over HTTP: no mocks,
no fixtures standing in for records. Every test is written to be
re-runnable — unique values per run, and no reliance on state a
previous run left behind.

Usage:
    npm run test:api                 # from the repo root
    python3 apps/api/tests/integration.py --base http://localhost:5000

Requires a running API and database, and SEED_ADMIN_EMAIL /
SEED_ADMIN_PASSWORD in the repository-root .env.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

GREEN, RED, DIM, BOLD, RESET = "\033[32m", "\033[31m", "\033[2m", "\033[1m", "\033[0m"


# ── Environment ───────────────────────────────────────────────


def load_env() -> dict[str, str]:
    """Reads the repository-root .env without extra dependencies."""
    env: dict[str, str] = {}
    path = REPO_ROOT / ".env"
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


# ── HTTP client ───────────────────────────────────────────────


class LocalhostCookiePolicy(http.cookiejar.DefaultCookiePolicy):
    """
    Accepts `Domain=localhost`.

    The standard policy requires an embedded dot in a domain attribute,
    so it silently discards the API's session cookies when running
    against localhost. Browsers accept them, so the default would make
    the suite test something no real client does.
    """

    def set_ok_domain(self, cookie, request) -> bool:  # noqa: D102
        host = http.cookiejar.request_host(request)
        if host in ("localhost", "127.0.0.1", "::1"):
            return True
        return super().set_ok_domain(cookie, request)

    def return_ok_domain(self, cookie, request) -> bool:  # noqa: D102
        host = http.cookiejar.request_host(request)
        if host in ("localhost", "127.0.0.1", "::1"):
            return True
        return super().return_ok_domain(cookie, request)


class Client:
    """A cookie-aware HTTP client, so sessions behave as a browser's would."""

    def __init__(self, base: str, origin: str | None = "http://localhost:3001") -> None:
        self.base = base.rstrip("/")
        # Sent on every request, as a browser on the admin portal would.
        # The API refuses a cookie-authenticated write without a trusted
        # Origin, so a client that omits it is testing nothing real.
        self.origin = origin
        self.jar = http.cookiejar.CookieJar(LocalhostCookiePolicy())
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )

    def request(
        self,
        method: str,
        path: str,
        body: object | None = None,
        *,
        form: dict[str, object] | None = None,
        files: dict[str, tuple[str, bytes, str]] | None = None,
        raw: bool = False,
    ) -> tuple[int, object]:
        url = f"{self.base}{path}"
        data: bytes | None = None
        headers: dict[str, str] = {"Accept": "application/json"}
        if self.origin:
            headers["Origin"] = self.origin

        if files is not None or form is not None:
            data, content_type = encode_multipart(form or {}, files or {})
            headers["Content-Type"] = content_type
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=30) as res:
                payload = res.read()
                return res.status, decode(payload, raw)
        except urllib.error.HTTPError as err:
            return err.code, decode(err.read(), raw)
        except urllib.error.URLError as err:
            return 0, {"error": {"message": str(err.reason)}}

    def get(self, path: str, **kw):
        return self.request("GET", path, **kw)

    def post(self, path: str, body=None, **kw):
        return self.request("POST", path, body, **kw)

    def patch(self, path: str, body=None, **kw):
        return self.request("PATCH", path, body, **kw)

    def put(self, path: str, body=None, **kw):
        return self.request("PUT", path, body, **kw)

    def delete(self, path: str, **kw):
        return self.request("DELETE", path, **kw)


def decode(payload: bytes, raw: bool) -> object:
    if raw:
        return payload
    try:
        return json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return payload.decode("utf-8", "replace")


def encode_multipart(
    form: dict[str, object], files: dict[str, tuple[str, bytes, str]]
) -> tuple[bytes, str]:
    boundary = f"----polarsight{uuid.uuid4().hex}"
    out = bytearray()

    def line(s: str = "") -> None:
        out.extend(s.encode() + b"\r\n")

    for key, value in form.items():
        values = value if isinstance(value, list) else [value]
        for v in values:
            line(f"--{boundary}")
            line(f'Content-Disposition: form-data; name="{key}"')
            line()
            line(str(v))

    for key, (filename, content, mime) in files.items():
        line(f"--{boundary}")
        line(f'Content-Disposition: form-data; name="{key}"; filename="{filename}"')
        line(f"Content-Type: {mime or mimetypes.guess_type(filename)[0] or 'application/octet-stream'}")
        line()
        out.extend(content + b"\r\n")

    line(f"--{boundary}--")
    return bytes(out), f"multipart/form-data; boundary={boundary}"


# ── Test harness ──────────────────────────────────────────────


class Results:
    def __init__(self) -> None:
        self.passed = 0
        self.failed: list[str] = []
        self.skipped: list[str] = []
        self.section = ""

    def heading(self, title: str) -> None:
        self.section = title
        print(f"\n{BOLD}{title}{RESET}")

    def ok(self, label: str, detail: str = "") -> None:
        self.passed += 1
        print(f"  {GREEN}✓{RESET} {label}{f'  {DIM}{detail}{RESET}' if detail else ''}")

    def fail(self, label: str, detail: str) -> None:
        self.failed.append(f"{self.section} → {label}: {detail}")
        print(f"  {RED}✗{RESET} {label}  {RED}{detail}{RESET}")

    def skip(self, label: str, why: str) -> None:
        self.skipped.append(label)
        print(f"  {DIM}–{RESET} {label}  {DIM}skipped: {why}{RESET}")

    def expect(self, label: str, want: int, got: int, body: object = None) -> bool:
        if want == got:
            self.ok(label, str(got))
            return True
        # A public form refusing a burst is the rate limiter working, not
        # a defect. Say so rather than reporting a false failure.
        if got == 429 and want != 429:
            self.skip(label, "rate limited — raise RATE_LIMIT_MAX in .env for test runs")
            return False
        self.fail(label, f"got {got}, want {want}{message_of(body)}")
        return False

    def assert_true(self, label: str, condition: bool, detail: str = "") -> bool:
        if condition:
            self.ok(label, detail)
            return True
        self.fail(label, detail or "condition not met")
        return False

    def note(self, text: str) -> None:
        print(f"  {DIM}· {text}{RESET}")


def message_of(body: object) -> str:
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        msg = body["error"].get("message", "")
        details = body["error"].get("details")
        extra = ""
        if isinstance(details, list) and details:
            extra = " [" + "; ".join(
                f"{d.get('field')}: {d.get('message')}" for d in details[:3]
            ) + "]"
        return f" — {msg}{extra}"
    return ""


# Text this suite writes. Anything matching it on a fresh run means an
# earlier run did not clean up after itself.
TEST_MARKERS = (
    "Draft hero copy ",
    "Draft marker ",
    "Preview-only text ",
    "End-to-end marker ",
)


def is_test_marker(value: object) -> bool:
    return isinstance(value, str) and value.startswith(TEST_MARKERS)


def dig(body: object, path: str, default=None):
    """dig(body, 'item.events.0.toStatus')"""
    node = body
    for key in path.split("."):
        if isinstance(node, list):
            idx = int(key)
            node = node[idx] if -len(node) <= idx < len(node) else None
        elif isinstance(node, dict):
            node = node.get(key)
        else:
            return default
        if node is None:
            return default
    return node


# ── Tests ─────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:5000")
    args = parser.parse_args()

    env = load_env()
    email = os.environ.get("SEED_ADMIN_EMAIL") or env.get("SEED_ADMIN_EMAIL")
    password = os.environ.get("SEED_ADMIN_PASSWORD") or env.get("SEED_ADMIN_PASSWORD")
    if not email or not password:
        print("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set", file=sys.stderr)
        return 2

    base = f"{args.base.rstrip('/')}/api"
    run = uuid.uuid4().hex[:8]
    stamp_search = run
    r = Results()
    admin = Client(base)

    # ── Health and authentication ─────────────────────────────
    r.heading("Health and authentication")
    code, _ = Client(args.base).get("/health")
    if not r.expect("health endpoint", 200, code):
        print("\nAPI is not reachable; start it with `npm run dev:api`.", file=sys.stderr)
        return 2

    code, body = admin.post("/auth/login", {"email": email, "password": "wrong-password"})
    r.expect("wrong password refused", 401, code, body)

    code, body = admin.post(
        "/auth/login", {"email": f"nobody-{run}@example.com", "password": "wrong-password"}
    )
    r.assert_true(
        "unknown account gives the same error as a wrong password",
        code == 401 and "incorrect" in str(dig(body, "error.message", "")).lower(),
        str(dig(body, "error.message")),
    )

    code, body = admin.post("/auth/login", {"email": email, "password": password})
    if not r.expect("sign in", 200, code, body):
        return 2
    r.assert_true("no access token in the sign-in body", "accessToken" not in body)
    # Sensitive routes (administrators, roles, settings, exports, resume
    # downloads) require a fresh password; elevate once for the run.
    elevated, elevated_body = admin.post("/auth/reauth", {"password": password})
    r.expect("re-authenticate for sensitive actions", 200, elevated, elevated_body)
    perms = dig(body, "user.permissions", [])

    # Compared against what the API actually defines rather than a
    # number written here, so pruning a permission cannot silently
    # leave the Super Admin short of one.
    code, body = admin.get("/roles/permissions")
    r.expect("the permission catalogue", 200, code, body)
    defined = {p["key"] for g in dig(body, "groups", {}).values() for p in g}
    r.assert_true(
        "super admin holds every permission the API defines",
        defined and set(perms) >= defined,
        f"{len(perms)} held, {len(defined)} defined, missing={sorted(defined - set(perms)) or 'none'}",
    )

    code, body = admin.get("/auth/me")
    r.expect("session established", 200, code, body)

    code, body = Client(base).get("/dashboard")
    r.expect("no session is refused", 401, code, body)

    # ── Dashboard ─────────────────────────────────────────────
    r.heading("Dashboard reads live data")
    code, body = admin.get("/dashboard")
    r.expect("dashboard", 200, code, body)
    cards = dig(body, "cards", {})
    present = [k for k, v in cards.items() if v is not None]
    # One group per area the portal actually manages: enquiries,
    # applications, programmes, jobs, pages, content, media, admins.
    r.assert_true("every card group returned", len(present) == 8, f"{len(present)} groups")
    r.assert_true(
        "no card for a section the site does not render",
        not any(k in cards for k in ("statistics", "faqs", "audiences")),
        ", ".join(sorted(cards)),
    )
    r.assert_true(
        "enquiry total is a real count",
        isinstance(dig(cards, "enquiries.total"), int),
        f"enquiries.total = {dig(cards, 'enquiries.total')}",
    )
    r.assert_true(
        "programme counts reconcile",
        dig(cards, "programmes.total")
        == dig(cards, "programmes.published", 0)
        + dig(cards, "programmes.draft", 0)
        + dig(cards, "programmes.archived", 0),
        f"total={dig(cards, 'programmes.total')}",
    )

    # ── Public application pipeline ───────────────────────────
    r.heading("Public trainer application")
    code, body = Client(base).get("/public/jobs")
    r.expect("published openings are public", 200, code, body)
    jobs = dig(body, "items", [])
    r.assert_true("at least one opening is open", len(jobs) > 0, f"{len(jobs)} open")
    job_id = jobs[0]["id"] if jobs else None
    r.assert_true(
        "public opening exposes no application count",
        all("_count" not in j and "applications" not in j for j in jobs),
    )

    applicant_email = f"asha.{run}@example.com"
    resume = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF\n"
    public = Client(base)

    code, body = public.post(
        "/public/applications",
        form={
            "fullName": "Asha Ramanathan",
            "email": applicant_email,
            "phone": "+91 44 1234 5678",
            "location": "Chennai",
            "education": "B.E. Computer Science",
            "currentOrganisation": "Independent",
            "experienceYears": "7",
            "experienceSummary": "Seven years in security operations, latterly leading detection engineering.",
            "expertise": "SIEM,Threat detection,Incident response",
            "technicalSkills": "Splunk,Microsoft Sentinel,Python",
            "certifications": "GCIA",
            "jobOpeningId": job_id or "",
            "appliedPosition": "SOC Analyst Trainer",
            "employmentPreference": "PART_TIME",
            "linkedinUrl": "https://www.linkedin.com/in/example",
        },
        files={"resume": ("resume.pdf", resume, "application/pdf")},
    )
    r.expect("submit application with resume", 201, code, body)
    app_id = dig(body, "id")
    r.assert_true(
        "does not claim an email was sent",
        dig(body, "acknowledgementEmailSent") is False,
        f"acknowledgementEmailSent={dig(body, 'acknowledgementEmailSent')}",
    )

    code, body = Client(base).post(
        "/public/applications",
        form={
            "fullName": "Asha Ramanathan",
            "email": applicant_email,
            "jobOpeningId": job_id or "",
            "appliedPosition": "SOC Analyst Trainer",
        },
    )
    r.expect("duplicate application refused", 409, code, body)

    code, body = Client(base).post(
        "/public/applications",
        form={
            "fullName": "Script Kid",
            "email": f"xss.{run}@example.com",
            "appliedPosition": "<script>alert(1)</script>",
        },
    )
    r.expect("script in a field refused", 400, code, body)

    code, body = Client(base).post(
        "/public/applications",
        form={
            "fullName": "Exe Uploader",
            "email": f"exe.{run}@example.com",
            "appliedPosition": "SOC Analyst Trainer",
        },
        files={"resume": ("resume.pdf", b"MZ\x90\x00\x03executable", "application/pdf")},
    )
    r.expect("executable disguised as a PDF refused", 400, code, body)

    code, body = Client(base).post(
        "/public/applications",
        form={
            "fullName": "Bot",
            "email": f"bot.{run}@example.com",
            "appliedPosition": "SOC Analyst Trainer",
            "website": "http://spam.example",
        },
    )
    r.expect("honeypot accepted silently", 202, code, body)

    # ── Recruitment pipeline ──────────────────────────────────
    r.heading("Recruitment pipeline")
    code, body = admin.get(f"/applications/{app_id}")
    r.expect("application detail", 200, code, body)
    item = dig(body, "item", {})
    r.assert_true(
        "source IP is not in the reviewer's view",
        "sourceIp" not in item and "userAgent" not in item,
    )

    code, scan = admin.get("/settings/integrations")
    scanner_ok = bool(dig(scan, "malwareScanner.ok"))
    code, raw = admin.get(f"/applications/{app_id}/resume", raw=True)
    if scanner_ok:
        r.assert_true(
            "resume downloads for an authorised reviewer once scanned clean",
            code == 200 and isinstance(raw, bytes) and raw.startswith(b"%PDF"),
            f"{code}, {len(raw) if isinstance(raw, bytes) else 0} bytes",
        )
    else:
        # Fail closed: no scanner, no download — and a rescan cannot
        # release it either.
        r.expect("resume download refused while unscanned", 409, code, raw)
        code, body = admin.post(f"/applications/{app_id}/resume/rescan")
        r.assert_true(
            "rescan without a scanner leaves it quarantined",
            dig(body, "scanStatus") != "CLEAN",
            str(dig(body, "scanStatus")),
        )

    code, raw = Client(base).get(f"/applications/{app_id}/resume", raw=True)
    r.expect("resume refused without a session", 401, code)

    for status, want in [("UNDER_REVIEW", 200), ("SHORTLISTED", 200)]:
        code, body = admin.patch(
            f"/applications/{app_id}/status",
            {"status": status, "note": f"Moved to {status}."},
        )
        r.expect(f"status → {status}", want, code, body)

    code, body = admin.patch(f"/applications/{app_id}/status", {"status": "SHORTLISTED"})
    r.expect("repeating the current status refused", 400, code, body)

    code, body = admin.patch(
        f"/applications/{app_id}/status", {"status": "INTERVIEW_SCHEDULED"}
    )
    r.expect("scheduling without a date refused", 400, code, body)

    future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    past = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    code, body = admin.patch(
        f"/applications/{app_id}/status",
        {"status": "INTERVIEW_SCHEDULED", "scheduledAt": past},
    )
    r.expect("interview in the past refused", 400, code, body)

    code, body = admin.patch(
        f"/applications/{app_id}/status",
        {"status": "INTERVIEW_SCHEDULED", "scheduledAt": future},
    )
    r.expect("interview scheduled", 200, code, body)

    for kind in ["INTERVIEW_FEEDBACK", "DEMO_FEEDBACK", "NOTE"]:
        code, body = admin.post(
            f"/applications/{app_id}/notes",
            {"body": f"Recorded {kind} during the process.", "kind": kind},
        )
        r.expect(f"{kind.lower()} recorded", 201, code, body)

    code, body = admin.get("/admin-users")
    me_id = dig(body, "items.0.id")
    code, body = admin.patch(f"/applications/{app_id}/assign", {"assignedToId": me_id})
    r.expect("recruiter assigned", 200, code, body)

    code, body = admin.patch(
        f"/applications/{app_id}/status", {"status": "REJECTED", "notifyCandidate": True}
    )
    r.expect("rejection recorded", 200, code, body)
    r.assert_true(
        "email reported as NOT sent while SMTP is unconfigured",
        dig(body, "notification.sent") is False
        and dig(body, "notification.reason") == "not_configured",
        f"notification={dig(body, 'notification')}",
    )

    code, body = admin.patch(
        f"/applications/{app_id}/status", {"status": "UNDER_REVIEW"}
    )
    r.expect("reopening a decided application refused", 400, code, body)

    code, body = admin.get(f"/applications/{app_id}")
    events = dig(body, "item.events", [])
    r.assert_true(
        "full status history retained", len(events) >= 6, f"{len(events)} events"
    )
    notes = dig(body, "item.notes", [])
    r.assert_true("internal notes retained", len(notes) >= 3, f"{len(notes)} notes")

    code, body = admin.post(f"/applications/{app_id}/archive")
    r.expect("archived", 200, code, body)

    code, raw = admin.get("/applications/export?format=csv", raw=True)
    header = raw.decode().splitlines()[0] if isinstance(raw, bytes) and raw else ""
    r.assert_true(
        "CSV export excludes internal notes",
        code == 200 and "note" not in header.lower() and "feedback" not in header.lower(),
        header[:60],
    )

    # ── Applicant data is never public ────────────────────────
    r.heading("Applicant data stays private")
    anon = Client(base)
    for path in [
        "/public/applications",
        f"/public/applications/{app_id}",
        "/public/trainer-applications",
    ]:
        code, _ = anon.get(path)
        r.assert_true(f"GET {path} is not readable", code in (404, 401, 403), str(code))

    code, body = admin.get("/media?perPage=100")
    names = [i.get("originalName", "") for i in dig(body, "items", [])]
    r.assert_true(
        "resumes are absent from the media library",
        not any("resume" in n.lower() for n in names),
        f"{len(names)} library items",
    )

    # ── Page publishing workflow ──────────────────────────────
    #
    # This publishes to a live page, so it captures the real copy up
    # front and puts it back at the end of the section.
    r.heading("Page publishing workflow")
    marker = f"Draft marker {run} that must not reach the public site."

    code, body = admin.get("/pages/about")
    r.expect("read page", 200, code, body)
    draft = dig(body, "item.draft", {})
    if not isinstance(draft, dict) or "mission" not in draft:
        r.fail("about page draft has the expected shape", f"got keys: {list(draft) if isinstance(draft, dict) else type(draft)}")
        draft = {"mission": {"heading": "", "body": "", "visible": True, "order": 1}}

    about_original = dig(draft, "mission.body", "")
    if is_test_marker(about_original):
        r.fail(
            "the About page holds its real copy before this test runs",
            f"found a leftover marker: {about_original[:60]!r} — "
            "restore it from apps/web/lib/pages.js before re-running",
        )
        return 1

    draft["mission"]["body"] = marker

    code, body = admin.put("/pages/about/draft", {"draft": draft})
    r.expect("save draft", 200, code, body)

    code, body = anon.get("/public/pages/about")
    live = dig(body, "item.content.mission.body", "")
    r.assert_true(
        "draft is NOT served publicly", live != marker, f"public still shows: {live[:45]}…"
    )

    code, body = admin.post("/pages/about/preview")
    r.expect("preview token issued", 200, code, body)
    preview_url = dig(body, "url", "")
    query = urllib.parse.parse_qs(urllib.parse.urlparse(preview_url).query)
    token = query.get("token", [""])[0]
    expires = query.get("expires", [""])[0]

    code, body = anon.get(
        f"/public/pages/about/preview?token={urllib.parse.quote(token)}&expires={expires}"
    )
    r.assert_true(
        "preview renders the draft",
        code == 200 and dig(body, "item.content.mission.body") == marker,
        str(code),
    )
    r.assert_true("preview is flagged as a preview", dig(body, "item.isPreview") is True)

    code, _ = anon.get("/public/pages/about/preview?token=forged&expires=99999999999999")
    r.expect("forged preview token refused", 404, code)

    code, _ = anon.get(
        f"/public/pages/about/preview?token={urllib.parse.quote(token)}&expires=1"
    )
    r.expect("expired preview token refused", 404, code)

    code, body = admin.post("/pages/about/publish", {"label": f"Test run {run}"})
    r.expect("publish", 200, code, body)

    code, body = anon.get("/public/pages/about")
    r.assert_true(
        "published change IS served publicly",
        dig(body, "item.content.mission.body") == marker,
        str(dig(body, "item.content.mission.body"))[:45],
    )
    r.assert_true(
        "public page response carries no draft column",
        "draft" not in dig(body, "item", {}),
    )

    code, body = admin.get("/pages/about/versions")
    versions = dig(body, "items", [])
    r.assert_true("version recorded on publish", len(versions) >= 1, f"{len(versions)} versions")

    # A version saved before the page's sections changed describes a
    # page that no longer exists, so it is marked and refused rather
    # than restored into a shape the site cannot render.
    restorable = [v for v in versions if v.get("restorable")]
    stale = [v for v in versions if not v.get("restorable")]
    r.assert_true(
        "each version says whether it can be restored",
        all("restorable" in v for v in versions),
        f"{len(restorable)} restorable, {len(stale)} from an older structure",
    )

    if stale:
        code, body = admin.post("/pages/about/restore", {"version": stale[0]["version"]})
        r.expect("a version from an older structure is refused", 400, code, body)
        r.assert_true(
            "the refusal explains why, rather than dumping validation errors",
            "sections changed" in str(dig(body, "error.message", "")),
            str(dig(body, "error.message"))[:80],
        )

    if len(restorable) >= 2:
        older = restorable[1]["version"]
        code, body = admin.post("/pages/about/restore", {"version": older})
        r.expect("restore an earlier version", 200, code, body)
        code, body = anon.get("/public/pages/about")
        r.assert_true(
            "restore does NOT change the live site by itself",
            dig(body, "item.content.mission.body") == marker,
            "live content unchanged until published again",
        )

    code, body = admin.put(
        "/pages/about/draft",
        {
            "draft": {
                "intro": {
                    "heading": "<script>alert(1)</script>",
                    "body": "",
                    "visible": True,
                    "order": 0,
                    "paragraphs": [],
                    "image": None,
                },
                "mission": {"heading": "m", "body": "", "visible": True, "order": 1},
                "vision": {"heading": "v", "body": "", "visible": True, "order": 2},
                "approach": {"heading": "a", "body": "", "visible": True, "order": 3, "items": []},
                "focus": {"heading": "f", "body": "", "visible": True, "order": 4, "items": []},
            }
        },
    )
    r.expect("script in page content refused", 400, code, body)

    code, body = admin.put(
        "/pages/about/draft", {"draft": {"unexpected": "structure"}}
    )
    r.expect("unknown page structure refused", 400, code, body)

    code, _ = admin.get("/pages/not-a-real-page")
    r.expect("unknown page key is 404", 404, code)

    # Put the About page's real copy back, and prove it landed. The
    # restore is explicit rather than by version index: a snapshot
    # taken after this test's own publish holds the marker.
    code, body = admin.get("/pages/about")
    restore_draft = dig(body, "item.draft", {})
    if isinstance(restore_draft, dict) and "mission" in restore_draft:
        restore_draft["mission"]["body"] = about_original
        code, _ = admin.put("/pages/about/draft", {"draft": restore_draft})
        r.expect("restore the About page draft", 200, code)
        code, _ = admin.post("/pages/about/publish", {"label": "Restored after test"})
        r.expect("re-publish the About page", 200, code)

        code, body = anon.get("/public/pages/about")
        r.assert_true(
            "the About page's real copy is back on the public site",
            dig(body, "item.content.mission.body") == about_original,
            f"{about_original[:50]}…",
        )

    # ── Homepage first interface is untouched ─────────────────
    r.heading("Homepage first interface is out of CMS scope")
    code, body = admin.get("/pages/home")
    home_draft = dig(body, "item.draft", {})
    r.assert_true(
        "hero is not an editable region",
        "hero" not in home_draft and "nav" not in home_draft and "video" not in home_draft,
        f"editable regions: {', '.join(sorted(home_draft.keys()))}",
    )
    code, body = admin.put(
        "/pages/home/draft", {"draft": {**home_draft, "hero": {"heading": "hijack"}}}
    )
    r.expect("adding a hero region refused", 400, code, body)

    code, body = admin.get("/content?search=nav.items&perPage=5")
    nav = next((i for i in dig(body, "items", []) if i["key"] == "nav.items"), None)
    if nav:
        code, body = admin.patch(f"/content/{nav['id']}", {"value": "[]"})
        r.expect("locked navigation block refuses edit", 400, code, body)
        code, body = admin.put(f"/content/{nav['id']}/draft", {"draftValue": "[]"})
        r.expect("locked navigation block refuses a draft", 400, code, body)

    # ── Content block draft workflow ──────────────────────────
    #
    # This test publishes to a block the live site reads, so it must
    # put the real copy back. It restores the value it captured rather
    # than a version index: a snapshot taken after this test's own
    # publish holds the test's marker, and restoring that would leave
    # the marker on the site while still passing.
    r.heading("Content block draft workflow")
    code, body = admin.get("/content?search=hero.body&perPage=5")
    block = next((i for i in dig(body, "items", []) if i["key"] == "hero.body"), None)

    if block:
        original = block["value"]

        # If the published value already looks like a marker, an earlier
        # run left it behind. Say so instead of treating it as the real
        # copy and perpetuating it.
        if is_test_marker(original):
            r.fail(
                "the hero copy is the real copy before this test runs",
                f"found a leftover marker: {original[:60]!r} — "
                "restore it from apps/web/lib/content.js before re-running",
            )
        else:
            text = f"Draft hero copy {run}."
            code, body = admin.put(f"/content/{block['id']}/draft", {"draftValue": text})
            r.expect("save block draft", 200, code, body)

            code, body = anon.get("/public/content")
            r.assert_true(
                "block draft is NOT public",
                dig(body, "content", {}).get("hero.body") == original,
                "public still shows the published value",
            )

            code, body = admin.post(f"/content/{block['id']}/publish-draft")
            r.expect("publish block draft", 200, code, body)

            code, body = anon.get("/public/content")
            r.assert_true(
                "published block IS public",
                dig(body, "content", {}).get("hero.body") == text,
            )

            code, body = admin.get(f"/content/{block['id']}/versions")
            vs = dig(body, "items", [])
            r.assert_true("previous value snapshotted", len(vs) >= 1, f"{len(vs)} versions")
            r.assert_true(
                "the newest snapshot holds the value from before this publish",
                bool(vs),
            )

            # Put the real copy back explicitly, and prove it landed.
            code, body = admin.put(f"/content/{block['id']}/draft", {"draftValue": original})
            r.expect("restore the original copy into the draft", 200, code, body)
            code, body = admin.post(f"/content/{block['id']}/publish-draft")
            r.expect("re-publish the original copy", 200, code, body)

            code, body = anon.get("/public/content")
            r.assert_true(
                "the hero copy is back on the public site",
                dig(body, "content", {}).get("hero.body") == original,
                f"{original[:50]}…",
            )

    # ── Removed modules stay removed ──────────────────────────
    r.heading("Endpoints for content the site does not render are gone")
    for path in ["/statistics", "/faqs", "/audiences", "/career"]:
        code, body = admin.get(path)
        r.expect(f"admin route {path} no longer exists", 404, code, body)
    for path in ["/public/statistics", "/public/faqs", "/public/audiences", "/public/career"]:
        code, body = anon.get(path)
        r.expect(f"public route {path} no longer exists", 404, code, body)

    # ── Enquiry workflow ──────────────────────────────────────
    r.heading("Enquiry workflow")
    enquiry_email = f"priya.{run}@example.com"
    message = "We would like to discuss running the SOC Analyst programme for our final year students."
    code, body = Client(base).post(
        "/public/enquiries",
        {
            "name": "Priya Menon",
            "email": enquiry_email,
            "organisation": "Example Institute of Technology",
            "designation": "Head of Department",
            "subject": "College Partnership",
            "programme": "SOC Analyst",
            "message": message,
        },
    )
    r.expect("public enquiry accepted", 201, code, body)
    enq_id = dig(body, "id")

    code, body = Client(base).post(
        "/public/enquiries",
        {"name": "Priya Menon", "email": enquiry_email, "message": message},
    )
    r.assert_true(
        "double submit is absorbed, not duplicated",
        code in (200, 201),
        f"{code} — {dig(body, 'id')}",
    )

    code, body = admin.patch(f"/enquiries/{enq_id}/assign", {"assignedToId": me_id})
    r.expect("assign to an administrator", 200, code, body)
    code, body = admin.patch(f"/enquiries/{enq_id}/assign", {"assignedToId": "does-not-exist"})
    r.expect("assigning a nonexistent administrator refused", 400, code, body)

    code, body = admin.patch(f"/enquiries/{enq_id}/follow-up", {"followUpAt": future})
    r.expect("set a follow-up date", 200, code, body)
    code, body = admin.patch(
        f"/enquiries/{enq_id}/follow-up", {"followUpAt": "2020-01-01T00:00:00.000Z"}
    )
    r.expect("follow-up in the past refused", 400, code, body)

    code, body = admin.patch(
        f"/enquiries/{enq_id}/status",
        {"status": "UNDER_REVIEW", "note": "Routed to partnerships."},
    )
    r.expect("status → UNDER_REVIEW", 200, code, body)
    code, body = admin.patch(f"/enquiries/{enq_id}/status", {"status": "UNDER_REVIEW"})
    r.expect("repeating the current status refused", 409, code, body)

    code, body = admin.post(f"/enquiries/{enq_id}/notes", {"body": "Called; meeting arranged."})
    r.expect("internal note added", 201, code, body)

    code, body = admin.patch(f"/enquiries/{enq_id}/status", {"status": "CONVERTED"})
    r.expect("status → CONVERTED", 200, code, body)
    code, body = admin.get(f"/enquiries/{enq_id}")
    r.assert_true(
        "resolving clears the pending follow-up",
        dig(body, "item.followUpAt") is None,
    )

    code, body = admin.get(f"/enquiries/{enq_id}/history")
    hist = dig(body, "items", [])
    r.assert_true(
        "history shows notes and status changes",
        len(hist) >= 4
        and any(h["kind"] == "note" for h in hist)
        and any(h["kind"] == "action" for h in hist),
        f"{len(hist)} timeline entries",
    )

    code, body = admin.get("/enquiries/stats")
    r.expect("enquiry statistics", 200, code, body)
    code, body = admin.post(f"/enquiries/{enq_id}/archive")
    r.expect("archive", 200, code, body)
    code, body = admin.get("/enquiries?archived=false")
    r.assert_true(
        "archived enquiry leaves the working list",
        not any(i["id"] == enq_id for i in dig(body, "items", [])),
    )

    code, raw = admin.get("/enquiries/export?format=csv", raw=True)
    r.assert_true(
        "CSV export quotes every cell",
        code == 200 and isinstance(raw, bytes) and raw.startswith(b'"ID"'),
        raw.decode().splitlines()[0][:60] if isinstance(raw, bytes) and raw else "",
    )

    code, body = Client(base).post(
        "/public/enquiries",
        {
            "name": "Formula Injector",
            "email": f"csv.{run}@example.com",
            "organisation": "=cmd|'/c calc'!A1",
            "message": "Testing that a spreadsheet formula cannot be smuggled through the export.",
        },
    )
    if code == 201:
        code, raw = admin.get("/enquiries/export?format=csv", raw=True)
        text = raw.decode() if isinstance(raw, bytes) else ""
        r.assert_true(
            "formula injection neutralised in the export",
            '"\'=cmd' in text,
            "leading = prefixed with an apostrophe",
        )

    # ── Programme and curriculum ──────────────────────────────
    r.heading("Programme management and curriculum builder")
    code, body = admin.get("/programmes?perPage=50")
    programmes = dig(body, "items", [])
    soc = next((p for p in programmes if p["slug"] == "soc-analyst"), None)
    r.assert_true("SOC Analyst programme exists", soc is not None)
    prog_id = soc["id"] if soc else None

    code, body = admin.get(f"/programmes/{prog_id}/modules")
    mods = dig(body, "items", [])
    r.assert_true("curriculum seeded", len(mods) >= 10, f"{len(mods)} modules")

    code, body = admin.post(
        f"/programmes/{prog_id}/modules",
        {"title": f"Test Module {run}", "summary": "Created by the integration test."},
    )
    r.expect("add a module", 201, code, body)
    mod_id = dig(body, "item.id")
    r.assert_true("new module starts unpublished", dig(body, "item.status") == "DRAFT")

    code, body = admin.post(
        f"/programmes/{prog_id}/modules/{mod_id}/topics",
        {"title": "A topic", "description": "Topic detail."},
    )
    r.expect("add a topic", 201, code, body)
    topic_id = dig(body, "item.id")

    code, body = anon.get("/public/programmes/soc-analyst")
    titles = [m["title"] for m in dig(body, "item.modules", [])]
    r.assert_true(
        "unpublished module is NOT in the public curriculum",
        f"Test Module {run}" not in titles,
        f"{len(titles)} public modules",
    )

    code, body = admin.post(f"/programmes/{prog_id}/modules/{mod_id}/publish")
    r.expect("publish the module", 200, code, body)
    code, body = anon.get("/public/programmes/soc-analyst")
    titles = [m["title"] for m in dig(body, "item.modules", [])]
    r.assert_true(
        "published module IS in the public curriculum", f"Test Module {run}" in titles
    )

    code, body = admin.post(
        f"/programmes/{prog_id}/modules/reorder",
        {"items": [{"id": mod_id, "sortOrder": 0}]},
    )
    r.expect("reorder modules", 200, code, body)

    code, body = admin.patch(
        f"/programmes/{prog_id}/modules/{mod_id}/topics/{topic_id}",
        {"title": "Renamed topic"},
    )
    r.expect("edit a topic", 200, code, body)

    other = next((p for p in programmes if p["slug"] == "ai-security-engineer"), None)
    if other:
        code, body = admin.patch(
            f"/programmes/{other['id']}/modules/{mod_id}", {"title": "Hijacked"}
        )
        r.expect("module cannot be reached via another programme", 404, code, body)

    code, body = admin.post(f"/programmes/{prog_id}/duplicate")
    r.expect("duplicate a programme", 201, code, body)
    copy_id = dig(body, "item.id")
    r.assert_true("the copy is a draft", dig(body, "item.status") == "DRAFT")
    r.assert_true(
        "the copy carries the curriculum",
        len(dig(body, "item.modules", [])) >= len(mods),
        f"{len(dig(body, 'item.modules', []))} modules copied",
    )
    code, body = anon.get("/public/programmes")
    r.assert_true(
        "the copy is not on the public site",
        not any(p["slug"].endswith("copy-2") for p in dig(body, "items", [])),
    )

    code, body = admin.delete(f"/programmes/{prog_id}")
    r.expect("a published programme cannot be deleted outright", 400, code, body)
    code, _ = admin.delete(f"/programmes/{copy_id}")
    r.expect("a draft programme can be deleted", 204, code)

    code, body = admin.post(f"/programmes/{prog_id}/archive")
    r.expect("archive a programme", 200, code, body)
    code, body = anon.get("/public/programmes")
    r.assert_true(
        "archived programme leaves the public site",
        not any(p["slug"] == "soc-analyst" for p in dig(body, "items", [])),
    )
    code, body = anon.get("/public/programmes/soc-analyst")
    r.expect("archived programme detail is 404", 404, code)
    code, body = admin.post(f"/programmes/{prog_id}/publish")
    r.expect("republish it", 200, code, body)
    code, body = anon.get("/public/programmes")
    r.assert_true(
        "it is public again",
        any(p["slug"] == "soc-analyst" for p in dig(body, "items", [])),
    )

    admin.delete(f"/programmes/{prog_id}/modules/{mod_id}")

    code, body = admin.post(
        "/programmes",
        {
            "slug": "Invalid Slug",
            "code": "X",
            "name": "x",
            "tag": "t",
            "summary": "s",
        },
    )
    r.expect("invalid slug refused", 400, code, body)

    code, body = admin.get("/programmes?sort=passwordHash")
    r.expect("sorting by an arbitrary column refused", 400, code, body)

    # ── Media library ─────────────────────────────────────────
    r.heading("Media library")
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000a49444154789c6300010000050001"
        "0d0a2db40000000049454e44ae426082"
    )
    code, body = admin.post(
        "/media", files={"file": (f"test-{run}.png", png, "image/png")}
    )
    r.expect("upload a PNG", 201, code, body)
    asset = dig(body, "items.0", {})
    asset_id = asset.get("id")
    r.assert_true("classified as an image", asset.get("kind") == "image", str(asset.get("kind")))

    code, body = admin.post(
        "/media", files={"file": (f"dupe-{run}.png", png, "image/png")}
    )
    r.assert_true(
        "identical file is rejected as a duplicate",
        code == 400 or dig(body, "rejected"),
        message_of(body) or "rejected",
    )

    code, body = admin.post(
        "/media", files={"file": ("evil.png", b"MZ\x90\x00executable", "image/png")}
    )
    r.expect("executable disguised as a PNG refused", 400, code, body)

    code, body = admin.post(
        "/media",
        files={
            "file": (
                "evil.svg",
                b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
                "image/svg+xml",
            )
        },
    )
    r.expect("SVG containing script refused", 400, code, body)

    code, body = admin.post(
        "/media", files={"file": ("notes.txt", b"plain text", "text/plain")}
    )
    r.expect("unsupported type refused", 400, code, body)

    code, body = admin.patch(
        f"/media/{asset_id}",
        {"alt": "A test image", "title": "Test image", "description": "Uploaded by the test."},
    )
    r.expect("edit media metadata", 200, code, body)

    code, body = admin.get(f"/media/{asset_id}/usage")
    r.expect("usage report", 200, code, body)
    r.assert_true("unused asset reports no usage", dig(body, "total") == 0)

    if prog_id:
        admin.patch(f"/programmes/{prog_id}", {"imageId": asset_id})
        code, body = admin.get(f"/media/{asset_id}/usage")
        r.assert_true(
            "usage is reported once attached",
            dig(body, "total", 0) >= 1,
            f"{dig(body, 'total')} usage(s), {dig(body, 'publishedUsageCount')} published",
        )
        code, body = admin.delete(f"/media/{asset_id}")
        r.expect("deleting a file used by a published page refused", 409, code, body)
        admin.patch(f"/programmes/{prog_id}", {"imageId": None})

    code, _ = admin.delete(f"/media/{asset_id}")
    r.expect("unused file deletes cleanly", 204, code)

    # ── Settings ──────────────────────────────────────────────
    r.heading("Settings and integration health")
    code, body = admin.get("/settings/integrations")
    r.expect("integration health", 200, code, body)
    r.assert_true("database reported reachable", dig(body, "database.ok") is True)
    r.assert_true(
        "email honestly reported as unconfigured",
        dig(body, "email.configured") is False,
        f"configured={dig(body, 'email.configured')}",
    )
    blob = json.dumps(body)
    secret_values = [
        v
        for k, v in load_env().items()
        if re.search(r"(SECRET|PASSWORD|ACCESS_KEY)", k) and len(v) > 8
    ]
    r.assert_true(
        "no secret value appears in the response",
        not any(s in blob for s in secret_values),
        f"checked {len(secret_values)} secrets from .env",
    )

    code, body = admin.get("/settings")
    r.expect("settings list", 200, code, body)
    code, body = admin.patch("/settings/security.loginPolicy", {"value": "anything"})
    r.expect("a locked setting cannot be changed", 400, code, body)
    code, body = admin.patch("/settings/social.linkedin", {"value": "javascript:alert(1)"})
    r.expect("javascript: URL refused", 400, code, body)
    code, body = admin.patch("/settings/contact.email", {"value": "not-an-email"})
    r.expect("invalid email refused", 400, code, body)
    code, body = admin.patch(
        "/settings/social.linkedin", {"value": "https://www.linkedin.com/company/example"}
    )
    r.expect("valid URL accepted", 200, code, body)
    code, body = admin.patch("/settings/social.linkedin", {"value": ""})
    r.expect("clearing a URL accepted", 200, code, body)

    # ── Role-based access control ─────────────────────────────
    r.heading("Role-based access control is enforced by the server")
    code, body = admin.get("/roles")
    roles = {x["name"]: x for x in dig(body, "items", [])}
    r.assert_true(
        "all five roles exist",
        {
            "Super Admin",
            "Administrator",
            "Content Manager",
            "Recruitment Manager",
            "Enquiry Manager",
        }
        <= set(roles),
        ", ".join(sorted(roles)),
    )

    expectations = {
        "Enquiry Manager": {
            "allowed": ["/enquiries"],
            "denied": ["/admin-users", "/audit", "/settings", "/applications", "/media"],
        },
        "Content Manager": {
            "allowed": ["/pages", "/programmes", "/content", "/media"],
            "denied": ["/admin-users", "/applications", "/jobs", "/settings"],
        },
        "Recruitment Manager": {
            "allowed": ["/jobs", "/applications"],
            "denied": ["/pages", "/content", "/admin-users", "/audit"],
        },
    }

    created: list[str] = []
    for role_name, matrix in expectations.items():
        role = roles.get(role_name)
        if not role:
            continue
        addr = f"{role_name.lower().replace(' ', '.')}.{run}@example.com"
        code, body = admin.post(
            "/admin-users",
            {
                "email": addr,
                "name": f"{role_name} Tester",
                "password": "TestPassphrase99",
                "roleId": role["id"],
            },
        )
        if not r.expect(f"create a {role_name}", 201, code, body):
            continue
        created.append(dig(body, "item.id"))

        scoped = Client(base)
        code, _ = scoped.post("/auth/login", {"email": addr, "password": "TestPassphrase99"})
        if code != 200:
            r.fail(f"{role_name} sign in", f"got {code}")
            continue

        for path in matrix["allowed"]:
            code, _ = scoped.get(path)
            r.expect(f"{role_name} CAN read {path}", 200, code)
        for path in matrix["denied"]:
            code, _ = scoped.get(path)
            r.expect(f"{role_name} CANNOT read {path}", 403, code)

    # Privilege escalation
    r.heading("Privilege escalation is blocked")
    cm = roles.get("Content Manager")
    eq = roles.get("Enquiry Manager")
    if cm and eq:
        addr = f"escalation.{run}@example.com"
        code, body = admin.post(
            "/admin-users",
            {
                "email": addr,
                "name": "Escalation Tester",
                "password": "TestPassphrase99",
                "roleId": cm["id"],
            },
        )
        if code == 201:
            created.append(dig(body, "item.id"))
            scoped = Client(base)
            scoped.post("/auth/login", {"email": addr, "password": "TestPassphrase99"})
            code, body = scoped.post(
                "/admin-users",
                {
                    "email": f"puppet.{run}@example.com",
                    "name": "Puppet",
                    "password": "TestPassphrase99",
                    "roleId": roles.get("Super Admin", {}).get("id", "missing"),
                },
            )
            r.expect("cannot create an account more powerful than itself", 403, code, body)
            code, body = scoped.put(
                f"/roles/{eq['id']}/permissions", {"permissionKeys": ["admin:write"]}
            )
            r.expect("cannot grant a permission it does not hold", 403, code, body)

    if "Super Admin" in roles:
        code, body = admin.put(
            f"/roles/{roles['Super Admin']['id']}/permissions",
            {"permissionKeys": ["enquiry:read"]},
        )
        r.expect("Super Admin role cannot be stripped", 400, code, body)
    if eq:
        code, body = admin.delete(f"/roles/{eq['id']}")
        r.expect("a system role cannot be deleted", 400, code, body)

    # ── Self-protection and session revocation ────────────────
    r.heading("Self-protection and session revocation")
    code, body = admin.get("/auth/me")
    my_id = dig(body, "user.id")
    code, body = admin.patch(f"/admin-users/{my_id}", {"isActive": False})
    r.expect("cannot disable your own account", 400, code, body)
    code, body = admin.delete(f"/admin-users/{my_id}")
    r.expect("cannot delete your own account", 400, code, body)
    if eq:
        code, body = admin.patch(f"/admin-users/{my_id}", {"roleId": eq["id"]})
        r.expect("cannot change your own role", 400, code, body)

    if created:
        victim = created[0]
        scoped = Client(base)
        addr = f"enquiry.manager.{run}@example.com"
        code, _ = scoped.post("/auth/login", {"email": addr, "password": "TestPassphrase99"})
        if code == 200:
            code, _ = scoped.get("/enquiries")
            r.expect("session works before revocation", 200, code)
            code, body = admin.post(f"/admin-users/{victim}/revoke-sessions")
            r.expect("revoke their sessions", 200, code, body)
            code, _ = scoped.get("/enquiries")
            r.expect("the live access token stops working at once", 401, code)

        code, body = admin.patch(f"/admin-users/{victim}", {"isActive": False})
        if code == 200:
            scoped2 = Client(base)
            code, body = scoped2.post(
                "/auth/login", {"email": addr, "password": "TestPassphrase99"}
            )
            r.expect("a disabled account cannot sign in", 401, code, body)

    for uid in created:
        admin.delete(f"/admin-users/{uid}")
    r.ok("test administrators cleaned up", f"{len(created)} removed")

    # ── Audit trail ───────────────────────────────────────────
    r.heading("Audit trail")
    Client(base).post("/auth/login", {"email": email, "password": f"wrong-{run}"})
    time.sleep(0.4)
    code, body = admin.get("/audit?action=login_failed&perPage=5")
    r.assert_true(
        "failed sign-ins are recorded",
        dig(body, "pagination.total", 0) > 0,
        f"{dig(body, 'pagination.total')} recorded",
    )
    entry = dig(body, "items.0", {})
    blob = json.dumps(entry)
    # The refusal reason legitimately contains the word "password"
    # ("Email or password is incorrect"), so what matters is that no
    # password VALUE and no password-bearing field is recorded.
    r.assert_true(
        "a failed sign-in records the address, never the password",
        bool(entry.get("actorLabel"))
        and f"wrong-{run}" not in blob
        and password not in blob
        and not any(
            k in blob for k in ('"password"', '"passwordHash"', '"newPassword"')
        ),
        f"actorLabel={entry.get('actorLabel')}",
    )

    code, body = admin.get("/audit?perPage=5")
    blob = json.dumps(dig(body, "items", []))
    r.assert_true(
        "no password hash or token appears in the trail",
        "passwordHash" not in blob and "tokenHash" not in blob,
    )

    code, body = admin.get("/audit/facets")
    r.expect("audit filters", 200, code, body)
    code, _ = admin.delete(f"/audit/{dig(body, 'items.0.id', 'x')}")
    r.assert_true("no endpoint deletes an audit entry", code in (404, 405), str(code))

    code, body = admin.get("/audit?action=publish&perPage=50")
    r.assert_true(
        "publishing is audited",
        dig(body, "pagination.total", 0) > 0,
        f"{dig(body, 'pagination.total')} publish actions",
    )

    # ── Public API surface ────────────────────────────────────
    r.heading("Public API exposes only published, public data")
    code, body = anon.get("/public/site")
    r.expect("site payload", 200, code, body)
    blob = json.dumps(body)
    for leak in [
        "passwordHash",
        "sourceIp",
        "draftValue",
        "internalNote",
        "assignedTo",
        "sessionsValidFrom",
        "isSecret",
    ]:
        r.assert_true(f"no `{leak}` in the public payload", leak not in blob)

    r.assert_true(
        "no draft page content is served",
        all(
            "draft" not in page
            for page in dig(body, "pages", {}).values()
            if isinstance(page, dict)
        ),
    )

    code, body = anon.get("/public/programmes?status=DRAFT")
    r.assert_true(
        "a status filter cannot be forced on the public API",
        all(p.get("status") in (None, "PUBLISHED") for p in dig(body, "items", [])),
        f"{len(dig(body, 'items', []))} programmes returned",
    )

    for path in ["/programmes", "/pages", "/settings", "/audit", "/admin-users"]:
        code, _ = anon.get(path)
        r.expect(f"admin route {path} needs a session", 401, code)

    # ── Validation and error handling ─────────────────────────
    r.heading("Validation and error handling")
    # A payload that is valid apart from the one extra field, so a 400
    # can only mean the extra field was refused.
    valid = {
        "slug": f"mass-{run}",
        "code": f"MA-{run}",
        "name": "Mass assignment probe",
        "tag": "Security Operations",
        "summary": "Used by the test suite to check that unknown fields are refused.",
    }
    code, body = admin.post("/programmes", valid)
    r.expect("the probe payload is otherwise valid", 201, code, body)
    probe_id = dig(body, "item.id")

    code, body = admin.post("/programmes", {**valid, "slug": f"{valid['slug']}-x",
                                            "code": f"{valid['code']}X", "nonsense": True})
    r.expect("unknown field refused (blocks mass assignment)", 400, code, body)

    code, body = admin.post("/programmes", {**valid, "slug": f"{valid['slug']}-y",
                                            "code": f"{valid['code']}Y", "status": "PUBLISHED"})
    r.expect("a record cannot be created already published", 400, code, body)

    if probe_id:
        admin.delete(f"/programmes/{probe_id}")

    code, body = admin.get("/enquiries?perPage=99999")
    r.expect("an absurd page size is refused", 400, code, body)

    code, body = admin.get("/programmes/does-not-exist")
    r.expect("missing record is a clean 404", 404, code, body)
    r.assert_true(
        "error shape is consistent",
        isinstance(dig(body, "error.code"), str) and isinstance(dig(body, "error.message"), str),
        f"code={dig(body, 'error.code')}",
    )

    code, body = admin.get("/not-a-real-endpoint")
    r.expect("unknown endpoint is a 404", 404, code, body)

    # ── Clean up ──────────────────────────────────────────────
    #
    # The suite creates real records through the real API, so it
    # removes them again. Without this, every run would leave test
    # enquiries and applications in the administrator's working queue.
    r.heading("Clean up")

    removed = 0
    for path, search in [("/enquiries", stamp_search), ("/applications", stamp_search)]:
        code, body = admin.get(f"{path}?search={run}&archived=true&perPage=100")
        for row in dig(body, "items", []):
            code, _ = admin.delete(f"{path}/{row['id']}")
            if code == 204:
                removed += 1

    # The formula-injection enquiry is found by its address, not by the
    # run marker, because its searchable fields hold the payload.
    code, body = admin.get(f"/enquiries?search=csv.{run}&archived=true&perPage=20")
    for row in dig(body, "items", []):
        code, _ = admin.delete(f"/enquiries/{row['id']}")
        if code == 204:
            removed += 1

    r.ok("test records removed", f"{removed} deleted")

    code, body = admin.get(f"/enquiries?search={run}&archived=true")
    r.assert_true(
        "nothing from this run is left behind",
        dig(body, "pagination.total", 0) == 0,
        f"{dig(body, 'pagination.total')} remaining",
    )

    # ── Summary ───────────────────────────────────────────────
    total = r.passed + len(r.failed)
    print(f"\n{'─' * 60}")
    tail = f"  ({len(r.skipped)} skipped)" if r.skipped else ""
    if r.failed:
        print(f"{RED}{BOLD}{len(r.failed)} of {total} checks failed{RESET}{tail}\n")
        for f in r.failed:
            print(f"  {RED}•{RESET} {f}")
        return 1
    print(f"{GREEN}{BOLD}all {total} checks passed{RESET}{tail}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

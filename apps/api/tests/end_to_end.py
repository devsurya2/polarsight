#!/usr/bin/env python3
"""
POLARSIGHT end-to-end check.

Proves the three systems are actually joined up:

    admin portal  →  API  →  database  →  public website

Each test makes a change through the authenticated admin API and then
reads the *rendered public website* to confirm what a visitor sees —
not the API's own response, which would only prove the API agrees with
itself.

Usage:
    npm run test:e2e
    python3 apps/api/tests/end_to_end.py --api http://localhost:5000 \
                                         --web http://localhost:3000

Requires the API, the website and the database to be running.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from integration import Client, Results, dig, is_test_marker, load_env  # noqa: E402

RESET = "\033[0m"
DIM = "\033[2m"


def fetch_html(url: str) -> tuple[int, str]:
    """Reads a rendered page, as a visitor's browser would."""
    req = urllib.request.Request(url, headers={"User-Agent": "polarsight-e2e"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", "replace")
    except urllib.error.URLError as err:
        return 0, str(err.reason)


def visible_text(html: str) -> str:
    """Strips tags so a phrase split across elements still matches."""
    without_scripts = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", without_scripts)
    # Next.js inlines its RSC payload with escaped characters.
    text = text.replace("\\u0026", "&").replace("&amp;", "&").replace("&#x27;", "'")
    return re.sub(r"\s+", " ", text)


def headings_of(region: object) -> list[str]:
    """Every heading-like string an editor can set inside a region."""
    out: list[str] = []
    if isinstance(region, list):
        for entry in region:
            out.extend(headings_of(entry))
        return out
    if not isinstance(region, dict):
        return out
    # A hidden region is not expected on the page.
    if region.get("visible") is False:
        return out
    for field in ("heading", "title"):
        value = region.get(field)
        if isinstance(value, str) and value.strip():
            out.append(value.strip())
    for nested in ("items", "steps", "points", "sections", "groups"):
        out.extend(headings_of(region.get(nested)))
    return out


def strings_of(value: object) -> list[str]:
    """Flattens a content block's value to the strings it contains."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [s for v in value for s in strings_of(v)]
    if isinstance(value, dict):
        return [s for v in value.values() for s in strings_of(v)]
    return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:5000")
    parser.add_argument("--web", default="http://localhost:3000")
    args = parser.parse_args()

    env = load_env()
    email = env.get("SEED_ADMIN_EMAIL")
    password = env.get("SEED_ADMIN_PASSWORD")
    if not email or not password:
        print("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set", file=sys.stderr)
        return 2

    base = f"{args.api.rstrip('/')}/api"
    web = args.web.rstrip("/")
    r = Results()
    admin = Client(base)

    stamp = time.strftime("%H%M%S")

    # Pages are regenerated on demand when REVALIDATE_SECRET is shared,
    # and on their own within a minute otherwise. Allow for both.
    settle = 2.0 if env.get("REVALIDATE_SECRET") else 65.0

    r.heading("Sign in")
    code, body = admin.post("/auth/login", {"email": email, "password": password})
    admin.post("/auth/reauth", {"password": password})
    if not r.expect("administrator signs in", 200, code, body):
        return 2

    code, html = fetch_html(f"{web}/")
    if not r.expect("website is reachable", 200, code):
        print("\nStart the website with `npm run dev:web`.", file=sys.stderr)
        return 2

    # ── 1. Page content reaches the website ───────────────────
    r.heading("Editing a page changes the website")

    marker = f"End-to-end marker {stamp}"
    code, body = admin.get("/pages/about")
    draft = dig(body, "item.draft", {})
    original = dig(draft, "mission.body", "")
    if not isinstance(draft, dict) or "mission" not in draft:
        r.fail("about page has the expected shape", str(list(draft)))
        return 1

    # This test publishes to a live page, so it must put the real copy
    # back. If what is there is already a marker, an earlier run did
    # not clean up — restoring it would keep it on the site while the
    # test still passed, so stop instead.
    if is_test_marker(original):
        r.fail(
            "the About page holds its real copy before this test runs",
            f"found a leftover marker: {original[:60]!r} — "
            "restore it from apps/web/lib/pages.js before re-running",
        )
        return 1

    draft["mission"]["body"] = marker
    code, body = admin.put("/pages/about/draft", {"draft": draft})
    r.expect("save the draft", 200, code, body)

    time.sleep(settle)
    code, html = fetch_html(f"{web}/about")
    r.assert_true(
        "an unpublished draft is NOT on the website",
        marker not in visible_text(html),
        "visitors still see the published copy",
    )

    code, body = admin.post("/pages/about/publish", {"label": f"E2E {stamp}"})
    r.expect("publish", 200, code, body)

    time.sleep(settle)
    code, html = fetch_html(f"{web}/about")
    r.assert_true(
        "the published change IS on the website",
        marker in visible_text(html),
        "admin → API → database → website",
    )

    # Put it back, so the test leaves the site as it found it, and
    # check the real copy is actually on the page again — not merely
    # that the marker has gone.
    code, body = admin.get("/pages/about")
    restored = dig(body, "item.draft", {})
    restored["mission"]["body"] = original
    admin.put("/pages/about/draft", {"draft": restored})
    admin.post("/pages/about/publish", {"label": "Restored after end-to-end test"})
    time.sleep(settle)
    code, html = fetch_html(f"{web}/about")
    rendered = visible_text(html)
    r.assert_true(
        "the real copy is back on the website",
        marker not in rendered and original[:60] in rendered,
        f"{original[:50]}…",
    )

    # ── 1b. Preview renders the draft, and only with a token ──
    r.heading("Draft preview")

    preview_marker = f"Preview-only text {stamp}"
    code, body = admin.get("/pages/about")
    draft = dig(body, "item.draft", {})
    kept = dig(draft, "mission.body", "")
    draft["mission"]["body"] = preview_marker
    code, _ = admin.put("/pages/about/draft", {"draft": draft})
    r.expect("save a draft that is never published", 200, code)

    code, body = admin.post("/pages/about/preview")
    r.expect("issue a preview link", 200, code, body)
    preview_url = dig(body, "url", "")

    time.sleep(settle)
    code, html = fetch_html(f"{web}/about")
    r.assert_true(
        "the plain page does NOT show the draft",
        preview_marker not in visible_text(html),
    )

    code, html = fetch_html(preview_url)
    text = visible_text(html)
    r.assert_true(
        "the preview link renders the draft", code == 200 and preview_marker in text
    )
    r.assert_true(
        "the preview is labelled as unpublished",
        "Previewing unpublished content" in text,
    )

    parts = urllib.parse.urlparse(preview_url)
    query = urllib.parse.parse_qs(parts.query)
    real_token = query["token"][0]

    for label, patch in [
        ("a forged token", {"token": ["forged-token"]}),
        ("an expired token", {"token": [real_token], "expires": ["1"]}),
    ]:
        tampered = dict(query, **patch)
        url = parts._replace(query=urllib.parse.urlencode(tampered, doseq=True)).geturl()
        code, html = fetch_html(url)
        r.assert_true(
            f"{label} falls back to the published page",
            code == 200 and preview_marker not in visible_text(html),
        )

    # Put the draft back, and confirm it took — a draft left holding a
    # marker is one publish away from reaching the site.
    code, body = admin.get("/pages/about")
    restore = dig(body, "item.draft", {})
    restore["mission"]["body"] = kept
    code, body = admin.put("/pages/about/draft", {"draft": restore})
    r.assert_true(
        "the draft is left holding the real copy",
        code == 200 and not is_test_marker(dig(body, "item.draft.mission.body")),
        str(dig(body, "item.draft.mission.body"))[:50],
    )

    # ── 2. Programme publication controls the public site ─────
    r.heading("Publication state controls what is public")

    code, body = admin.get("/programmes?perPage=50")
    programmes = dig(body, "items", [])
    soc = next((p for p in programmes if p["slug"] == "soc-analyst"), None)
    archived = [p for p in programmes if p["status"] == "ARCHIVED"]

    if soc:
        code, html = fetch_html(f"{web}/programmes/soc-analyst")
        r.expect("a published programme is reachable", 200, code)
        r.assert_true(
            "its curriculum is rendered from the database",
            "Networking Fundamentals" in visible_text(html)
            or "SIEM" in visible_text(html),
            "modules come from curriculum_modules",
        )

    for p in archived[:2]:
        code, _ = fetch_html(f"{web}/programmes/{p['slug']}")
        r.expect(f"archived /{p['slug']} is 404 to a visitor", 404, code)

    code, html = fetch_html(f"{web}/programmes")
    text = visible_text(html)
    for p in archived[:2]:
        r.assert_true(
            f"archived programme '{p['name']}' is absent from the listing",
            p["name"] not in text,
        )

    # ── 3. Job openings reach the careers page ────────────────
    r.heading("Job openings reach the careers page")

    code, body = admin.get("/jobs?perPage=50")
    jobs = dig(body, "items", [])
    published = [j for j in jobs if j["status"] == "PUBLISHED"]

    code, html = fetch_html(f"{web}/careers")
    text = visible_text(html)
    r.assert_true(
        "published openings are listed",
        all(j["title"] in text for j in published[:3]),
        f"{len(published)} published",
    )

    if published:
        target = published[0]
        code, body = admin.post(f"/jobs/{target['id']}/unpublish")
        r.expect(f"unpublish '{target['title']}'", 200, code, body)

        time.sleep(settle)
        code, html = fetch_html(f"{web}/careers")
        r.assert_true(
            "an unpublished opening leaves the careers page",
            target["title"] not in visible_text(html),
        )

        code, body = admin.post(f"/jobs/{target['id']}/publish")
        r.expect("publish it again", 200, code, body)
        time.sleep(settle)
        code, html = fetch_html(f"{web}/careers")
        r.assert_true(
            "it is back on the careers page",
            target["title"] in visible_text(html),
        )

    # ── 4. The public forms write to the database ─────────────
    r.heading("Public forms write to the database")

    anon = Client(base)
    enquiry_email = f"e2e.{stamp}@example.com"
    code, body = anon.post(
        "/public/enquiries",
        {
            "name": f"End To End {stamp}",
            "email": enquiry_email,
            "organisation": "Example Institute",
            "subject": "College Partnership",
            "message": "Submitted by the end-to-end test to prove the contact form reaches the portal.",
        },
    )
    submitted = r.expect("contact form submits", 201, code, body)
    enquiry_id = dig(body, "id")

    if submitted:
        code, body = admin.get(f"/enquiries?search={stamp}")
        found = dig(body, "items", [])
        r.assert_true(
            "it appears in the admin portal",
            any(e["id"] == enquiry_id for e in found),
            f"{len(found)} matching",
        )
        admin.delete(f"/enquiries/{enquiry_id}")

    code, body = admin.get("/jobs?perPage=5&status=PUBLISHED")
    opening = dig(body, "items.0", {})
    resume = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF\n"

    code, body = Client(base).post(
        "/public/applications",
        form={
            "fullName": f"E2E Applicant {stamp}",
            "email": f"applicant.{stamp}@example.com",
            "appliedPosition": opening.get("title", "SOC Analyst Trainer"),
            "jobOpeningId": opening.get("id", ""),
            "expertise": "SIEM,Threat detection",
            "technicalSkills": "Splunk",
            "experienceYears": "5",
        },
        files={"resume": ("resume.pdf", resume, "application/pdf")},
    )
    applied = r.expect("careers application submits", 201, code, body)
    application_id = dig(body, "id")

    if applied:
        code, body = admin.get(f"/applications?search={stamp}")
        r.assert_true(
            "it appears in the recruitment pipeline",
            any(a["id"] == application_id for a in dig(body, "items", [])),
        )
        code, scan = admin.get("/settings/integrations")
        code, raw = admin.get(f"/applications/{application_id}/resume", raw=True)
        if dig(scan, "malwareScanner.ok"):
            r.assert_true(
                "its resume is retrievable by an authorised reviewer once scanned clean",
                code == 200 and isinstance(raw, bytes) and raw.startswith(b"%PDF"),
            )
        else:
            r.expect("its resume is withheld until a scanner has passed it", 409, code)
        admin.delete(f"/applications/{application_id}")

    # ── 5. Nothing internal leaks to a visitor ────────────────
    r.heading("Nothing internal leaks to a visitor")

    for path in ["/", "/about", "/careers", "/programmes", "/programmes/soc-analyst"]:
        code, html = fetch_html(f"{web}{path}")
        leaks = [
            token
            for token in [
                "passwordHash",
                "sourceIp",
                "draftValue",
                "sessionsValidFrom",
                "SEED_ADMIN",
                env.get("JWT_ACCESS_SECRET", "\0"),
                env.get("POSTGRES_PASSWORD", "\0"),
                env.get("REVALIDATE_SECRET", "\0"),
            ]
            if token and token != "\0" and token in html
        ]
        r.assert_true(f"{path} leaks nothing internal", not leaks, ", ".join(leaks))

    # ── 6. The homepage's first interface is intact ───────────
    r.heading("The homepage's first interface is intact")

    code, html = fetch_html(f"{web}/")
    text = visible_text(html)
    r.assert_true("homepage renders", code == 200 and len(html) > 5000, f"{len(html)} bytes")
    r.assert_true(
        "the hero headline is present",
        any(fragment in text for fragment in ["Beyond", "cybersecurity", "POLARSIGHT"]),
    )
    r.assert_true("the navigation is present", "<nav" in html or "role=\"navigation\"" in html)

    code, body = admin.get("/pages/home")
    regions = dig(body, "item.draft", {})
    r.assert_true(
        "the CMS has no hero, nav or video region at all",
        not any(k in regions for k in ["hero", "nav", "navigation", "video"]),
        f"editable regions: {', '.join(sorted(regions))}",
    )

    # ── 7. The portal matches the website ────────────────────
    #
    # The defect this guards against: an admin screen that edits
    # content no page renders, or page copy that cannot be reached
    # from the portal. Both are invisible until somebody tries to use
    # the portal and nothing changes.
    r.heading("Every editable field reaches the website")

    code, body = admin.get("/pages")
    pages = dig(body, "items", [])
    r.assert_true("the portal lists pages", len(pages) > 0, f"{len(pages)} pages")

    for page in pages:
        key, route = page["key"], page.get("route")
        if not route:
            r.fail(f"page '{key}' has a route", "no public route declared")
            continue

        code, html = fetch_html(f"{web}{route}")
        if code != 200:
            r.fail(f"{route} is reachable", f"HTTP {code}")
            continue
        rendered = visible_text(html)

        code, body = admin.get(f"/pages/{key}")
        document = dig(body, "item.draft", {})

        # Every heading an editor can set should appear on the page.
        missing = []
        for name, region in (document or {}).items():
            for text in headings_of(region):
                if text and text not in rendered:
                    missing.append(f"{name}: {text[:40]}")

        r.assert_true(
            f"{route} renders every heading the portal can edit",
            not missing,
            "; ".join(missing[:3]) if missing else f"{len(document or {})} regions",
        )

    # Content blocks are keyed copy; each one should be on some page.
    code, body = anon.get("/public/content")
    blocks = dig(body, "content", {})
    pages_html = " ".join(visible_text(fetch_html(f"{web}{p}")[1]) for p in ["/", "/about"])

    unused = []
    for key, value in blocks.items():
        for text in strings_of(value):
            # Short fragments collide with ordinary words; only check
            # ones long enough to be meaningful.
            if len(text) > 25 and text not in pages_html:
                unused.append(key)
                break

    r.assert_true(
        "every content block appears on the site",
        not unused,
        f"not found: {', '.join(unused)}" if unused else f"{len(blocks)} blocks",
    )

    # ── Summary ───────────────────────────────────────────────
    total = r.passed + len(r.failed)
    print(f"\n{'─' * 60}")
    if r.failed:
        print(f"\033[31m\033[1m{len(r.failed)} of {total} checks failed\033[0m\n")
        for f in r.failed:
            print(f"  \033[31m•\033[0m {f}")
        return 1
    print(f"\033[32m\033[1mall {total} end-to-end checks passed\033[0m")
    print(f"{DIM}admin portal → API → database → public website{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

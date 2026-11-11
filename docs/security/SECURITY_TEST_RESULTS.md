# Security test results — 2026-11-11

All runs against the local development stack (API :5000, website :3000,
admin :3001, PostgreSQL 17 in Docker, clamd in Docker on 127.0.0.1:3310).
No production system was tested.

## Automated

| Suite | Command | Before fixes | After fixes |
|---|---|---|---|
| Security regression | `npm run test:security` | 13 of the probed properties failed (see "Baseline" below) | **94 / 94 passed**, 1 skipped (opt-in) |
| Security regression incl. brute force | `python3 apps/api/tests/security.py --with-bruteforce` | — | **95 / 95 passed** (per-address throttle engaged after 17 failed sign-ins, within the 30-per-window budget already partly consumed by the suite) |
| API integration | `npm run test:api` | 218 / 218 | **220 / 220** (two checks added: no token in sign-in body; re-authentication) |
| End to end (admin → API → DB → website) | `npm run test:e2e` | 48 / 48 | **48 / 48** |
| Dependency audit | `npm audit` | 1 high (`nodemailer`, 3 advisories) | **0 vulnerabilities** at every level |
| Secret scan | `gitleaks detect` + `gitleaks git` | no leaks (3 commits) | no leaks |
| Typecheck / build | `npm run typecheck && npm run build` | clean | clean (API, admin, website) |
| SBOM | `npm run security:sbom` | — | CycloneDX 1.5, 535 components |

## Baseline (reproduction before fixes)

The first probe run on the unmodified code recorded, with harmless
synthetic inputs only:

| Property | Observed |
|---|---|
| Access token absent from sign-in body | present |
| Captured access token after sign-out | still accepted (200) |
| Limited administrator ending a Super Admin's sessions | allowed (200) |
| Permission removed from a role | still honoured by live session (200) |
| Stored resume at `/media/<key>` without a session | served (200) |
| 6 MB resume | accepted (201) |
| Double-extension file name | accepted (201) |
| Zip bytes declared as DOCX | accepted (201) |
| Line break in applicant name | accepted (201) |
| Disallowed CORS origin | 500 with debug text |
| Unexpected upload field | 500 |
| Security headers on website and admin | none |
| Forged `X-Forwarded-For` | trusted |

Each row is now a passing check in `apps/api/tests/security.py`.

## What the security suite covers

Session handling (token never in body, HttpOnly/SameSite, `no-store`,
sign-out invalidation, refresh rotation and reuse detection, uniform
failure message, forwarding headers ignored); privilege boundaries
(re-authentication gate, hierarchy on account management, immediate
permission revocation, every admin route unauthenticated → 401, public
status filter ignored); injection (SQL-looking search, inline handlers,
prototype keys, path traversal, header newlines); CORS/CSRF (foreign
origin → 403 without debug, cookie writes without trusted origin
refused); headers on all three units; upload error mapping (400/413);
resume policy (ten rejection cases, one acceptance, base-name
reduction); storage (not reachable via `/media`, random key, private
tier, scan verdict, download gated on CLEAN + session + re-auth); MFA
(enrol, wrong/right codes, no cookie before second factor, recovery
code single use, re-auth needs the code, disable); dependencies; and
the opt-in per-address brute-force throttle.

## Manual verification

* Admin portal in the browser: signed in as a throwaway Content Manager
  account (created and deleted during the check), dashboard rendered
  with live data, Your account shows the two-factor card and enrolment
  entry point. Console: only the expected pre-sign-in 401s.
* Website: all public routes return 200 and the end-to-end suite
  asserts every portal-editable heading renders.
* Admin production build contains the `<meta>` CSP and no source maps.
* Front-end headers inspected with `curl -D -` on both dev servers.

## Not tested, and why

* **Malware detection with a real sample**: the pipeline's connectivity
  and clean path are verified; the detection path must be verified on
  staging with the standard antivirus test file (FILE_UPLOAD_SECURITY.md).
  No live sample is kept in this repository.
* **Account lockout on the seed account**: would lock the only
  administrator out for 15 minutes; covered by the integration suite's
  failed-sign-in audit checks and by code review.
* **Production TLS/HSTS/proxy behaviour**: environment-specific; see
  DEPLOYMENT_SECURITY_CHECKLIST.md.
* **OWASP ZAP / Burp**: not installed on this host; the probe suite
  covers the equivalent active checks for this API surface. Running ZAP
  against staging is recommended before go-live (section 7 of
  SECURITY_CONFIGURATION_GUIDE.md).

## Side effect of running the suite

`--with-bruteforce` deliberately exhausts the per-address sign-in
budget; sign-in from that address is throttled for the rest of
`RATE_LIMIT_WINDOW_MS` (15 minutes by default). Successful sign-ins do
not count, so a run without the flag leaves the limiter untouched.

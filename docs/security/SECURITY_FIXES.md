# Security fixes — what changed, where, and why

Companion to VULNERABILITY_REGISTER.md. Grouped by area; each entry
lists the files modified and the behaviour that changed. Nothing here
removed existing functionality or altered existing records; the one
schema migration is additive.

## Storage and uploads (PS-01, PS-09, PS-10, PS-11, PS-18, PS-22)

| File | Change |
|---|---|
| `apps/api/src/lib/storage.ts` | Two tiers (`public`, `private`); `put(buffer, mime, tier)`, `release`, `remove(key, tier)`, `get(key, tier)`; random 16-byte keys; files written `0600` with `wx`; `validateResume` (PDF-only policy); PDF inspection and DOCX inspection wired into `validateUpload`; SVG screening decodes entities first |
| `apps/api/src/lib/pdf.ts` | **New.** Structural check + active-content policy with bounded stream inflation |
| `apps/api/src/lib/zipcheck.ts` | **New.** Central-directory inspection of DOCX without extraction; entry, size, ratio and path limits |
| `apps/api/src/lib/scan.ts` | **New.** clamd `INSTREAM`/`PING`/`VERSION` client with timeouts; three-way verdict; never maps an error to clean |
| `apps/api/src/lib/quarantine.ts` | **New.** The pipeline: quarantine → scan → release/refuse/keep; `USABLE_MEDIA` predicate; `rescanQuarantined` |
| `apps/api/src/modules/applications/routes.ts` | Resume policy; pipeline; download gated on `CLEAN` + re-auth, `no-store`; `POST /:id/resume/rescan`; private-tier deletion |
| `apps/api/src/modules/applications/service.ts` | Scan state in the reviewer's view |
| `apps/api/src/modules/media/routes.ts` | Pipeline on upload; dedupe before writing; `POST /:id/rescan`; delete needs re-auth and removes from the right tier; scan fields in listings |
| `apps/api/src/modules/{programmes,pages,settings,public}/routes.ts` | Every media reference requires a scanned asset |
| `apps/api/src/app.ts` | Static mount serves only the public tier; `redirect: false` |
| `apps/api/src/middleware/error.ts` | multer and busboy failures → 413/400 |
| `apps/api/src/jobs/rescan.ts`, `jobs/cleanup.ts` | **New.** Backlog scanning; orphan/expired-quarantine cleanup (`npm run media:rescan`, `media:cleanup`) |
| `apps/api/prisma/schema.prisma` + migration | `ScanStatus` enum; `scanStatus`, `scannedAt`, `scannerVersion`, `scanDetail` on `media_assets`; existing rows marked `SCAN_SKIPPED` |
| `apps/api/package.json` | `multer` 1.4.5 → 2.5.0, `nodemailer` 7.0 → 10.5 |
| `docker-compose.yml` | `clamav` service (profile `scan`, loopback-only port) |

## Authentication and sessions (PS-03, PS-04, PS-05, PS-14, PS-15, PS-16, PS-19)

| File | Change |
|---|---|
| `apps/api/src/lib/tokens.ts` | Access token carries `sid` and `scope`, not permissions; MFA challenge tokens; purpose-tagged tokens cannot be confused |
| `apps/api/src/middleware/auth.ts` | Per-request: live session family, `sessions_valid_from`, permissions from the role; `mfa_setup` scope confined to `/auth` |
| `apps/api/src/middleware/reauth.ts` | **New.** `signElevation`, `requireRecentAuth`, `REAUTH_REQUIRED` |
| `apps/api/src/lib/totp.ts`, `lib/secretbox.ts` | **New.** RFC 6238 TOTP + recovery codes; AES-256-GCM for seeds |
| `apps/api/src/modules/auth/service.ts` | Two-step login; one failure message; `completeMfaLogin`; `reauthenticate`; enrol/confirm/disable/regenerate; `logout` revokes by family |
| `apps/api/src/modules/auth/routes.ts` | No token in bodies; `no-store`; `/mfa/verify`, `/mfa/setup`, `/mfa/confirm`, `/mfa/disable`, `/mfa/recovery-codes`, `/reauth`; per-address limiter on sign-in and MFA |
| `apps/api/src/middleware/rateLimit.ts` | `loginIpLimiter` |
| `apps/api/src/config/env.ts` | `MFA_REQUIRED_ROLES`, `MFA_ENCRYPTION_KEY`, `LOGIN_IP_RATE_LIMIT_MAX`; production requires the MFA key and a scanner |
| `apps/api/prisma/schema.prisma` + migration | `mfa_secret`, `mfa_pending_secret`, `mfa_enabled_at`, `mfa_recovery_codes` |
| `apps/admin/src/lib/auth.tsx`, `pages/Login.tsx` | Two-step sign-in; enrolment redirect |
| `apps/admin/src/lib/api.ts`, `components/Reauth.tsx`, `App.tsx` | `REAUTH_REQUIRED` → prompt → retry (also for downloads) |
| `apps/admin/src/pages/Account.tsx` | MFA enrolment, recovery codes, disable |

## Authorization (PS-02)

| File | Change |
|---|---|
| `apps/api/src/modules/adminUsers/routes.ts` | `assertCanActOn` on reset-password, revoke-sessions, PATCH, DELETE; self-reset refused; re-auth on every mutation; single-line names |
| `apps/api/src/modules/roles/routes.ts` | Re-auth on mutations; changes apply immediately (no token to wait out) |
| `apps/api/src/modules/{settings,enquiries,audit}/routes.ts` | Re-auth on settings writes and every export |

## Configuration and headers (PS-06, PS-08, PS-12, PS-13, PS-20, PS-21)

| File | Change |
|---|---|
| `apps/api/src/app.ts` | `TRUST_PROXY`-controlled proxy trust; CORS refusal is a 403; stricter API CSP (`default-src 'none'`, sandbox); `csrfGuard` on `/api`; preflight cache |
| `apps/api/src/middleware/csrf.ts` | **New.** Origin / Sec-Fetch-Site / Referer check on cookie-authenticated writes |
| `apps/api/src/lib/sanitize.ts` | `singleLineText`; used for names and titles in applications, enquiries and administrators |
| `apps/api/src/modules/public/routes.ts` | `no-store` on non-GET |
| `apps/web/next.config.mjs` | CSP, `nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy, COOP, HSTS in production; `poweredByHeader: false` |
| `apps/admin/vite.config.ts` | Same header set for dev and preview; build-time `<meta>` CSP; source maps off |
| `apps/admin/src/pages/{Settings,Media,ApplicationDetail}.tsx` | Scanner health, scan badges, gated download with rescan |

## Process (PS-17, PS-23, PS-24)

| File | Change |
|---|---|
| `.github/workflows/security.yml` | Audit (moderate+ fails), SBOM artifact, gitleaks, Semgrep (OWASP + project rules), typecheck, migrations from scratch, destructive-migration documentation gate, build |
| `.semgrep.yml`, `.gitleaks.toml` | Project rules and allowlists |
| `scripts/backup.sh`, `scripts/restore.sh` | Encrypted (age) backups of database and both upload tiers; checksum; 30-day local retention; restore with confirmation |
| `docs/security/sql/least-privilege.sql` | DML-only application role; append-only audit table |
| `docs/security/nginx.example.conf` | TLS, forwarding, admin headers |
| `apps/api/tests/security.py` | **New.** 94-check regression suite (`npm run test:security`) |
| `apps/api/tests/{integration,end_to_end}.py` | Browser-like `Origin`; re-authentication; complete PDF fixture; scanner-aware expectations; derived permission assertion |
| `package.json` | `test:security`, `security:audit`, `security:secrets`, `security:sbom`, `media:rescan`, `media:cleanup` |

# Security configuration guide

How each control is configured, what it defaults to, and how to change
it safely. Variables live in the repository-root `.env` (development)
or the platform's secret store (production); see docs/environment.md
for the complete list.

## Sessions and cookies

| Setting | Default | Guidance |
|---|---|---|
| `JWT_ACCESS_TTL` | `15m` | Short on purpose. The middleware checks the session family and permissions on every request anyway, so a longer TTL buys little |
| `JWT_REFRESH_TTL` | `7d` | Idle sessions end after this. Shorten for a stricter environment |
| `COOKIE_SECURE` | `false` (dev) | **Must** be `true` in production (boot refuses otherwise) |
| `COOKIE_DOMAIN` | `localhost` | The exact host of the admin portal; never a bare parent domain shared with untrusted sites |
| SameSite | `Lax` dev / `Strict` prod | Fixed in code |

Rotating `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` ends every session
and invalidates outstanding preview links and MFA challenges. Rotate
both after any suspected compromise; they must differ.

## Multi-factor authentication

| Setting | Default | Guidance |
|---|---|---|
| `MFA_REQUIRED_ROLES` | prod `Super Admin`, dev none | Comma-separated role names. A member without MFA gets an enrolment-only session until they enrol. Add `Administrator` once the team has authenticators |
| `MFA_ENCRYPTION_KEY` | derived (dev) | 32 random bytes base64url. **Rotation re-encrypts nothing automatically**: changing it invalidates every stored seed, so plan a re-enrolment window and announce it |

Recovery codes: eight per account, single use, regenerable from Your
account with a current code. A Super Admin who loses both device and
codes is recovered by another Super Admin resetting the password
(hierarchy permitting) and, with database access, clearing
`mfa_secret`/`mfa_enabled_at` — then re-enrolling.

## Re-authentication

Ten minutes, bound to the session family, implemented in
`middleware/reauth.ts`. Guarded routes are listed in
API_SECURITY_DOCUMENTATION.md. To guard another route add
`requireRecentAuth` after its permission check; the portal's API
client handles the prompt. The window is `ELEVATION_TTL_MS` in code,
deliberately not an environment variable.

## Rate limiting

| Setting | Default | Scope |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 15 min / 300 | Whole API, per address |
| `LOGIN_RATE_LIMIT_MAX` | 8 | Sign-in, per address **and** account (failures only) |
| `LOGIN_IP_RATE_LIMIT_MAX` | 30 | Sign-in and MFA verify, per address (failures only) |
| `ENQUIRY_RATE_LIMIT_MAX` | 10 / hour | Contact form |
| `APPLICATION_RATE_LIMIT_MAX` | 5 / hour | Careers form |
| `UPLOAD_RATE_LIMIT_MAX` | 40 / 15 min | Media library |

Limits are per API process (in-memory). With more than one API instance
behind a load balancer, add a shared store (`rate-limit-redis`) to the
limiters in `middleware/rateLimit.ts`; otherwise each instance allows
the full budget. The development `.env` raises these for repeated test
runs; production must use the defaults.

`TRUST_PROXY` decides which address the limiters and the audit log see.
`false` uses the socket address; `true` trusts one hop of
`X-Forwarded-For`. Set `true` **only** behind your own proxy.

## CORS and CSRF

`CORS_ORIGINS` is an exact-match allowlist; a request from any other
origin is refused with 403 and logged. The CSRF guard additionally
requires a trusted `Origin` (or `Sec-Fetch-Site`/`Referer`) on every
cookie-authenticated write. Scripts calling the API should use a bearer
`Authorization` header rather than cookies; such requests bypass the
CSRF guard because a cross-site form cannot set a header.

## Content Security Policy

* **API**: `default-src 'none'` plus `sandbox`; it serves JSON and files only.
* **Website** (`next.config.mjs`): `script-src 'self' 'unsafe-inline'`
  (`'unsafe-eval'` in development only). Upgrade path: add a Next
  middleware that generates a per-request nonce, pass it to the root
  layout and set `script-src 'self' 'nonce-…' 'strict-dynamic'`. The
  content model (plain text, no HTML rendering) means the practical
  exposure today is low.
* **Admin** (`vite.config.ts`): `script-src 'self'` in production
  (`'unsafe-inline'` only in dev for React Fast Refresh), injected as a
  `<meta>` at build time and expected from the proxy as a header
  (`docs/security/nginx.example.conf`), which also provides
  `frame-ancestors`, something a `<meta>` CSP cannot.

Both allow `img-src`/`media-src`/`connect-src` to the API origin
(`VITE_API_URL` / `API_URL`), so changing the API host means rebuilding
both front ends.

## Uploads and scanning

Covered in FILE_UPLOAD_SECURITY.md. Knobs: `RESUME_MAX_BYTES`,
`CLAMAV_HOST`/`CLAMAV_PORT`/`CLAMAV_TIMEOUT_MS`, `STORAGE_LOCAL_DIR`,
`STORAGE_PRIVATE_DIR`, `QUARANTINE_MAX_AGE_DAYS` (cleanup job). Per-type
size caps are in `lib/storage.ts`. Scheduled jobs: `npm run media:rescan`
after signature updates; `npm run media:cleanup` daily.

## Database

Run `docs/security/sql/least-privilege.sql` once; point `DATABASE_URL`
at `polarsight_app` and run migrations as `polarsight_migrate`. Use
`?sslmode=require` for any non-local database. Backups:
`scripts/backup.sh` with an `age` recipient whose private key is held
off-host; rehearse `scripts/restore.sh` quarterly.

## Logging

pino JSON to stdout, `info` in production. Redacted paths:
`authorization`, `cookie`, `set-cookie`, any `password`, `passwordHash`,
`token`, `refreshToken`, `accessToken`. Security-relevant events are
also in the `audit_logs` table (read-only through the API; export
bounded and audited). Ship stdout to your log platform; alert on:
`account locked`, `refresh token reuse detected`, `malware detected`,
`upload left in quarantine`, `recovery code used`, `blocked by CORS`
bursts, and any `auth.reauth_failed` run.

## Recommended future improvements

1. Nonce-based CSP on the website (removes `'unsafe-inline'`).
2. Shared rate-limit store before running more than one API instance.
3. Object storage driver with server-side encryption and a lifecycle
   rule for the quarantine prefix.
4. WebAuthn/passkeys as a second factor alongside TOTP.
5. Argon2id for new passwords (ASVS recommends; bcrypt remains acceptable).
6. Per-user TOTP step tracking to close the in-window replay (R-2).
7. A dedicated staging stack with clamd for the end-to-end detection
   test before every release.

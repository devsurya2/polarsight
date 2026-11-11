# Environment variables

One `.env` at the repository root serves all three apps. Copy the
template and fill it in:

```bash
cp .env.example .env
```

`.env` is gitignored. Never commit it.

Generate every secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Database

| Variable | Required | Default | Notes |
|---|---|---|---|
| `POSTGRES_USER` | yes | `polarsight` | Must match what the container starts with |
| `POSTGRES_PASSWORD` | yes | — | `docker-compose.yml` refuses to start without it |
| `POSTGRES_DB` | yes | `polarsight` | |
| `POSTGRES_PORT` | no | `5433` | Host port. 5433 on purpose: 5432 may belong to a system install |
| `DATABASE_URL` | **yes** | — | Prisma connection string, assembled from the values above |

---

## API

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | |
| `API_PORT` | no | `5000` | |
| `WEB_URL` | no | `http://localhost:3000` | Used for preview links and cache invalidation |
| `CORS_ORIGINS` | no | `localhost:3000,localhost:3001` | Comma separated. An origin not listed is refused |

### Security (added by the 2026-11 hardening)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `TRUST_PROXY` | no | `false` | **true only behind a reverse proxy** that sets `X-Forwarded-For`; otherwise clients could forge their address |
| `LOGIN_IP_RATE_LIMIT_MAX` | no | `30` | Failed sign-ins per address across all accounts, per window |
| `MFA_REQUIRED_ROLES` | no | prod: `Super Admin`; dev: none | Comma-separated roles whose members must enrol a second factor |
| `MFA_ENCRYPTION_KEY` | **prod** | derived in dev | 32 random bytes, base64url. Encrypts TOTP seeds at rest |
| `STORAGE_PRIVATE_DIR` | no | `./private-uploads` | Resumes and quarantined uploads. Never served |
| `RESUME_MAX_BYTES` | no | `5242880` | Resume ceiling (PDF only) |
| `CLAMAV_HOST` | **prod** | — | clamd host. Unset: resumes stay quarantined; prod refuses to boot |
| `CLAMAV_PORT` | no | `3310` | |
| `CLAMAV_TIMEOUT_MS` | no | `30000` | Per-scan timeout; a timeout leaves the file quarantined |

### Authentication

| Variable | Required | Default | Notes |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | **yes** | — | ≥ 32 characters, or the API refuses to boot |
| `JWT_REFRESH_SECRET` | **yes** | — | ≥ 32 characters, and **different** from the access secret |
| `JWT_ACCESS_TTL` | no | `15m` | Short on purpose |
| `JWT_REFRESH_TTL` | no | `7d` | |
| `COOKIE_DOMAIN` | no | `localhost` | |
| `COOKIE_SECURE` | no | `false` | **Must be `true` in production** |

The API validates its own configuration at boot and exits rather than
starting with something unsafe. In production it additionally refuses
to start when `COOKIE_SECURE` is false, when the two JWT secrets match,
or when the storage driver is still `local`.

### First administrator

| Variable | Required | Notes |
|---|---|---|
| `SEED_ADMIN_EMAIL` | for seeding | |
| `SEED_ADMIN_PASSWORD` | for seeding | ≥ 12 characters. Change it after the first sign-in |

The password is applied on **create only**. Re-running the seed never
resets a password that has since been changed.

### Rate limiting

| Variable | Default | Scope |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15 minutes |
| `RATE_LIMIT_MAX` | `300` | All `/api` requests per window |
| `LOGIN_RATE_LIMIT_MAX` | `8` | Per address **and** per account |
| `ENQUIRY_RATE_LIMIT_MAX` | `10` | Contact form, per hour |
| `APPLICATION_RATE_LIMIT_MAX` | `5` | Trainer applications, per hour |
| `UPLOAD_RATE_LIMIT_MAX` | `40` | Media uploads per 15 minutes |

> A full test run makes several hundred requests. Raise
> `RATE_LIMIT_MAX` locally when running the suites repeatedly, and put
> it back before deploying.

### Media storage

| Variable | Required | Default | Notes |
|---|---|---|---|
| `STORAGE_DRIVER` | no | `local` | `local` is the only implemented driver |
| `STORAGE_LOCAL_DIR` | no | `./uploads` | Must be a persistent volume in production |
| `STORAGE_PUBLIC_URL` | no | `http://localhost:5000/media` | Base URL for stored objects |

Uploads are written to the API instance's own disk. `StorageDriver` in
`apps/api/src/lib/storage.ts` is the whole surface the rest of the
code touches, so a bucket-backed driver can be added without changing
any other file — but there is no such driver today, and
`STORAGE_DRIVER` deliberately accepts no value that does not work.

In production the API logs a warning at startup stating where uploads
land. That path must survive a restart, and only one instance may
write to it.

### Outbound email

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SMTP_HOST` | no | — | **Unset means email is off** |
| `SMTP_PORT` | no | `587` | |
| `SMTP_SECURE` | no | `false` | |
| `SMTP_USER` | no | — | |
| `SMTP_PASSWORD` | no | — | Never stored in the database or returned by the API |
| `MAIL_FROM` | no | — | Required alongside `SMTP_HOST` for email to be considered configured |
| `MAIL_REPLY_TO` | no | — | |

With `SMTP_HOST` and `MAIL_FROM` both set, email is considered
configured. Otherwise the API **does not pretend**: it returns
`{ sent: false, reason: "not_configured" }`, the admin portal says so
plainly, and the website tells an applicant no confirmation could be
sent. Nothing anywhere claims a message was delivered when it was not.

### Cache invalidation

| Variable | Required | Notes |
|---|---|---|
| `REVALIDATE_SECRET` | no | Shared with the website's `/api/revalidate` route |

With it set, publishing refreshes the site immediately. Without it,
nothing is called and the site refreshes on its own within a minute.
The website's route refuses every request when the secret is unset,
rather than defaulting to open — an unauthenticated cache-buster is a
cheap way to force a site to regenerate every page on demand.

---

## Website (`apps/web`)

`NEXT_PUBLIC_*` values are inlined into the browser bundle at **build
time**. They are public by definition — never put a secret in one —
and changing any of them requires a rebuild.

| Variable | Required | Notes |
|---|---|---|
| `API_URL` | no | Where the site reads published content, server side. Defaults to `http://localhost:5000` |
| `NEXT_PUBLIC_API_URL` | no | Browser-side fallback for the same address |
| `NEXT_PUBLIC_CONTACT_EMAIL` | no | Build-time fallback for the contact address |
| `NEXT_PUBLIC_CONTACT_PHONE` | no | Shown with a `tel:` link |
| `NEXT_PUBLIC_INSTITUTIONAL_EMAIL` | no | |
| `NEXT_PUBLIC_BUSINESS_EMAIL` | no | |
| `NEXT_PUBLIC_SOCIAL_LINKEDIN` | no | Full URL |
| `NEXT_PUBLIC_SOCIAL_INSTAGRAM` | no | Full URL |
| `NEXT_PUBLIC_SOCIAL_GITHUB` | no | Full URL |

**None of these has a default value, deliberately.** An address that
is wrong is worse than one that is missing, because it sends people
somewhere nobody controls. A blank value makes the site omit that
field entirely rather than render an empty link.

Contact details are now also editable in the admin portal under
Settings, which takes precedence. The build-time values remain as a
fallback for a deployment with no database.

---

## Admin portal (`apps/admin`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | no | Proxy target in development. Defaults to `http://localhost:5000` |
| `VITE_WEB_URL` | no | Where the header's "View website" link points |

The dev server proxies `/api` and `/media` to the API, so the browser
stays on one origin and the API's httpOnly cookies remain first-party.

---

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] `COOKIE_SECURE=true`
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are long, random and **different**
- [ ] `DATABASE_URL` points at the production database
- [ ] `CORS_ORIGINS` lists only the real website and admin origins
- [ ] `STORAGE_LOCAL_DIR` and `STORAGE_PRIVATE_DIR` are persistent volumes, written to by one instance only
- [ ] `CLAMAV_HOST` reachable, `MFA_ENCRYPTION_KEY` set, `TRUST_PROXY=true` behind the proxy
- [ ] `SMTP_HOST` and `MAIL_FROM` set, if candidate notifications are wanted
- [ ] `REVALIDATE_SECRET` shared between API and website
- [ ] `SEED_ADMIN_PASSWORD` changed after the first sign-in
- [ ] Rate limits returned to their defaults
- [ ] `NEXT_PUBLIC_*` contact details filled in with addresses the business owns
- [ ] Database and object-store backups scheduled

The API refuses to boot in production if the first three are wrong, so
a misconfiguration fails loudly at deploy rather than quietly at
runtime.

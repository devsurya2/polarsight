# Deployment

What has to be true before this runs anywhere but a laptop.

---

## Shape

Three deployable units plus a database:

| Unit | Build | Run |
|---|---|---|
| `apps/web` | `npm run build:web` | `next start -p 3000` |
| `apps/admin` | `npm run build:admin` | Static files from `apps/admin/dist` |
| `apps/api` | `npm run build:api` | `node apps/api/dist/server.js` |
| Database | — | Managed PostgreSQL 17 |

The admin build is a static bundle. Serve it from any static host, with
a rewrite sending unknown paths to `index.html` so client-side routing
works on a refresh.

### Admin routing on Vercel

`apps/admin/vercel.json` is the production counterpart of the
dev-server proxy in `vite.config.ts`. The API client calls a relative
`/api` (`src/lib/api.ts`) deliberately: the browser then treats the
session cookie as first-party, so the API's httpOnly `SameSite=Strict`
cookies are sent on every request and the CSRF guard's Origin check
passes without either being weakened. It also keeps the backend host
out of the frontend bundle. The three rewrites send `/api` and `/media`
to the API and everything else to `index.html`, in that order; the SPA
fallback additionally excludes those two prefixes by negative
lookahead so an API path can never be rewritten to `index.html`.

Two things that bite:

- **The file is read from the project's Root Directory.** With Root
  Directory `apps/admin`, Vercel reads `apps/admin/vercel.json`. At any
  other root it never sees the file, and `/login` 404s while `/` still
  works.
- **`vercel.json` is schema-validated, and unknown keys fail the
  build.** The schema at `https://openapi.vercel.sh/vercel.json` sets
  `additionalProperties: false`, so a `"//"` comment key — legal in
  `package.json` — is rejected with *"should NOT have additional
  property"*. A failed build is not a visible outage: Vercel keeps
  serving the last successful deployment, so the symptom is routing
  changes that silently never take effect. Keep the file minimal and
  put the reasoning here instead.

## Before the first deploy

The API refuses to start in production with unsafe configuration. It
exits if any of these are wrong, which is intentional:

- `COOKIE_SECURE` must be `true`.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must differ, and each
  must be at least 32 characters.
- `MFA_ENCRYPTION_KEY` must be set.

A variable that is present but empty counts as unset, so `FOO=` in a
hosting dashboard gets the documented default rather than coercing to
zero or to an empty list.

## Apply the schema before the first start

**The API boots fine against an empty database.** Its startup check is
`SELECT 1`, which needs no tables, so a missing schema does not
announce itself: `/health` returns 200 and every route that touches a
table returns 500. Sign-in fails with `INTERNAL_ERROR` because
`admin_users` does not exist.

Migrations are therefore a deploy step, not a one-off someone
remembers:

```bash
npm run db:deploy --workspace @polarsight/api   # prisma migrate deploy
npm run db:seed   --workspace @polarsight/api   # first administrator, idempotent
```

Both read `DATABASE_URL` from the process environment; the `dotenv`
wrapper in those scripts silently does nothing when there is no local
`.env`, which is what makes them safe to run on a host. Wire
`db:deploy` into the platform's pre-deploy or release phase so it runs
on every deploy, and run `db:seed` once.

`db:seed` creates the first administrator from `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD`. It upserts, and **never changes the password of
an account that already exists** — so re-running it is safe, and
changing those variables later does not reset a password. Use
Administrators → Reset password for that.

Generate secrets per environment. Never reuse them across
environments, and never reuse the development values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Required environment

Set everything in `.env.example`. The ones that must change from their
development values:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Managed database, TLS enforced |
| `JWT_ACCESS_SECRET` | Fresh 48-byte random value |
| `JWT_REFRESH_SECRET` | A different fresh value |
| `COOKIE_SECURE` | `true` |
| `COOKIE_DOMAIN` | Your real domain |
| `CORS_ORIGINS` | Exact public and admin origins, nothing else |
| `STORAGE_LOCAL_DIR`, `STORAGE_PRIVATE_DIR` | Paths on a persistent volume |
| `CLAMAV_HOST` | The clamd host (required) |
| `MFA_ENCRYPTION_KEY` | Fresh 32-byte random value |
| `TRUST_PROXY` | `true` (behind the reverse proxy) |
| `API_URL` / `NEXT_PUBLIC_API_URL` / `VITE_API_URL` | Public API URL |

Secrets belong in your platform's secret store, not in a file in the
repository and not in the build image.

## Object storage is not implemented

`apps/api/src/lib/storage.ts` defines a `StorageDriver` interface with
one implementation: local disk. There is no bucket driver, and
`STORAGE_DRIVER` accepts no value that would pretend otherwise.

This constrains the deployment rather than blocking it:

- `STORAGE_LOCAL_DIR` **must** be a persistent volume. A container
  filesystem loses every upload on restart.
- Exactly **one** API instance may write to it. Uploads are not
  shared between instances, so this does not scale horizontally.

Add a driver here before you need a second instance. Nothing outside
that file has to change.

## Database

```bash
npm run db:deploy --workspace @polarsight/api
```

`db:deploy` applies existing migrations and never generates new ones,
which is what you want in production. Do not run `db:migrate` or
`db:reset` against a live database; `db:reset` destroys all data.

Run the seed once, to create the first Super Admin and the role and
permission rows. It is idempotent, so a repeat run is harmless.

## Behind a proxy

The API sets `trust proxy`, so rate limiting and audit logging see the
real client address. Your proxy must set `X-Forwarded-For` correctly,
otherwise every request appears to come from one address and the rate
limits become useless.

## Security headers

Helmet is configured in `apps/api/src/app.ts`, including a content
security policy and, in production only, HSTS with a one-year max age
and preload. Review the policy before serving anything from a third
party, since `defaultSrc` is `'self'`.

## Checklist

- [ ] Fresh secrets generated, different per environment
- [ ] `COOKIE_SECURE=true` and a real `COOKIE_DOMAIN`
- [ ] `CORS_ORIGINS` lists only the real origins
- [ ] `STORAGE_LOCAL_DIR` on a persistent volume, one writer only
- [ ] Migrations applied with `db:deploy`
- [ ] Seed run once; the seeded password changed immediately
- [ ] Proxy forwards the client address
- [ ] TLS terminated in front of all three units
- [ ] Database backups configured and a restore tested
- [ ] `.env` absent from the repository and from built images

The full pre-deployment list is docs/security/DEPLOYMENT_SECURITY_CHECKLIST.md.

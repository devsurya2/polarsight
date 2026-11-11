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

## Before the first deploy

The API refuses to start in production with unsafe configuration. It
exits if any of these are wrong, which is intentional:

- `COOKIE_SECURE` must be `true`.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must differ, and each
  must be at least 32 characters.
- `CLAMAV_HOST` must be set: uploads cannot be scanned without it.
- `MFA_ENCRYPTION_KEY` must be set.

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

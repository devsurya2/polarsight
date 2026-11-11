# Deployment security checklist

Everything the platform expects of the environment it runs in. The
API refuses to boot in production when the items marked ⛔ are wrong;
the rest it cannot detect, so check them yourself.

## Secrets and configuration

- [ ] ⛔ `NODE_ENV=production`
- [ ] ⛔ `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: ≥ 32 random chars, **different**, unique to this environment
- [ ] ⛔ `COOKIE_SECURE=true`; `COOKIE_DOMAIN` is the real domain
- [ ] ⛔ `MFA_ENCRYPTION_KEY`: 32 random bytes (base64url), dedicated
- [ ] ⛔ `CLAMAV_HOST` reachable (verify on Settings → Integrations after boot)
- [ ] `TRUST_PROXY=true` **only** because a reverse proxy sets `X-Forwarded-For`
- [ ] `CORS_ORIGINS`: exact website and admin origins, nothing else
- [ ] `REVALIDATE_SECRET` set identically on API and website
- [ ] `MFA_REQUIRED_ROLES` left at its production default (`Super Admin`) or widened
- [ ] `SEED_ADMIN_PASSWORD` changed at first sign-in; the Super Admin enrolled MFA
- [ ] Rate limits at their defaults (`RATE_LIMIT_MAX=300`, `LOGIN_RATE_LIMIT_MAX=8`, `LOGIN_IP_RATE_LIMIT_MAX=30`, `ENQUIRY_RATE_LIMIT_MAX=10`, `APPLICATION_RATE_LIMIT_MAX=5`)
- [ ] Secrets injected from the platform's secret store; no `.env` in the image or repository
- [ ] `NEXT_PUBLIC_*` contain only public contact details

## Network and TLS

- [ ] TLS on every public hostname; HTTP redirects to HTTPS; HSTS enabled once HTTPS is verified (the API and website emit it in production)
- [ ] Reverse proxy sets `X-Forwarded-For` / `X-Forwarded-Proto` and sends the admin headers (`docs/security/nginx.example.conf`)
- [ ] Database port not reachable from the internet; TLS enforced on the connection (`?sslmode=require`)
- [ ] clamd bound to loopback or a private network only
- [ ] SMTP over TLS; credentials only in the API environment
- [ ] Only ports 443 (proxy) exposed; API, database and scanner private

## Database

- [ ] API runs as the DML-only role from `docs/security/sql/least-privilege.sql`; migrations run as the owner role
- [ ] `npm run db:deploy` applied; never `db:migrate`/`db:reset` in production
- [ ] Connection limit set on the application role
- [ ] Automated backups (`scripts/backup.sh`) on a schedule, encrypted, stored off-host, **restore rehearsed**

## Storage

- [ ] `STORAGE_LOCAL_DIR` and `STORAGE_PRIVATE_DIR` on a persistent volume, owned by the API user, `0750`
- [ ] Exactly one API instance writes to them
- [ ] `npm run media:cleanup` and `npm run media:rescan` scheduled (daily / after signature updates)
- [ ] `freshclam` keeps signatures current

## Containers and processes

- [ ] API runs as a non-root user with a read-only root filesystem apart from the upload volumes
- [ ] Memory and CPU limits on API and clamd
- [ ] No source maps or `.env` in built images (`apps/admin` build disables maps)

## Pipeline

- [ ] `.github/workflows/security.yml` green: audit, gitleaks, Semgrep, typecheck, migrations, build
- [ ] A release with an unresolved high/critical advisory is blocked
- [ ] SBOM artifact retained per release

## After deploy

- [ ] Settings → Integrations: database, storage, scanner and email all green; `trustProxy` true; MFA key "Dedicated key"
- [ ] `npm run test:e2e` and `npm run test:security` pass against **staging**
- [ ] Sign in, confirm MFA prompt, confirm a sensitive action asks for re-authentication
- [ ] Submit a test application on staging and confirm the resume shows "Scanned clean" before download

## Rollback triggers

Roll back the release if, after deploy: the scanner shows unreachable
and uploads are expected; sign-in fails for MFA-enrolled accounts; the
website returns the built-in copy instead of published content for more
than one minute; or any high-severity check in the security suite fails
on staging.

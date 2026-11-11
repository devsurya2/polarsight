# POLARSIGHT

Monorepo for the POLARSIGHT public website, admin portal and backend
API.

POLARSIGHT runs hands-on cybersecurity training inside colleges and
connects graduates to the teams hiring them.

---

## Layout

```
polarsight/
├── apps/
│   ├── web/      Public website   — Next.js 16, React 19, JavaScript, Tailwind 4
│   ├── admin/    Admin portal     — React, TypeScript, Vite, Tailwind
│   └── api/      Backend API      — Node, Express, TypeScript, Prisma
├── docs/         api · database · admin-setup · deployment
├── requirements.md
├── task.md
├── docker-compose.yml
└── .env.example
```

Managed with npm workspaces. One install at the root covers all three
applications.

## Ports

| Service | Port |
|---|---|
| Public website | 3000 |
| Admin portal | 3001 |
| Backend API | 5000 |
| PostgreSQL (project container) | 5433 |

PostgreSQL deliberately uses 5433. The machine may already run a
system install on 5432, and this project does not touch it.

## Getting started

You need Node 20 or newer and Docker.

```bash
git clone <repo> && cd polarsight
npm install
cp .env.example .env
```

Edit `.env`. At minimum set a database password and generate two
different secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then bring up the database and fill it:

```bash
npm run db:up        # start the Postgres container
npm run db:migrate   # apply migrations
npm run db:seed      # roles, permissions, first admin, website copy
```

Finally, run everything:

```bash
npm run dev
```

| | |
|---|---|
| Website | http://localhost:3000 |
| Admin portal | http://localhost:3001 |
| API health | http://localhost:5000/health |

Sign in to the portal with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` from your `.env`, then change that password
immediately. See [docs/admin-setup.md](docs/admin-setup.md).

## Scripts

Run from the repository root.

| Command | Does |
|---|---|
| `npm run dev` | All three applications together |
| `npm run dev:web` · `dev:admin` · `dev:api` | One at a time |
| `npm run build` | Build all three |
| `npm run lint` | Lint all three |
| `npm run typecheck` | TypeScript applications only |
| `npm run test` | Both suites below |
| `npm run test:api` | 216 integration checks against the running API |
| `npm run test:e2e` | 47 checks, including a portal-vs-website alignment guard |
| `npm run db:up` · `db:down` · `db:logs` | Database container |
| `npm run db:migrate` · `db:seed` · `db:studio` | Schema and data |
| `npm run db:reset` | Drop, re-migrate, re-seed. **Destroys all data** |

One workspace at a time:

```bash
npm run build --workspace @polarsight/web
```

## How the pieces fit

```
Admin portal ─┐                      ┌─ enquiries, applications
              ├─→  API  ─→  Database ┤
Public site ──┘                      └─ published content
```

Both front ends talk to the same API, and neither holds a database
credential.

- **API** owns the database, authentication and permissions. Every
  protected route checks a permission on the server; the portal hides
  screens as a convenience, not as a control.
- **Admin portal** manages everything the public site shows. Edits are
  saved as drafts and are invisible to visitors until published.
- **Public website** reads only published content, posts the contact
  form and the trainer application form, and falls back to its own
  built-in copy key by key when the API is unreachable — so a backend
  outage cannot take the marketing site down.

### Draft isolation

A draft is not a hidden row. Editable content keeps its live value and
its working draft in **separate database columns**, and no public
endpoint selects the draft column or accepts a status from the caller.
There is no query a visitor could make that returns unpublished work.

Previewing a draft needs a signed, ten-minute token issued to an
authenticated editor. Without one the preview route returns 404 — the
same answer an unpublished page gives anybody else.

### Publishing

Publishing records a version, then asks the website to drop its cache
so the change appears immediately. Without `REVALIDATE_SECRET` set it
appears within a minute instead. Neither path needs a deploy.

Restoring a version writes into the **draft**, never straight to the
live value, so a rollback is reviewable before it reaches the site.

### The homepage's first screen

The hero, navigation, video and first-screen layout are not editable
content. They have no region in the CMS and no row in the database,
so nothing done in the admin portal can change them. This is enforced
by the page schema on the server, not by convention.

## Documentation

| Document | Covers |
|---|---|
| [docs/api.md](docs/api.md) | Every endpoint, permissions, rate limits |
| [docs/database.md](docs/database.md) | Schema, migrations, conventions |
| [docs/admin-setup.md](docs/admin-setup.md) | Roles, first sign-in, publishing, every module |
| [docs/environment.md](docs/environment.md) | Every environment variable, and a production checklist |
| [docs/deployment.md](docs/deployment.md) | Going to production |
| [requirements.md](requirements.md) | What this is and is not |
| [task.md](task.md) | Phase-by-phase record of what was built and verified |

## Security

- Secrets come from the environment. `.env` is git-ignored;
  `.env.example` holds placeholders only.
- Passwords are bcrypt hashes; refresh tokens are stored hashed.
- Refresh tokens rotate, and replaying a spent one revokes the whole
  session family.
- Every request body, query and parameter is validated, and unknown
  keys are rejected rather than ignored.
- Uploads are checked against their real bytes, not their filename.
- Every administrative change is recorded in an audit log.
- The API refuses to start in production with unsafe configuration.

## Troubleshooting

**`npm run dev` fails on the API with a database error.**
The container is not running or migrations have not been applied:

```bash
npm run db:up && npm run db:migrate
```

**Port already in use.**
Something else holds 3000, 3001, 5000 or 5433. Find it with
`ss -ltnp | grep :5000`. The database port can be changed with
`POSTGRES_PORT` in `.env`; remember to update `DATABASE_URL` too.

**Website shows old content after editing in the admin portal.**
Expected. Pages regenerate at most once a minute. Wait, or restart the
dev server to clear the fetch cache.

**Website shows the built-in copy instead of the database.**
The API is unreachable, which is the fallback working as designed.
Check `curl localhost:5000/health`. The web server log will also show
connection-refused traces while the API is down.

**Admin portal returns 401 immediately after signing in.**
`COOKIE_DOMAIN` does not match the host you are using. For local work
it should be `localhost`.

**`npm install` warns about blocked install scripts.**
npm 11 blocks dependency lifecycle scripts by default. The ones this
project needs are already approved in `package.json` under
`allowScripts`. If a new one appears, review it before approving with
`npm install-scripts approve <pkg>`.

**Reset everything and start again.**

```bash
npm run db:reset
```

## Version control

If this is not yet in a repository of its own:

```bash
git init && git add . && git commit -m "POLARSIGHT monorepo"
```

`.gitignore` already keeps dependencies, build output and secrets out.

## Project status

The platform is complete: the admin portal is the control panel for
the public website, and every figure, list and page a visitor sees
comes from the database.

| Area | State |
|---|---|
| Authentication, sessions, RBAC | Complete and verified |
| Content management (pages, blocks, versioning) | Complete and verified |
| Portal matches the website, field for field | Complete and verified |
| Programmes and curriculum builder | Complete and verified |
| Recruitment (openings, applications, pipeline) | Complete and verified |
| Enquiry management | Complete and verified |
| Media library | Complete and verified |
| Settings and integration health | Complete and verified |
| Audit logging | Complete and verified |
| Public website integration | Complete and verified |

**263 automated checks pass** — 216 integration and 47 end-to-end —
run against the real API, the real database and the rendered website.

```bash
npm run test
```

### The portal mirrors the website

Every screen and every field manages something the public site
actually renders, and everything editable on the site is reachable
from the portal. That correspondence is checked by the end-to-end
suite: for each page it loads the rendered route and asserts that
every heading the portal can edit appears on it.

There is nothing in the portal without a matching section on the
site, and nothing in the API without a screen. The modules behind the
sections the site dropped — "who we serve", a FAQ list, standalone
statistics, separate careers prose blocks — were removed with them,
rather than left as endpoints serving empty lists.

### Requires external configuration

These are complete in code and need credentials or a service before
they do anything in production. Each one says so plainly in the
interface rather than failing silently.

- **Object storage.** Uploads are written to the API instance's own
  disk. That works, and it constrains the deployment: the directory
  must be a persistent volume and only one instance may write to it.
  `StorageDriver` is the whole surface a bucket-backed driver would
  replace, and `STORAGE_DRIVER` accepts no value that is not
  implemented. See [docs/deployment.md](docs/deployment.md).
- **Outbound email.** Candidate and enquiry notifications are built and
  templated. Set `SMTP_HOST` and `MAIL_FROM` to enable them. Until
  then the API returns `{ sent: false, reason: "not_configured" }`, the
  portal tells the administrator no message was sent, and the website
  tells an applicant no confirmation could be sent. **Nothing claims a
  message was delivered when it was not.**
- **Contact details and social profiles.** Blank by default, on
  purpose. A wrong address is worse than a missing one, so the site
  omits any field that is not set. Fill them in under Settings.

### Known limitations

- **The admin bundle is one ~930 KB chunk** (221 KB gzipped).
  Acceptable for an internal tool behind a sign-in; split by route if
  it ever drags.
- **Noisy logs during an API outage.** Next prints its own
  connection-refused trace per request on top of the single warning
  the content client emits. Behaviour is correct; the logs are ugly.

## Security assessment

Assessed against OWASP Top 10:2025 / ASVS 5.0 Level 2 on 2026-11-11;
every finding fixed and retested. Audit report, vulnerability register,
API inventory, upload pipeline, authentication design, test results,
incident response, deployment checklist and configuration guide are in
[docs/security/](docs/security/).

```bash
npm run test:security   # 94 active probes against the local stack
npm run security:audit  # dependency advisories (CI blocks on moderate+)
npm run security:sbom   # CycloneDX SBOM
```

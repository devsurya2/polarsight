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
| `npm run db:up` · `db:down` · `db:logs` | Database container |
| `npm run db:migrate` · `db:seed` · `db:studio` | Schema and data |
| `npm run db:reset` | Drop, re-migrate, re-seed. **Destroys all data** |

One workspace at a time:

```bash
npm run build --workspace @polarsight/web
```

## How the pieces fit

The admin portal and the public website both talk to the API, and
neither holds a database credential.

- **Public website** reads published content from the API at build and
  revalidation time, and posts the contact form to it. Its own copy in
  `apps/web/lib/content.js` remains as an offline fallback: if the API
  is unreachable the site renders that copy instead, key by key, so a
  backend outage cannot take the marketing site down.
- **Admin portal** manages that content. Everything is created as a
  draft and is invisible to the public site until published.
- **API** owns the database, authentication and permissions.

## Documentation

| Document | Covers |
|---|---|
| [docs/api.md](docs/api.md) | Every endpoint, permissions, rate limits |
| [docs/database.md](docs/database.md) | Schema, migrations, conventions |
| [docs/admin-setup.md](docs/admin-setup.md) | Roles, first sign-in, publishing |
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

All six phases are complete and verified. `task.md` records what was
built in each, what was tested, and the defects found and fixed along
the way.

| Phase | State |
|---|---|
| 1. Monorepo restructure | Complete and verified |
| 2. Database and Prisma schema | Complete and verified |
| 3. Backend API | Complete and verified |
| 4. Admin portal | Complete and verified |
| 5. Public site integration | Complete and verified |
| 6. Documentation and handover | Complete and verified |

### Known limitations

- **Object storage is not implemented.** The media driver works on
  local disk for development; the S3 driver is a stub that throws.
  It must be written before deploying. See
  [docs/deployment.md](docs/deployment.md).
- **Statistics and audiences are unpublished drafts.** The figures
  inherited from the old site are illustrative and must be replaced
  with evidenced numbers before anyone publishes them.
- **The admin bundle is one 596 KB chunk** (164 KB gzipped).
  Acceptable for an internal tool; split by route if it ever drags.
- **Noisy logs during an API outage.** Next prints its own
  connection-refused trace per request on top of the single warning
  the content client emits. Behaviour is correct; the logs are ugly.

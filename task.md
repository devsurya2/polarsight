# POLARSIGHT — Task Plan

Phases run in order. A phase is not ticked until it has been built
**and verified by running it**. Anything that breaks is reported, not
worked around silently.

Legend: `[x]` done and verified · `[~]` in progress · `[ ]` not started

---

## Phase 1 — Monorepo restructure

- [x] Inspect existing repository and confirm the real stack
- [x] Snapshot the project before moving anything
- [x] Create `apps/` and move the Next.js site to `apps/web` unchanged
- [x] Name the site `@polarsight/web`; pin it to port 3000
- [x] Root `package.json` with npm workspaces and dev scripts
- [x] Root `.gitignore` and `.env.example`
- [x] `requirements.md` and `task.md`
- [x] Install dependencies from the workspace root
- [x] **Verify the website builds and serves exactly as before**
- [x] Root `README.md`

Exit criteria: the public site builds and renders identically from
its new path, with no visual or functional change.

**Phase 1 verified.** Build output unchanged (3 static routes). Site
renders with the same nav, section order, assets, point-cloud mark,
palette and spacing. One breaking change was found and fixed: the
Turbopack `root` had been pinned to the app folder, which broke the
build once npm workspaces hoisted `next` to the repo root. The root
now points at the workspace root.

## Phase 2 — Database

- [x] `docker-compose.yml` with an isolated Postgres container,
      dedicated credentials, non-default host port, named volume
- [x] Confirm the system Postgres is untouched
- [x] `apps/api` scaffold: TypeScript, Express, tsconfig, scripts
- [x] Prisma schema for all twelve models, with relations, indexes,
      constraints and timestamps
- [x] Initial migration applied to a clean database
- [x] Seed: roles, permissions, first Super Admin, existing website
      copy migrated out of `lib/content.js` into the database
- [x] **Verify**: migrate and seed on a dropped database; inspect rows

Exit criteria: a clean database can be built from migrations alone.

**Phase 2 verified.** Database dropped and rebuilt from a single
migration, then reseeded, producing identical counts: 26 permissions,
3 roles, 1 administrator, 36 content blocks, 4 programmes, 4
audiences, 6 FAQs, 4 career entries, 4 statistics. System Postgres on
5432 confirmed untouched and still rejecting these credentials.
Password stored as a bcrypt hash, never plaintext. Placeholder figures
seeded as DRAFT so they cannot reach the public site.

Two issues found and fixed during this phase:
- `npm audit` reported a critical path-traversal advisory reaching the
  runtime tree through `bcrypt` -> `@mapbox/node-pre-gyp` -> `tar`.
  Swapped to `bcryptjs`, which is the same algorithm and hash format
  with zero dependencies. Tree is now clean.
- Table names were mapped to snake_case but columns were left
  camelCase. Corrected before any data existed, with a single clean
  initial migration rather than a rename stacked on top.

## Phase 3 — Backend API

- [x] Config loader with fail-fast validation of environment
- [x] Middleware: auth, role authorisation, validation, errors,
      rate limiting, request logging, security headers, CORS
- [x] Auth module: login, refresh with rotation, logout, me
- [x] Admin users module, guarded by Super Admin
- [x] Content modules: website content, programmes, statistics,
      audience, career, FAQs
- [x] Enquiries module: create (public), list, detail, status,
      notes, export
- [x] Media module: upload validation, storage driver, metadata
- [x] Audit logging on every mutation
- [x] Public read-only routes that expose published records only
- [x] API documentation in `docs/`
- [x] **Verify**: exercise every route, including failure cases

Exit criteria: no endpoint trusts its input; unauthorised and
unpublished access both refused.

**Phase 3 verified** against a running server on port 5000.

- Public surface returns published records only. Drafts absent from
  list endpoints; a draft slug returns 404, indistinguishable from
  missing.
- Every administrative route returns 401 without a session.
- Sign-in returns identical responses for a wrong password and an
  unknown account, so the endpoint cannot enumerate addresses.
- Refresh rotation verified: replaying a spent token revoked the whole
  family and killed the newer token too.
- Role-based access verified with a real Enquiry Manager account:
  reads allowed, writes and administration refused with 403.
- Strict schemas rejected an unknown `status` key, blocking mass
  assignment.
- Full programme lifecycle exercised: create as draft, publish,
  update, unpublish, delete, with public visibility tracking each step.
- 13 audit entries written with before and after snapshots, and no
  credential field present in any of them.

One defect found and fixed: the contact-form honeypot was returning
400 because the schema rejected a filled-in value before the handler
ran, which told a bot exactly which field had caught it. The schema
now accepts the field and the handler discards the submission with a
202 that is indistinguishable from success.

## Phase 4 — Admin portal

- [x] Vite + React + TypeScript + Tailwind + Router scaffold
- [x] API client with refresh handling
- [x] Sign-in and protected routing
- [x] Dashboard: counts, recent enquiries, content overview
- [x] Programme management with publish control
- [x] Website content editing
- [x] Enquiry management: search, filter, detail, status, notes,
      export
- [x] Media library
- [x] Admin user and role management
- [x] Role-aware interface
- [x] **Verify**: every screen performs real operations; no mock data

Exit criteria: no dead buttons, no stubbed CRUD.

**Phase 4 verified** in a browser against the live API.

- Signed in through the form; the session cookie carried through and
  the dashboard rendered real figures: 2 enquiries, 4 programmes, 36
  content blocks.
- All 13 routes return 200 with real data. No screen is stubbed and
  no mock data remains anywhere in the portal.
- Write path proven end to end: unpublishing a programme from the
  table removed it from the public API immediately, and republishing
  restored it.
- Added an internal note through the enquiry screen; it saved,
  attributed correctly and appeared instantly.
- The audit log grew from 13 to 18 entries during this testing,
  capturing the operations performed through the portal.
- Role screen reflects real granted permissions, with the Super Admin
  role locked so the last route into the portal cannot be removed.
- Navigation is filtered by permission, and each route is additionally
  gated; the API refuses regardless, so the interface is convenience
  rather than the control.

Known item, not a defect: the production bundle is 596 KB (164 KB
gzipped) in a single chunk. Acceptable for an internal tool on a
desk; worth code-splitting by route if it ever feels slow.

## Phase 5 — Public site integration

- [x] API client for the website
- [x] Replace static content reads with live published content
- [x] Contact form posts real enquiries
- [x] Fall back to current static content if the API is down
- [x] **Verify**: unpublished records never appear; site survives an
      API outage

Exit criteria: content edited in the admin portal appears on the
public site, and the site still builds with the API offline.

**Phase 5 verified.**

- Live read proven: a content block was edited through the API and the
  new value appeared on the rendered page, then was restored.
- Unpublished records never reach the site. Four statistics and four
  audiences exist in the database; the public API returns none.
- The contact form was filled and submitted in a browser. It created
  a real enquiry, which then appeared in the admin portal as NEW.
- Outage survived. With the API stopped and the cache cleared, every
  request still returned 200 and the page rendered complete from the
  built-in content: headline, four programmes, six FAQs and the form.
- Page still prerenders statically, regenerating at most once a
  minute, so an API outage cannot slow the site down.

Design decisions worth recording:

- Components take content as props with the built-in copy as the
  default, so a missing key degrades to the shipped text rather than
  rendering blank. No component was redesigned.
- The site proxies /api to the backend, so the form posts same-origin
  with no CORS preflight and no API host in the markup.

Known issue, cosmetic: when the API is unreachable, Next logs its own
raw ECONNREFUSED stack trace for each request in addition to the one
clean warning the client emits. Behaviour is correct and pages still
return 200, but an outage produces noisy logs.

## Phase 6 — Documentation and handover

- [x] `README.md`: setup, scripts, ports, troubleshooting
- [x] `docs/api.md`, `docs/database.md`, `docs/admin-setup.md`,
      `docs/deployment.md`
- [x] Confirm `.env.example` covers every variable actually read
- [x] Final pass: install, migrate, seed, run, build, from scratch

**Phase 6 verified** by wiping `node_modules` and every build output,
then rebuilding the whole system from the repository.

- Clean install: 409 packages, zero vulnerabilities, no install-script
  prompts because the approvals persist in `package.json`.
- Database dropped and rebuilt from migrations alone, then reseeded to
  identical counts.
- All three applications build.
- All three run, and the public site renders live content from the
  rebuilt database.
- `.env.example` audited against every variable the code actually
  reads. It is a complete superset; nothing read is undeclared.

**One latent defect found and fixed, which only a clean install could
expose.** The Prisma schema had lost all 65 of its column `@map`
annotations at some point after phase 2, while the migration retained
snake_case columns. Everything kept working because the generated
client on disk still carried the mappings. Wiping `node_modules`
regenerated the client from the unmapped schema, and the seed failed
immediately with "column createdAt does not exist".

Re-applied the 65 mappings and confirmed with
`prisma migrate diff` that the schema and migrations now agree
exactly: "No difference detected". Had this shipped, the first
deployment to a fresh machine would have failed on startup.

---

## Known risks

| Risk | Handling |
|---|---|
| Project is not under version control | Snapshot taken before restructure. Recommend initialising a repository. |
| System Postgres on 5432 | Project container uses 5433 and its own credentials. |
| Content currently lives in `lib/content.js` | Seeded into the database, with the file kept as the offline fallback. |
| Media storage has no cloud credentials | Storage driver abstracted; local disk in development, S3-compatible in production. |

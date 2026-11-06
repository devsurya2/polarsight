# POLARSIGHT — Requirements

Status: living document. Phase 1 (monorepo restructure) is complete;
later phases are specified here before they are built.

---

## 1. Purpose

POLARSIGHT runs hands-on cybersecurity training inside colleges and
connects graduates to hiring teams. This repository holds three
applications that together let the business publish and manage that
offering without a developer in the loop:

1. a public marketing website,
2. a private admin portal for staff,
3. a REST API backing both.

## 2. Scope

### In scope
- Managing all public website copy from the admin portal.
- Programme records with publish and unpublish control.
- Contact enquiries: capture, triage, notes, export.
- Administrator accounts with role-based permissions.
- Media upload with metadata held in the database.
- Audit logging of administrative actions.

### Out of scope
- Any learning-management functionality: no lessons, no grading,
  no student accounts, no course delivery. The labs and ranges
  described on the website are a separate product and are not part
  of this repository.
- Payments and billing.
- Public user registration. The only accounts are staff accounts.

## 3. Constraints

| Constraint | Reason |
|---|---|
| The existing website must not be redesigned | It is signed off. Phase 1 moves it unchanged. |
| Website stays Next.js 16 + JavaScript | Already built this way; a TypeScript or Vite migration would be churn with no benefit. |
| Database runs in its own container | The machine has a system Postgres that must not be touched. |
| Media never stored in Postgres | Binary data in a relational database is slow to back up and serve. Metadata only. |
| No secrets in frontend code | Anything shipped to a browser is public. |

## 4. Applications

### 4.1 Public website — `apps/web`
Next.js 16, React 19, JavaScript, Tailwind 4, Framer Motion.
Serves the marketing site on port 3000.

Requirements:
- Reads published content from the API at build and request time.
- Never renders unpublished records.
- Degrades to its current static content if the API is unreachable,
  so a backend outage cannot take the marketing site down.
- Submits the contact form to the API.

### 4.2 Admin portal — `apps/admin`
React, TypeScript, Vite, Tailwind, React Router. Port 3001.

Requirements:
- Email and password sign-in, session held in an httpOnly cookie.
- Dashboard: enquiry count, programme counts, recent enquiries,
  content overview.
- Full create, read, update and delete for every content type, with
  no placeholder buttons and no dead screens.
- Role-aware interface: actions a role cannot perform are not shown,
  and are refused by the API regardless.

### 4.3 API — `apps/api`
Node, Express, TypeScript, Prisma, PostgreSQL. Port 5000.

Requirements:
- Modular: each domain owns its routes, service, and validators.
- Public read-only endpoints for published content, no auth.
- Authenticated endpoints for everything else.
- Zod validation on every request body, query and parameter.
- Centralised error handling; no stack traces in responses.
- Rate limiting, with a tighter limit on authentication routes.
- Audit log entry for every mutating administrative action.

## 5. Data model

| Model | Holds |
|---|---|
| `AdminUser` | Staff accounts, password hash, active flag |
| `Role` | Named role, e.g. Super Admin |
| `Permission` | Granular capability, e.g. `programme:write` |
| `Programme` | Training tracks, publish state |
| `WebsiteContent` | Keyed content blocks for the marketing pages |
| `Statistic` | Published figures |
| `Audience` | "Who we serve" entries |
| `CareerContent` | Careers and placement copy |
| `FAQ` | Questions and answers, ordered |
| `Enquiry` | Contact submissions, status, internal notes |
| `MediaAsset` | Uploaded file metadata and storage key |
| `AuditLog` | Who changed what, when |

Every table carries created and updated timestamps. Foreign keys are
constrained. Columns used for filtering and lookup are indexed.

## 6. Roles

| Role | May do |
|---|---|
| Super Admin | Everything, including managing administrators |
| Content Manager | Website content, programmes, FAQs, media |
| Enquiry Manager | Enquiries: read, status, notes, export |

Permissions are stored as rows, not hard-coded, so a role can be
adjusted without a deployment.

## 7. Security requirements

Non-negotiable, given the nature of the business:

- Passwords hashed with bcrypt at a sensible cost factor. Never
  logged, never returned by any endpoint.
- Short-lived access token, longer-lived refresh token, with refresh
  rotation and reuse detection.
- Cookies `httpOnly`, `sameSite`, and `secure` outside development.
- Every input validated before it reaches a service.
- Parameterised queries throughout, which Prisma gives by default.
- Uploads checked for declared type, real type and size, stored
  outside the web root, served with a non-executable content type.
- Login attempts rate limited per address and per account.
- Security headers via Helmet. CORS limited to an explicit allowlist.
- All secrets read from the environment. `.env` is git-ignored and
  `.env.example` carries placeholders only.

## 8. Non-functional

- Public pages must stay statically renderable where they are today.
- API responses for list endpoints paginated, default 20 per page.
- Migrations are checked in and run forward; the schema is never
  edited by hand in a live database.
- The system must run locally with `npm install`, `npm run db:up`,
  `npm run db:migrate`, `npm run dev`.

## 9. Acceptance

A phase is complete only when it builds, runs, and has been exercised
end to end. Specifically:

- Phase 1: the existing website builds and serves identically from
  its new location.
- Phase 2: migrations apply to a clean database and the seed runs.
- Phase 3: every endpoint returns correct data and rejects bad input
  and unauthorised callers.
- Phase 4: every admin screen performs real operations against the
  API, with no mock data left behind.
- Phase 5: the public site renders live content, and unpublished
  records are absent from its responses.

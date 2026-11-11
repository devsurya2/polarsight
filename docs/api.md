# POLARSIGHT API

Base URL in development: `http://localhost:5000`.
Every endpoint below is prefixed with `/api`, except `/health`.

177 routes across 16 modules. This reference is generated against the
server's real route table, so what is listed is what is served.

---

## Conventions

- Request and response bodies are JSON unless stated otherwise.
- Every request body, query string and route parameter is validated.
  Unknown keys are **rejected** rather than ignored, which is what
  stops mass assignment.
- List endpoints are paginated and return
  `{ items, pagination: { page, perPage, total, totalPages, hasNext, hasPrev } }`.
- Single records return `{ item }`.
- Errors return `{ error: { code, message, details? } }`.

| Status | Meaning |
|---|---|
| 400 | Validation failed; `details` names the offending fields |
| 401 | No session, session expired, or session revoked |
| 403 | Signed in, but missing the required permission |
| 404 | Not found, **or not published** — deliberately indistinguishable |
| 409 | Conflicts with an existing record |
| 429 | Rate limited |

### Common list parameters

| Parameter | Applies to | Notes |
|---|---|---|
| `page`, `perPage` | all lists | `perPage` capped at 100 |
| `search` | most lists | Case-insensitive, across that module's text columns |
| `status` | publishable resources | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` |
| `sort`, `dir` | most lists | Only whitelisted columns; anything else is a 400 |
| `from`, `to` | most lists | ISO dates, filtering on `createdAt` |

---

## Authentication

Sign-in sets two httpOnly cookies: a short-lived `ps_access` (15 min)
and a longer-lived `ps_refresh` (7 days) scoped to `/api/auth`. A
bearer token is also returned, for non-browser clients.

Three things make this hold up:

- **Refresh tokens rotate on every use.** Presenting one that has
  already been spent is treated as a leak: the whole token family is
  revoked and the session ends everywhere.
- **Only the SHA-256 digest of a refresh token is stored**, so a
  database leak cannot be replayed against the API.
- **Access tokens are checked against the account on every request.**
  They are stateless and short-lived, but an account that has been
  disabled, locked or had its sessions revoked is refused on its *next
  request* rather than when the token happens to expire.

Sign-in is rate limited per address **and** per account, and returns
the same error whether the account exists or the password is wrong, so
it cannot be used to enumerate addresses. Eight consecutive failures
lock an account for 15 minutes. Failed attempts are audited against
the address typed — never against an account, which would assert one
exists.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | none | Rate limited per address and per account |
| POST | `/auth/refresh` | refresh cookie | Rotates the token |
| POST | `/auth/logout` | optional | Revokes the whole token family |
| GET | `/auth/me` | session | Current user and permissions |
| POST | `/auth/change-password` | session | Ends **every** session, including the caller's |

---

## Public endpoints

Unauthenticated and read-only. Three rules hold everywhere under
`/api/public`:

1. Every query filters on `PUBLISHED`. **No endpoint accepts a status
   from the caller**, so a draft cannot be requested — it is
   indistinguishable from a record that does not exist.
2. Every response is built from an explicit `select`. Nothing is
   returned by spreading a row, so a column added later is not exposed
   by accident.
3. Internal fields — notes, assignees, applicant data, source IPs,
   verification notes, draft columns — are never selected.

Responses carry `Cache-Control: public, max-age=60, stale-while-revalidate=300`.

| Method | Path | Notes |
|---|---|---|
| GET | `/public/site` | Everything the website needs, in one round trip |

| GET | `/public/content` | Keyed content blocks (live values only) |
| GET | `/public/pages` | All published page documents |
| GET | `/public/pages/:key` | One published page |
| GET | `/public/pages/:key/preview` | Draft preview; **requires a signed token** |
| GET | `/public/programmes` | Published programme cards |
| GET | `/public/programmes/:slug` | Full detail, published curriculum modules only |
| GET | `/public/jobs` | Open positions; past their deadline counts as closed |
| GET | `/public/jobs/:slug` | One open position |
| GET | `/public/enquiries/subjects` | The contact form's category list |
| POST | `/public/enquiries` | Contact form. Honeypot + rate limited |
| POST | `/public/applications` | Trainer application. `multipart/form-data` |

### Draft preview

`POST /pages/:key/preview` (authenticated) returns a URL carrying an
HMAC over the page key and an expiry, valid for ten minutes. The public
preview route verifies it in constant time and returns `404` otherwise
— the same response an unpublished page gives to anyone else. Preview
responses are `no-store` and `X-Robots-Tag: noindex`.

`/public/site` carries exactly what the website reads: content blocks,
page documents, programme cards, open positions and public settings.
There is no public endpoint for anything the site does not render.

Image references inside a page document (`{ mediaId, alt }`) are
resolved to a URL before the document is served, so the website does
not have to fetch media separately.

### Public form submission

`POST /public/applications` takes `multipart/form-data`:

| Field | Required | Notes |
|---|---|---|
| `fullName`, `email`, `appliedPosition` | yes | |
| `jobOpeningId` | no | Must be a **published** opening, within its deadline |
| `phone`, `location`, `education`, `currentOrganisation` | no | |
| `experienceYears` | no | Integer |
| `experienceSummary`, `additionalInfo` | no | |
| `expertise`, `technicalSkills`, `certifications` | no | Comma or newline separated |
| `employmentPreference` | no | One of the `EmploymentType` values |
| `linkedinUrl`, `portfolioUrl` | no | `http(s)` only |
| `resume` | no | PDF or DOCX, ≤ 8 MB, validated on its bytes |
| `website` | — | Honeypot. A filled value is accepted and discarded |

The response reports `acknowledgementEmailSent` truthfully. When
outbound email is not configured it is `false`, and the website says so
rather than implying a confirmation was sent.

---

## Administrative endpoints

Every route below requires a session and a permission. The permission
is checked by the server on each request; the admin portal hides
screens as a convenience, not as a control.

### Dashboard

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard` | any read permission |

Returns only the cards the caller may see. A card they lack permission
for is **absent**, not zero — zero would be a claim. Accepts `days`,
`from` and `to` for the "in period" figures.

### Website pages (CMS)

Each page holds a `draft` and a `published` document in separate
columns, so serving a draft by accident is not possible.

| Method | Path | Permission |
|---|---|---|
| GET | `/pages` | `page:read` |
| GET | `/pages/:key` | `page:read` |
| PATCH | `/pages/:key` | `page:write` (title and SEO) |
| PUT | `/pages/:key/draft` | `page:write` |
| POST | `/pages/:key/publish` | `page:publish` |
| POST | `/pages/:key/unpublish` | `page:publish` |
| POST | `/pages/:key/preview` | `page:read` |
| GET | `/pages/:key/versions` | `page:read` |
| GET | `/pages/:key/versions/:version` | `page:read` |
| POST | `/pages/:key/restore` | `version:restore` |

Page keys: `home`, `about`, `outcomes`, `programmes`, `careers`,
`contact` — one per public route. Any other key is a 404, and a page
row whose key is not in that list is not listed as editable.

Each page's editable regions are fixed by a schema on the server, so a
draft cannot add or remove a region the page's component expects.
**The homepage schema covers only the sections below the first screen**
— the hero, navigation and video are not represented at all.

Every region corresponds to something a component renders, and every
editable thing a component renders has a region. A version saved
before a page's regions changed is marked `restorable: false` in the
history and refused by `/restore`, with an explanation rather than
validation errors.

### Content blocks

`value` is live; `draftValue` is the editor's work in progress and is
never served publicly.

| Method | Path | Permission |
|---|---|---|
| GET | `/content`, `/content/:id` | `content:read` |
| GET | `/content/grouped/all` | `content:read` |
| POST | `/content` | `content:write` |
| PATCH | `/content/:id` | `content:write` |
| PUT | `/content/:id/draft` | `content:write` |
| DELETE | `/content/:id/draft` | `content:write` |
| POST | `/content/:id/publish-draft` | `content:publish` |
| GET | `/content/:id/versions` | `content:read` |
| POST | `/content/:id/restore` | `version:restore` |
| DELETE | `/content/:id` | `content:write` |

Blocks marked `isLocked` — site navigation and footer link columns —
are refused for edit, draft and publish. Those are routing, not copy.

### Programmes and curriculum

| Method | Path | Permission |
|---|---|---|
| GET | `/programmes`, `/programmes/:id` | `programme:read` |
| POST | `/programmes` | `programme:write` |
| PATCH | `/programmes/:id` | `programme:write` |
| DELETE | `/programmes/:id` | `programme:delete` |
| POST | `/programmes/:id/publish` \| `/unpublish` \| `/archive` \| `/unarchive` | `programme:publish` |
| POST | `/programmes/:id/duplicate` | `programme:write` |
| POST | `/programmes/reorder` | `programme:write` |
| PUT | `/programmes/:id/gallery` | `programme:write` |
| GET | `/programmes/:id/versions` | `programme:read` |
| POST | `/programmes/:id/snapshot` | `programme:write` |
| POST | `/programmes/:id/restore` | `version:restore` |

Curriculum is addressed through its programme, and ownership is
re-checked on every call — a module cannot be moved between programmes
by editing a URL.

| Method | Path | Permission |
|---|---|---|
| GET | `/programmes/:programmeId/modules` | `programme:read` |
| POST | `/programmes/:programmeId/modules` | `programme:write` |
| PATCH/DELETE | `/programmes/:programmeId/modules/:moduleId` | `programme:write` |
| POST | `/programmes/:programmeId/modules/:moduleId/publish` \| `/unpublish` | `programme:publish` |
| POST | `/programmes/:programmeId/modules/reorder` | `programme:write` |
| POST | `/programmes/:programmeId/modules/:moduleId/topics` | `programme:write` |
| PATCH/DELETE | `…/topics/:topicId` | `programme:write` |
| POST | `…/topics/reorder` | `programme:write` |

A duplicated programme is always a `DRAFT` with a fresh slug and code.
A published programme cannot be deleted outright — unpublish or
archive it first.

### Recruitment

| Method | Path | Permission |
|---|---|---|
| GET | `/jobs`, `/jobs/:id` | `job:read` |
| POST/PATCH | `/jobs`, `/jobs/:id` | `job:write` |
| DELETE | `/jobs/:id` | `job:delete` |
| POST | `/jobs/:id/publish` \| `/unpublish` \| `/archive` \| `/unarchive` | `job:publish` |
| POST | `/jobs/reorder` | `job:write` |
| GET | `/applications` | `application:read` |
| GET | `/applications/stats` | `application:read` |
| GET | `/applications/:id` | `application:read` |
| GET | `/applications/:id/resume` | `application:read` — **audited** |
| GET | `/applications/export` | `application:export` |
| PATCH | `/applications/:id` | `application:write` |
| PATCH | `/applications/:id/status` | `application:write` |
| PATCH | `/applications/:id/assign` | `application:write` |
| POST | `/applications/:id/notes` | `application:write` |
| POST | `/applications/:id/archive` | `application:write` |
| DELETE | `/applications/:id` | `application:delete` |

Statuses: `NEW`, `UNDER_REVIEW`, `SHORTLISTED`, `INTERVIEW_SCHEDULED`,
`TECHNICAL_ASSESSMENT`, `DEMO_SESSION`, `SELECTED`, `REJECTED`,
`WITHDRAWN`. Every transition is recorded in `application_events`, in
the same transaction as the change.

`PATCH /applications/:id/status` accepts `notifyCandidate: true` and
returns a `notification` object stating exactly what happened:

```json
{ "notification": { "sent": false, "reason": "not_configured" } }
```

The status change still applies. **Nothing ever claims a message was
delivered when it was not.**

Resumes are stored as private media assets: excluded from the media
library, served only through the authenticated route above, and
deleted with their application.

### Enquiries

| Method | Path | Permission |
|---|---|---|
| GET | `/enquiries`, `/enquiries/:id` | `enquiry:read` |
| GET | `/enquiries/stats` | `enquiry:read` |
| GET | `/enquiries/:id/history` | `enquiry:read` |
| GET | `/enquiries/export` | `enquiry:export` (`?format=csv\|json`) |
| PATCH | `/enquiries/:id/status` | `enquiry:write` |
| PATCH | `/enquiries/:id/assign` | `enquiry:write` |
| PATCH | `/enquiries/:id/follow-up` | `enquiry:write` |
| POST | `/enquiries/:id/notes` | `enquiry:write` |
| POST | `/enquiries/:id/archive` | `enquiry:write` |
| DELETE | `/enquiries/:id` | `enquiry:delete` |

Statuses: `NEW`, `UNDER_REVIEW`, `CONTACTED`, `FOLLOW_UP_REQUIRED`,
`CONVERTED`, `CLOSED`, `SPAM`. (`IN_PROGRESS` is retained for rows
created before the workflow was expanded.)

Exports quote every cell and prefix any value beginning `=`, `+`, `-`
or `@` with an apostrophe, so a submitted field cannot run as a
spreadsheet formula on whoever opens the file. Internal notes are
excluded from exports.

### Media

| Method | Path | Permission |
|---|---|---|
| GET | `/media`, `/media/:id` | `media:read` |
| GET | `/media/stats` | `media:read` |
| GET | `/media/:id/usage` | `media:read` |
| POST | `/media` | `media:write` (up to 10 files) |
| PATCH | `/media/:id` | `media:write` |
| DELETE | `/media/:id` | `media:delete` |

Uploads are validated on their **actual bytes**, not the file name or
the declared type. An SVG containing script or external references is
rejected. Identical files are rejected as duplicates by checksum.

Deletion is refused while any **published** record uses the file.
`?force=true` allows deleting one used only by drafts.

Allowed: PNG, JPEG, WebP, AVIF, GIF, SVG (8 MB; SVG 2 MB), MP4, WebM
(64 MB), PDF, DOCX (16 MB).

### Administrators and roles

| Method | Path | Permission |
|---|---|---|
| GET | `/admin-users`, `/admin-users/:id` | `admin:read` |
| POST | `/admin-users` | `admin:write` |
| PATCH | `/admin-users/:id` | `admin:write` |
| POST | `/admin-users/:id/reset-password` | `admin:write` |
| POST | `/admin-users/:id/revoke-sessions` | `admin:write` |
| POST | `/admin-users/:id/unlock` | `admin:write` |
| DELETE | `/admin-users/:id` | `admin:delete` |
| GET | `/roles`, `/roles/permissions` | `role:read` |
| POST | `/roles` | `role:write` |
| PATCH | `/roles/:id` | `role:write` |
| PUT | `/roles/:id/permissions` | `role:write` |
| DELETE | `/roles/:id` | `role:write` |

Guards the server enforces:

- You cannot disable, delete or re-role **your own** account.
- You cannot assign a role holding permissions you do not hold, nor
  grant such a permission to a role. *You cannot delegate authority
  you do not have.*
- The last active Super Admin cannot be deleted, disabled or demoted.
- The Super Admin role always holds every permission and cannot be
  edited.
- A system role cannot be renamed or deleted; a role still held by
  somebody cannot be deleted.
- Disabling an account, changing its role, resetting its password or
  revoking its sessions ends its sessions **immediately**.

### Settings

| Method | Path | Permission |
|---|---|---|
| GET | `/settings` | `setting:read` |
| GET | `/settings/integrations` | `setting:read` |
| PATCH | `/settings/:key` | `setting:write` |
| PUT | `/settings` | `setting:write` (bulk, transactional) |

**No credential is ever stored or returned here.** SMTP passwords,
signing secrets and storage keys live in the server's environment. The
API refuses to write a setting whose key looks like a credential, and
`isLocked` settings are read-only.

`/settings/integrations` reports whether the database, media storage
and outbound email are configured and reachable — and nothing about
how they are configured beyond what is safe to show.

### Audit log

| Method | Path | Permission |
|---|---|---|
| GET | `/audit` | `audit:read` |
| GET | `/audit/:id` | `audit:read` |
| GET | `/audit/facets` | `audit:read` |
| GET | `/audit/export` | `audit:read` (capped at 5,000 rows) |

**Read-only by design.** There is no endpoint that creates, edits or
deletes an entry; entries are written as a side effect of the action
they record. Passwords, hashes and tokens are stripped before an entry
is written.

Recorded: sign-in, sign-out, failed sign-in, every create, update,
delete, publish, unpublish, archive and restore, status changes,
assignments, note additions, media uploads and deletions, resume
downloads, permission changes, setting changes, and every export —
including exporting the audit log itself.

---

## Cache invalidation

Publishing calls the website's `POST /api/revalidate` with a shared
`REVALIDATE_SECRET`, so a change appears immediately instead of waiting
out the site's one-minute window.

This is an optimisation, not a dependency: it is best-effort, never
blocks the publish, and the site regenerates on its own regardless.
Without the secret set, nothing is called and the site simply refreshes
within the minute.

---

## Rate limits

| Scope | Default | Environment variable |
|---|---|---|
| All `/api` | 300 / 15 min | `RATE_LIMIT_MAX` |
| Sign-in | 8 / 15 min, per address **and** account | `LOGIN_RATE_LIMIT_MAX` |
| Contact form | 10 / hour | `ENQUIRY_RATE_LIMIT_MAX` |
| Trainer applications | 5 / hour | `APPLICATION_RATE_LIMIT_MAX` |
| Media uploads | 40 / 15 min | `UPLOAD_RATE_LIMIT_MAX` |

Raise the limits locally when running the test suites repeatedly; a
full run makes several hundred requests.

---

## Testing

```bash
npm run test:api    # 216 checks against the running API and database
npm run test:e2e    # 47 checks: admin → API → database → website
```

Both run against real records over HTTP. Neither uses mocks or
fixtures standing in for data, and both are written to be re-runnable.

The end-to-end suite includes an alignment check: for every editable
page it loads the rendered public route and asserts that every heading
the portal can edit actually appears on it, and that every content
block reaches the site. That guards against the portal drifting away
from the website — a field that edits nothing, or page copy that
cannot be reached from the portal.

## Authentication additions (2026-11 hardening)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | With MFA enrolled, returns `{ mfaRequired, challenge }` and no cookie |
| POST | `/auth/mfa/verify` | `challenge` + TOTP or recovery code → session |
| POST | `/auth/reauth` | Password (+ code) → 10-minute elevation cookie for sensitive routes |
| POST | `/auth/mfa/setup` · `/confirm` · `/disable` · `/recovery-codes` | Enrolment lifecycle |
| POST | `/applications/:id/resume/rescan`, `/media/:id/rescan` | Re-run the malware scan |

The access token is no longer returned in any body, and permissions are
read from the role on every request. The complete inventory with
limits, permissions and re-authentication requirements is
docs/security/API_SECURITY_DOCUMENTATION.md.

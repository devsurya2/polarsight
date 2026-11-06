# POLARSIGHT API

Base URL in development: `http://localhost:5000`
All endpoints below are prefixed with `/api`.

---

## Conventions

- Request and response bodies are JSON unless stated otherwise.
- Every request body, query string and route parameter is validated.
  Unknown keys are rejected rather than ignored, which is what stops
  mass assignment.
- List endpoints are paginated and return
  `{ items, pagination: { page, perPage, total, totalPages, hasNext, hasPrev } }`.
- Errors return `{ error: { code, message, details? } }`.

| Status | Meaning |
|---|---|
| 400 | Validation failed; `details` names the offending fields |
| 401 | No session, or the session expired |
| 403 | Signed in, but missing the required permission |
| 404 | Not found, or not published (deliberately indistinguishable) |
| 409 | Conflicts with an existing record |
| 429 | Rate limited |

## Authentication

Sign-in sets two httpOnly cookies: a short-lived `ps_access` and a
longer-lived `ps_refresh` scoped to `/api/auth`. A bearer token is
also returned for non-browser clients.

Refresh tokens rotate on every use. Presenting one that has already
been spent is treated as a leak: the whole token family is revoked and
the session ends everywhere.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | none | Rate limited per address and per account |
| POST | `/auth/refresh` | refresh cookie | Rotates the token |
| POST | `/auth/logout` | refresh cookie | Revokes the family |
| GET | `/auth/me` | session | Current user and permissions |
| POST | `/auth/change-password` | session | Ends all other sessions |

## Public endpoints

No authentication. These only ever return records with status
`PUBLISHED`; they accept no status filter, so a draft cannot be
requested.

| Method | Path | Returns |
|---|---|---|
| GET | `/public/site` | Everything the homepage needs, in one call |
| GET | `/public/content` | Keyed map of content blocks |
| GET | `/public/programmes` | Published programmes |
| GET | `/public/programmes/:slug` | One programme, 404 if unpublished |
| GET | `/public/statistics` | Published statistics |
| GET | `/public/audiences` | Published audience entries |
| GET | `/public/career` | Published career content |
| GET | `/public/faqs` | Published FAQs |
| POST | `/public/enquiries` | Contact form. Rate limited, honeypot protected |

The contact form accepts an optional `website` field. It is a
honeypot: if filled in, the request is accepted with 202 and nothing
is stored, so an automated submitter cannot tell it was caught.

## Administrative endpoints

All require a session, plus the permission shown.

### Dashboard
| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard` | any of `enquiry:read`, `content:read`, `programme:read` |

### Content resources

These share the same shape: `programmes`, `content`, `statistics`,
`audiences`, `career`, `faqs`.

| Method | Path | Permission |
|---|---|---|
| GET | `/{resource}` | `{resource}:read` |
| GET | `/{resource}/:id` | `{resource}:read` |
| POST | `/{resource}` | `{resource}:write` |
| PATCH | `/{resource}/:id` | `{resource}:write` |
| DELETE | `/{resource}/:id` | `{resource}:delete` or `:write` |
| POST | `/{resource}/:id/publish` | `{resource}:publish` or `:write` |
| POST | `/{resource}/:id/unpublish` | as above |

List queries accept `page`, `perPage`, `search` and `status`.
New records are created as `DRAFT`, so nothing reaches the public site
until someone publishes it deliberately.

### Enquiries
| Method | Path | Permission |
|---|---|---|
| GET | `/enquiries` | `enquiry:read` |
| GET | `/enquiries/export` | `enquiry:export` |
| GET | `/enquiries/:id` | `enquiry:read` |
| PATCH | `/enquiries/:id/status` | `enquiry:write` |
| POST | `/enquiries/:id/notes` | `enquiry:write` |
| DELETE | `/enquiries/:id` | `enquiry:write` |

Filters: `search`, `status`, `from`, `to`. Export supports `csv` and
`json`. CSV cells beginning `=`, `+`, `-` or `@` are prefixed with an
apostrophe so a spreadsheet cannot execute them as formulas.

### Media
| Method | Path | Permission |
|---|---|---|
| GET | `/media` | `media:read` |
| POST | `/media` | `media:write` |
| PATCH | `/media/:id` | `media:write` |
| DELETE | `/media/:id` | `media:delete` |

Uploads are multipart with a single `file` field, 8 MB maximum. The
file's real bytes are sniffed and must match the declared type. SVGs
containing script are refused. Deleting an asset still referenced by a
record returns 409. Binary data is never stored in Postgres, only the
metadata and a storage key.

### Administrators and roles
| Method | Path | Permission |
|---|---|---|
| GET | `/admin-users` | `admin:read` |
| POST | `/admin-users` | `admin:write` |
| PATCH | `/admin-users/:id` | `admin:write` |
| POST | `/admin-users/:id/reset-password` | `admin:write` |
| DELETE | `/admin-users/:id` | `admin:delete` |
| GET | `/roles` | `role:read` |
| GET | `/roles/permissions` | `role:read` |
| PUT | `/roles/:id/permissions` | `role:write` |

Guardrails: you cannot disable, demote or delete your own account, and
the last active Super Admin cannot be removed. Disabling an account or
resetting its password revokes its sessions immediately.

### Audit
| Method | Path | Permission |
|---|---|---|
| GET | `/audit` | `audit:read` |

Read-only by design: there is no endpoint that edits or deletes an
entry. Every mutating administrative action writes one, with before
and after snapshots. Credential fields are stripped before writing.

## Rate limits

| Scope | Window | Limit |
|---|---|---|
| Whole API | 15 min | 300 |
| Sign-in | 15 min | 8 per address and account |
| Contact form | 1 hour | 10 |
| Uploads | 15 min | 40 |

## Roles as seeded

| Role | Permissions |
|---|---|
| Super Admin | All 26 |
| Content Manager | Content, programmes, statistics, audiences, career, FAQs, media, plus read on enquiries |
| Enquiry Manager | Enquiries read, write and export, plus read on content and programmes |

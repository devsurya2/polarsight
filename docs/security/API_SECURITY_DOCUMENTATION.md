# API security documentation

Every endpoint of the POLARSIGHT API, its authentication requirement,
the permission it enforces, its rate limit and validation. This is the
inventory the audit worked from; keep it current when a route changes.

Base path: `/api`. Every route is validated with a Zod schema that
**strips or refuses unknown keys** (`.strict()` on every body), so mass
assignment is not possible on any write. Every list endpoint caps
`perPage` at 100 and only sorts by an allowlisted column. Every query
goes through Prisma's query builder; the only raw SQL in the codebase
is `SELECT 1` for health checks.

Legend — Auth: `—` none · `session` httpOnly cookie or bearer token ·
`+reauth` additionally needs a re-authentication within 10 minutes
(`ps_elevated` cookie from `POST /auth/reauth`). Limit: requests per
window per address unless stated.

## Trust boundaries

```
 Internet ──▶ Public website (Next.js) ──▶ /api/public/*  (read-only, published only)
          ──▶ Contact form              ──▶ POST /api/public/enquiries
          ──▶ Careers form (+ resume)   ──▶ POST /api/public/applications ──▶ quarantine ──▶ clamd ──▶ private store
 Admins   ──▶ Admin portal (Vite SPA)   ──▶ /api/*  (cookie session, CSRF-guarded, permission-checked)
 API      ──▶ PostgreSQL (DML-only role in production)
          ──▶ clamd (TCP, loopback/private network only)
          ──▶ SMTP (optional)
          ──▶ Website /api/revalidate (shared secret)
```

Personal data flow: a visitor's enquiry or application is written once
by the public form handler and read only by authenticated
administrators holding `enquiry:read` / `application:read`. A resume
never leaves the private tier: it is downloadable only through
`GET /applications/:id/resume` (session + permission + re-auth + CLEAN
scan verdict), never from a URL.

## Public — no session

| Method | Route | Limit | Input | Notes |
|---|---|---|---|---|
| GET | `/public/site` | 300/15m | — | Everything the site renders. Explicit `select` everywhere; `draft`, notes, IPs never selected |
| GET | `/public/content` | 300/15m | — | Live `value` only |
| GET | `/public/pages`, `/public/pages/:key` | 300/15m | key ∈ fixed list | Published document only |
| GET | `/public/pages/:key/preview` | 300/15m | `token`, `expires` | HMAC, constant-time, 10 min; `no-store`, `noindex`; 404 on any failure |
| GET | `/public/programmes`, `/:slug` | 300/15m | slug | Published only; a draft is a 404 |
| GET | `/public/jobs`, `/:slug` | 300/15m | slug | Published and not past deadline |
| GET | `/public/enquiries/subjects` | 300/15m | — | Static list |
| POST | `/public/enquiries` | **10/h** (`ENQUIRY_RATE_LIMIT_MAX`) | name (single line ≤120), email, message ≤5000, optional fields; honeypot `website` | Markup/script refused; duplicate within 5 min collapsed; acknowledgement email reported honestly |
| POST | `/public/applications` | **5/h** (`APPLICATION_RATE_LIMIT_MAX`) | multipart; names single-line; `resume` = **one PDF ≤ `RESUME_MAX_BYTES` (5 MB)** | See FILE_UPLOAD_SECURITY.md. Ceiling enforced by the parser (413) before the body is read in full |

Responses from this group are cacheable for 60 s on GET only; the
form endpoints send `Cache-Control: no-store`.

## Authentication — `/auth`

| Method | Route | Auth | Limit | Input | Notes |
|---|---|---|---|---|---|
| POST | `/auth/login` | — | 8 per address+account, **30 per address** (failed attempts only) | email, password | One message for every failure. 8 failures lock the account 15 min. With MFA on, returns `{ mfaRequired, challenge }` and **no cookie** |
| POST | `/auth/mfa/verify` | — | 30 per address | challenge (5-min JWT), code | TOTP ±1 step, or one recovery code (single use). Wrong code counts toward lockout |
| POST | `/auth/refresh` | refresh cookie | 300/15m | — | Rotates; reuse of a spent token revokes the whole family |
| POST | `/auth/logout` | optional | 300/15m | — | Revokes the session family; the access token is dead on the next request |
| GET | `/auth/me` | session | | — | Includes `mfaEnabled`, `mfaSetupRequired`, `recoveryCodesLeft` |
| POST | `/auth/reauth` | session | 30 per address | password, code? | Sets `ps_elevated` (10 min, bound to the session family) |
| POST | `/auth/change-password` | session | | currentPassword, newPassword ≥12 | Ends every session incl. this one |
| POST | `/auth/mfa/setup` | session | | — | Returns the secret once (base32 + otpauth URI) |
| POST | `/auth/mfa/confirm` | session | | code | Enables; returns 8 recovery codes once |
| POST | `/auth/mfa/disable` | session | | password, code | Refused for roles in `MFA_REQUIRED_ROLES` |
| POST | `/auth/mfa/recovery-codes` | session | | code | Regenerates; old codes die |

The access token (JWT, 15 min) carries `sub`, `email`, `role`, `sid`
(session family) and `scope`. **It does not carry permissions**: the
middleware loads them from the role on every request, and checks that
the family `sid` still has a live refresh token and that the token was
issued after `sessions_valid_from`. A `scope: "mfa_setup"` token can
reach only `/auth/*`.

All `/auth` responses are `Cache-Control: no-store`.

## Administrative — every route requires a session

Mutating requests with a session cookie must carry a trusted `Origin`
(or `Sec-Fetch-Site`/`Referer`); otherwise 403 (CSRF guard).

### Dashboard
| GET | `/dashboard` | any of the read permissions | Only the cards the caller may see are computed |

### Website pages — `page:*`
| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/pages`, `/pages/:key` | `page:read` | |
| PUT | `/pages/:key/draft` | `page:write` | Validated against the page's schema; every string screened; ≤256 KB, depth ≤20 |
| PATCH | `/pages/:key` | `page:write` | SEO image must be a scanned library asset |
| POST | `/pages/:key/publish`, `/unpublish` | `page:publish` | Re-validated at publish; snapshot written |
| POST | `/pages/:key/preview` | `page:read` | Signed 10-min link |
| GET | `/pages/:key/versions`, `/:version` | `page:read` | |
| POST | `/pages/:key/restore` | `version:restore` | Into the draft only |

### Content blocks — `content:*`
Generic CRUD (`/content`), plus `/:id/draft` (PUT/DELETE), `/:id/publish-draft`, `/:id/versions`, `/:id/restore`, `/grouped/all`. Locked structural blocks refuse edits.

### Programmes — `programme:*`
Generic CRUD (`/programmes`), `/reorder`, `/:id/publish|unpublish|archive|unarchive`, `/:id/duplicate`, `/:id/gallery` (scanned images only), `/:id/versions`, `/:id/snapshot`, `/:id/restore`, and the curriculum sub-router `/:programmeId/modules/...` (ownership re-checked on every call).

### Media — `media:*`
| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/media`, `/media/stats`, `/media/:id`, `/media/:id/usage` | `media:read` | Private assets never listed |
| POST | `/media` | `media:write` · 40/15m | ≤10 files, 64 MB cap, magic bytes, SVG screened, PDF inspected, docx structurally checked; **quarantined, scanned, released only when CLEAN** |
| PATCH | `/media/:id` | `media:write` | alt/title/description only |
| POST | `/media/:id/rescan` | `media:write` | Re-runs the scanner |
| DELETE | `/media/:id` | `media:delete` **+reauth** | Refused while a published record uses it |

### Recruitment — `job:*`, `application:*`
Jobs: generic CRUD on `/jobs` with publish/reorder.

| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/applications`, `/stats`, `/:id` | `application:read` | Source IP / user agent never returned |
| GET | `/applications/export` | `application:export` **+reauth** | Notes excluded; CSV formula-neutralised; audited |
| GET | `/applications/:id/resume` | `application:read` **+reauth** | **Only if `scanStatus = CLEAN`**; `attachment`, `nosniff`, sandbox CSP, `no-store`; audited |
| POST | `/applications/:id/resume/rescan` | `application:write` | |
| PATCH | `/applications/:id`, `/:id/status`, `/:id/assign` | `application:write` | Status transitions validated; history written in the same transaction |
| POST | `/applications/:id/notes`, `/:id/archive` | `application:write` | |
| DELETE | `/applications/:id` | `application:delete` | Removes the resume object too |

### Enquiries — `enquiry:*`
Same shape as applications. `GET /enquiries/export` needs `enquiry:export` **+reauth**; `DELETE` needs `enquiry:delete`.

### Administrators — `admin:*` — every mutation **+reauth**
| Method | Route | Permission | Guards |
|---|---|---|---|
| GET | `/admin-users`, `/:id` | `admin:read` | Hash never selected; sessions listed without tokens |
| POST | `/admin-users` | `admin:write` | Cannot grant a role holding permissions you lack |
| PATCH | `/admin-users/:id` | `admin:write` | Not your own role/active flag; not an account more privileged than you; last Super Admin protected; sessions revoked on role change or disable |
| POST | `/admin-users/:id/reset-password` | `admin:write` | Not yourself; **not an account more privileged than you**; sessions revoked |
| POST | `/admin-users/:id/revoke-sessions` | `admin:write` | Not an account more privileged than you |
| POST | `/admin-users/:id/unlock` | `admin:write` | |
| DELETE | `/admin-users/:id` | `admin:delete` | Not yourself; not more privileged; last Super Admin protected |

### Roles — `role:*` — every mutation **+reauth**
`GET /roles`, `GET /roles/permissions`, `POST /roles`, `PATCH /roles/:id`, `PUT /roles/:id/permissions`, `DELETE /roles/:id`. You cannot grant a permission you do not hold; the Super Admin role cannot be edited or deleted; a role in use cannot be deleted. Changes apply to live sessions immediately.

### Settings — `setting:*`
`GET /settings`, `GET /settings/integrations` (health only, no secrets), `PATCH /settings/:key` **+reauth**, `PUT /settings` **+reauth**. Keys matching a credential pattern are refused outright.

### Audit — `audit:read`
`GET /audit`, `/audit/facets`, `/audit/:id`, `GET /audit/export` **+reauth** (bounded to 5 000 rows). **No endpoint writes to this table.**

## Error contract

`{ "error": { "code", "message", "details"? } }`. 400 validation (field
list), 401 no/invalid session, 403 permission / CSRF / `REAUTH_REQUIRED`,
404 (also for anything unpublished), 409 conflict (incl. unscanned
resume), 413 oversized upload, 429 throttled. Unknown failures are a
500 with a fixed message; the `debug` field exists only outside
production. Prisma errors are mapped, never passed through.

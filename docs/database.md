# POLARSIGHT database

PostgreSQL 17, accessed through Prisma. 21 tables.

The schema lives in `apps/api/prisma/schema.prisma` and is the single
source of truth — the SQL migrations are generated from it.

---

## Conventions

- Every table carries `created_at` and `updated_at`.
- Anything filtered, sorted or looked up is indexed.
- Deletes that would orphan rows are **restricted**, not cascaded,
  except where the child has no meaning without its parent (a topic
  without its module, a note without its application).
- Media binaries are never stored in Postgres. Only metadata and a
  `storage_key` pointing at the object store.
- Editable content keeps its live value and its working draft in
  **separate columns**, so serving a draft by accident is not possible.
- Columns are `snake_case` in the database and `camelCase` in Prisma.

---

## Running migrations

```bash
npm run db:up        # start Postgres (docker compose, port 5433)
npm run db:migrate   # apply migrations in development
npm run db:seed      # idempotent seed
npm run db:studio    # browse the data
```

In production use `npm run db:deploy --workspace @polarsight/api`,
which applies migrations without generating new ones.

### Migration history

| Migration | What it did |
|---|---|
| `20261106161604_init` | Initial schema |
| `20261109203132_enquiry_designation_programme` | Added `designation` and `programme` to enquiries |
| `20261110030941_cms_recruitment_settings_versioning` | CMS pages, versioning, curriculum, recruitment, settings |
| `20261110033343_session_invalidation` | `admin_users.sessions_valid_from` |
| `20261110150940_drop_unrendered_content_tables` | Dropped `audiences`, `faqs`, `career_content`, `statistics` |
| `20261111…_security_scan_pipeline_and_mfa` | `media_assets.scan_*` + `ScanStatus` enum; `admin_users.mfa_*`; marks pre-existing media `SCAN_SKIPPED` (additive) |

Every migration up to `session_invalidation` is **additive**: new
tables, new columns and new enum values only.

The last one is the exception and the only destructive migration in
the project. Those four tables backed sections the site no longer has:
no component read them, no screen in the portal edited them, and they
had been emptied first, so the `DROP` destroyed nothing. Every table
holding real work — enquiries, applications, programmes, pages,
content, media, audit — is untouched.

---

## Access control

### `admin_users` (12 columns)

| Column | Notes |
|---|---|
| `password_hash` | bcrypt, cost 12. Never selected by any API response |
| `is_active` | A disabled account is refused at sign-in **and** on its next request |
| `failed_login_count`, `locked_until` | 8 failures locks for 15 minutes |
| `sessions_valid_from` | Any access token issued before this instant is rejected |
| `role_id` | `onDelete: Restrict` — a role in use cannot be deleted |

`sessions_valid_from` is what makes revocation immediate. Access
tokens are stateless, so without it, disabling an account or revoking
its sessions would leave the token in the browser working until it
expired — up to 15 minutes of access after the decision to remove it.

### `roles`, `permissions`, `role_permissions`

34 permissions in 10 groups, granted to roles, roles granted to
administrators. `is_system` marks a role that cannot be renamed or
deleted.

Every permission is enforced by at least one route. The seed prunes
any permission it no longer lists, so the Roles screen cannot offer a
grant that changes nothing.

Five seeded roles: **Super Admin** (all 34), **Administrator**,
**Content Manager**, **Recruitment Manager**, **Enquiry Manager**.

### `refresh_tokens` (10 columns)

Only `token_hash` (SHA-256) is stored, so a database leak cannot be
replayed. `family_id` groups the rotations of one session: presenting
a token that has already been used revokes the entire family, because
it means the token leaked.

---

## Website content

### `site_pages` (12 columns)

One row per public page. `draft` and `published` are separate JSONB
columns; the public API reads `published` and never selects `draft`.

Keys: `home`, `about`, `outcomes`, `programmes`, `careers`, `contact`
— one per public route.

Each page's editable regions are constrained by a Zod schema on the
server (`apps/api/src/modules/pages/schema.ts`), so a draft cannot add
or remove a region the page's component expects. **The homepage schema
covers only the sections below the first screen** — hero, navigation
and video have no representation in the database at all.

> JSONB does not preserve key insertion order, so each region carries
> its own `order` field. The admin editor sorts by it; without that,
> regions would render in Postgres's internal key order.

### `website_content` (13 columns)

Keyed blocks of copy: the hero's words, the footer blurb and the brand
details. Only blocks the website actually reads exist — the seed
removes any other, so the portal never offers a field that changes
nothing.

A block whose stored value no longer matches the shape the site
expects (a serialised object where plain text is now read, for
instance) is repaired by the seed, because leaving it renders raw JSON
on the page.

| Column | Notes |
|---|---|
| `value` | The live value. The only column the public API reads |
| `draft_value` | Work in progress. Never served publicly |
| `is_locked` | Structural blocks (navigation, footer link columns) refuse edits |
| `type` | `TEXT` \| `RICH_TEXT` \| `JSON` |

### `content_versions` (8 columns)

Immutable snapshots, written on every publish. `@@unique([entity, entityId, version])`
allocates the version number inside a transaction, so two concurrent
publishes cannot collide.

Restoring copies a snapshot into the record's **draft**, never
straight to the live value — so a rollback is itself reviewable, and
an accidental restore cannot change the public site on its own.

### `programmes` (28 columns)

Beyond the card fields, each programme holds nine string arrays:
`objectives`, `target_audience`, `eligibility`, `prerequisites`,
`tools`, `exercises`, `projects`, `learning_outcomes`,
`career_pathways`.

Arrays of plain strings rather than free HTML, deliberately: an editor
cannot introduce markup into a public page.

`status` is `DRAFT` | `PUBLISHED` | `ARCHIVED`, with `published_at` and
`archived_at`.

### `curriculum_modules`, `curriculum_topics`

Modules belong to a programme, topics to a module, both cascading. A
module has its own `status`, so an unfinished module is absent from the
public curriculum rather than showing as a gap.

### `programme_images`

Join table carrying `sort_order`, so one asset can be reused across
programmes with a different position in each.

---

## Recruitment

### `job_openings` (24 columns)

`employment_type` is one of `FULL_TIME`, `PART_TIME`, `CONTRACT`,
`GUEST_TRAINER`, `INDUSTRY_EXPERT`. `work_mode` is `ON_CAMPUS`,
`REMOTE` or `HYBRID`.

Experience is a `experience_min_years` plus a free-text
`experience_note`, so the site never implies a range nobody agreed.
There is no salary column, deliberately.

An opening past its `application_deadline` is treated as closed by the
public API, in addition to its status.

### `trainer_applications` (27 columns)

| Column | Notes |
|---|---|
| `job_opening_id` | `onDelete: SetNull` |
| `applied_position` | Snapshotted text, so the record still reads correctly if the opening is renamed or removed |
| `resume_id` | A **private** `media_assets` row |
| `source_ip`, `user_agent` | Abuse investigation only; never in the reviewer's view |

### `application_notes`, `application_events`

Notes carry a `kind`: `NOTE`, `INTERVIEW_FEEDBACK`, `DEMO_FEEDBACK`.
Events are the append-only status history, written in the same
transaction as the status change — a pipeline with gaps in its history
is not auditable.

**Nothing in either table is exposed by any public endpoint.**

---

## Enquiries

### `enquiries` (17 columns)

Statuses: `NEW`, `IN_PROGRESS` (legacy), `UNDER_REVIEW`, `CONTACTED`,
`FOLLOW_UP_REQUIRED`, `CONVERTED`, `CLOSED`, `SPAM`.

`assigned_to_id`, `follow_up_at` and `archived_at` drive the working
queue. Resolving an enquiry clears its pending follow-up.

`IN_PROGRESS` is retained rather than migrated away because existing
rows use it; `UNDER_REVIEW` supersedes it for new transitions.

---

## Settings and media

### `site_settings` (12 columns)

Operational configuration: company name, SEO defaults, contact details,
social URLs, copyright.

**Credentials do not belong here.** The API refuses to write a setting
whose key matches a credential pattern, and never returns a value
marked `is_secret`. `is_locked` marks a setting that is configured on
the server and shown read-only.

### `media_assets` (17 columns)

| Column | Notes |
|---|---|
| `storage_key` | Points at the object in whichever driver is configured |
| `checksum` | SHA-256. Duplicate uploads are rejected on it |
| `is_private` | Applicant resumes. Excluded from the library listing entirely |

Deletion is refused while a **published** record references the asset.

---

## Audit

### `audit_logs` (11 columns)

| Column | Notes |
|---|---|
| `before`, `after` | JSONB snapshots, scrubbed of passwords, hashes and tokens |
| `actor_id` | Null for an action with no session |
| `actor_label` | The address typed at a failed sign-in, or `"public form"` |
| `ip`, `user_agent` | Recorded where appropriate |

**No API route creates, updates or deletes a row in this table.**
Entries are written as a side effect of the action being audited, and
the write deliberately never throws — an audit failure must not roll
back the action the administrator asked for, but it is logged loudly.

---

## Seeding

`apps/api/prisma/seed.ts` is idempotent and safe to re-run.

- Everything upserts on a natural key.
- Values an administrator can edit are written **on create only**, so
  re-seeding never clobbers work done in the portal.
- The first administrator's password is set on create only — a re-seed
  does not reset a password that has since been changed.
- Website copy is imported from the site's own content modules, so the
  database starts out matching exactly what is on the page.
- Content already public is seeded `PUBLISHED`. Anything not currently
  on the site, or not yet verified, is seeded `DRAFT`.

Requires `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (≥ 12 chars).

---

## Backups

The data worth protecting is enquiries, trainer applications and
published content. Resumes live in object storage, not in Postgres, so
a database backup alone is not a complete backup.

```bash
# Database
docker exec polarsight-postgres pg_dump -U polarsight polarsight \
  | gzip > polarsight-$(date +%F).sql.gz

# Restore
gunzip -c polarsight-2026-11-10.sql.gz \
  | docker exec -i polarsight-postgres psql -U polarsight -d polarsight
```

Back up the object store on the same schedule.

# Database

PostgreSQL 17, run in a container dedicated to this project, accessed
through Prisma.

---

## Why a container

The host may already run PostgreSQL on 5432. This project must not
touch it, so `docker-compose.yml` starts its own instance with its own
credentials, its own named volume and a different host port.

| | Project database | System install |
|---|---|---|
| Port | 5433 | 5432 |
| Credentials | From `.env` | Untouched |
| Data | `polarsight-pgdata` volume | Untouched |

```bash
npm run db:up      # start
npm run db:logs    # follow logs
npm run db:down    # stop (data survives in the volume)
```

To wipe the data entirely, remove the volume:

```bash
docker compose down
docker volume rm polarsight-pgdata
```

## Migrations

The schema lives in `apps/api/prisma/schema.prisma`. It is the single
source of truth; the database is never edited by hand.

```bash
npm run db:migrate    # create and apply a migration in development
npm run db:seed       # roles, permissions, first admin, website copy
npm run db:reset      # drop, re-migrate, re-seed. Destroys all data
npm run db:studio     # browse the data in a browser
```

In production, apply existing migrations without generating new ones:

```bash
npm run db:deploy --workspace @polarsight/api
```

## Conventions

- Tables and columns are `snake_case`; the Prisma models are
  `camelCase` and mapped with `@@map` and `@map`.
- Every table carries `created_at` and `updated_at`.
- Anything filtered, sorted or looked up is indexed.
- Foreign keys restrict deletes that would orphan rows. Children with
  no meaning without their parent cascade instead, for example an
  enquiry note when its enquiry is deleted.
- Publishable records carry a `PublishStatus` of `DRAFT` or
  `PUBLISHED` and default to `DRAFT`, so nothing reaches the public
  site unless somebody publishes it deliberately.

## Models

| Model | Table | Purpose |
|---|---|---|
| `AdminUser` | `admin_users` | Staff accounts, password hash, lockout state |
| `Role` | `roles` | Named role |
| `Permission` | `permissions` | One capability, e.g. `programme:write` |
| `RolePermission` | `role_permissions` | Join between the two |
| `RefreshToken` | `refresh_tokens` | Hashed refresh tokens with family tracking |
| `Programme` | `programmes` | Training tracks |
| `WebsiteContent` | `website_content` | Keyed blocks of marketing copy |
| `Statistic` | `statistics` | Published figures |
| `Audience` | `audiences` | "Who we serve" entries |
| `CareerContent` | `career_content` | Careers and placement copy |
| `FAQ` | `faqs` | Questions and answers |
| `Enquiry` | `enquiries` | Contact submissions |
| `EnquiryNote` | `enquiry_notes` | Internal notes on an enquiry |
| `MediaAsset` | `media_assets` | Uploaded file metadata |
| `AuditLog` | `audit_logs` | Who changed what, when |

Three models are not in the original brief but are needed to meet it:
`RolePermission` for the many-to-many, `RefreshToken` for rotation and
reuse detection, and `EnquiryNote` for the internal notes requirement.

## Media is not stored here

`MediaAsset` holds metadata only: filename, type, size, checksum and a
storage key. The bytes live in object storage. Binary data in a
relational database is slow to back up and slow to serve.

## Passwords and tokens

- Passwords are bcrypt hashes at cost 12. The plaintext is never
  stored, logged or returned by any endpoint.
- Refresh tokens are stored as SHA-256 digests, so a database leak
  cannot be replayed against the API.

## Seeding

`apps/api/prisma/seed.ts` is idempotent: everything upserts on a
natural key, so running it twice changes nothing.

It creates 26 permissions, three roles, the first Super Admin from
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, and migrates the
website copy out of `apps/web/lib/content.js` into the database.

Statistics and audiences are seeded as `DRAFT` on purpose. The figures
in the original content file are marked illustrative, and must not
reach the public site until somebody replaces them with real,
evidenced numbers.

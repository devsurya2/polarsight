# Admin portal setup

How to get into the portal, what each role can do, and how to add
colleagues.

---

## First sign-in

The seed creates one Super Admin from `.env`:

```
SEED_ADMIN_EMAIL=admin@polarsight.in
SEED_ADMIN_PASSWORD=<generated during setup>
```

Open http://localhost:3001 and sign in with those.

**Change that password immediately.** Go to Account, then Change
password. Doing so signs you out of every device, which is deliberate.

The seeded password is in your local `.env`, which is git-ignored.
It is a development credential and must never be reused anywhere.

## Roles

Three roles ship with the system. Permissions are rows in the
database, not hard-coded, so a role can be adjusted without a
deployment.

| Role | Can do |
|---|---|
| Super Admin | Everything, including managing administrators and roles |
| Content Manager | Website content, programmes, FAQs, statistics, audiences, careers and media. Read-only on enquiries |
| Enquiry Manager | Enquiries: read, update status, add notes, export. Read-only on content and programmes |

The Super Admin role always holds every permission and cannot be
edited. That is a guardrail: stripping it would be a reliable way to
lock everybody out.

## Adding an administrator

1. Administrators, then New administrator.
2. Give a name, email, temporary password and role.
3. Pass the password to them out of band, and ask them to change it
   on first sign-in.

Passwords must be at least 12 characters with upper case, lower case
and a digit. The API enforces this, not just the form.

## Changing what a role can do

Roles, pick a role, tick or untick permissions, Save changes.

A change takes effect for a signed-in user within one token refresh
cycle, because permissions travel in the short-lived access token.

## Guardrails

The API refuses these regardless of what the interface shows:

- You cannot disable your own account.
- You cannot change your own role.
- You cannot delete your own account.
- The last active Super Admin cannot be removed.
- Disabling an account, resetting its password or changing your own
  password revokes the affected sessions immediately.

## Publishing

Everything you create starts as a **draft**. Drafts are invisible to
the public website: they are absent from list endpoints, and a direct
link to a draft returns a 404 indistinguishable from a missing page.

Publish deliberately, from the row's Publish button.

Statistics and audiences are currently all drafts. The figures that
came across from the old site are marked illustrative. Replace them
with evidenced numbers before publishing anything.

## Media

Upload from the Media screen. PNG, JPEG, WebP, AVIF, SVG and PDF up
to 8 MB.

The API checks the file's actual bytes, not its name or its declared
type, so a renamed executable is refused. SVGs containing script are
also refused. Deleting a file still used by a programme or audience
is refused rather than silently breaking the page.

Give images an alt description. It is read aloud by screen readers.

## Audit log

Every administrative change is recorded with who made it, when, from
what address, and snapshots either side of the change. Credential
fields are stripped before writing.

The log is read-only over the API by design: there is no endpoint
that edits or deletes an entry.

## If you are locked out

Sign-in is rate limited per address and per account, and an account
locks for 15 minutes after 8 failed attempts. Wait it out, or ask
another Super Admin to reset your password.

If every Super Admin is locked out, reseed from the command line:

```bash
npm run db:seed
```

The seed upserts, so it restores the Super Admin from `.env` without
touching your content.

# Running the admin portal

The portal at `http://localhost:3001` is the control panel for the
public website: content, programmes, recruitment, enquiries, media,
administrators and settings.

---

## Starting up

```bash
npm install
cp .env.example .env     # then fill it in — see docs/environment.md
npm run db:up            # Postgres on :5433
npm run db:migrate
npm run db:seed
npm run dev              # website :3000, admin :3001, API :5000
```

Sign in at `http://localhost:3001` with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD`. **Change that password immediately** under Your
account — doing so ends every session, including the one you are using,
so you will be asked to sign in again.

---

## Roles

Permissions are granted to roles, roles to administrators, and the
**server** checks them on every request. The portal hides screens a
role cannot use, but that is a convenience: the API refuses the
underlying call whether or not the screen is reachable.

| Role | Can do |
|---|---|
| **Super Admin** | Everything, including administrators, roles and settings |
| **Administrator** | Every operational module. Cannot manage administrators, roles or settings |
| **Content Manager** | Pages, content blocks, programmes, curriculum, media |
| **Recruitment Manager** | Job openings and the trainer application pipeline |
| **Enquiry Manager** | Contact enquiries and follow-ups. Read-only on content |

Two rules the server enforces and that cannot be worked around from
the interface:

- **You cannot grant what you do not hold.** You can neither assign a
  role holding permissions you lack, nor add such a permission to a
  role.
- **The last active Super Admin is protected** from deletion,
  disabling and demotion, so the portal can never be locked out.

---

## Publishing

Everything editable follows the same shape:

```
edit  →  saves a draft        (the website is unchanged)
         ↓
preview                       (draft rendered, signed link, 10 minutes)
         ↓
publish  →  live              (a version is recorded)
         ↓
restore  →  back into draft   (review it, then publish again)
```

The two halves are **separate columns in the database**, not a status
flag on one value. A draft is therefore not merely hidden from the
public API — there is no query that could return it.

Restoring a version writes into the draft, never straight to the live
value. A rollback is itself reviewable, and an accidental restore
cannot change the public site on its own.

Publishing refreshes the website immediately when `REVALIDATE_SECRET`
is configured, and within a minute otherwise. Neither needs a deploy.

### The homepage's first screen

The hero, navigation, video and first-screen layout are **not editable
content**. They have no region in the CMS and no row in the database,
so nothing done in this portal can change them. The homepage editor
covers only the sections below that screen.

---

## Website pages

**Pages** holds the structured body and SEO metadata of each public
page. Each page has a fixed set of regions, so an edit cannot remove a
section the page expects or introduce one it does not understand.

Every field corresponds to something the page actually renders, and
everything editable on the page is reachable here. A button's words
are editable; where it goes is not, so an edit cannot point the site
at a URL that does not exist.

Use the visibility toggle on a region to take a section off the page
without deleting its content.

**Content blocks** holds individual pieces of copy addressed by key:
the hero's words, the footer blurb and the brand details. Everything
else on the site is a page document or a database record, so there is
no block for it.

Site navigation and footer link columns are not here at all. They are
routing, decided in code, so an edit could not point the site at a URL
that does not exist.

Markup and scripts are rejected in every field. Copy is plain text.

---

## Programmes

A programme's own screen has tabs for detail, curriculum, images, SEO
and history.

The **curriculum builder** manages modules and the topics inside them.
A module has its own published state, so an unfinished one is absent
from the public curriculum rather than showing as a gap.

- **Duplicate** copies a programme and its curriculum as a new draft.
- **Archive** takes it off the website and keeps the record.
- A **published** programme cannot be deleted outright — unpublish or
  archive it first.

Nothing in the programme model records a fee, a certification or a
placement guarantee. Do not add any of those as free text unless the
business has actually agreed them.

---

## Recruitment

**Job openings** are what the public careers page lists. Only published
openings appear, and one past its deadline counts as closed.

**Applications** is the pipeline. Each application's own screen holds
the candidate's profile, their resume, internal notes, interview and
demo feedback, the assigned recruiter and the full status history.

Everything on that screen is internal. Notes and feedback are never
exposed by any public endpoint and are excluded from CSV exports.
Resumes are served through an authenticated route that **records each
download in the audit log**, never from a public URL.

### Candidate emails

Shortlisting, interview, selection and rejection can send the candidate
a message. If outbound email is not configured on the server, the
status change still applies and the portal tells you plainly that
nothing was sent — contact the candidate yourself. It never implies a
message went out when it did not.

Check **Settings → Integrations** for the current state.

---

## Enquiries

Submissions from the website contact form. Assign an administrator, set
a follow-up date, record internal notes and move the enquiry through
its statuses; the detail screen shows notes and status changes in one
timeline, drawn from the append-only audit trail.

Archiving keeps the record and takes it out of the working queue. Use
**Delete** only for a genuine erasure request.

Exports reflect whatever filters are applied, quote every cell, and
neutralise values that would otherwise run as a spreadsheet formula.
Internal notes are excluded.

---

## What the portal does not manage

The portal shows only what the website renders. The site has no "who
we serve" section, no FAQ list and no standalone statistics block, and
its careers copy comes from the Careers page rather than from separate
blocks — so none of those has a screen here, and the API modules and
tables behind them were removed too.

Adding one back means building the section on the site, the API module
and the screen together. Nothing is left half-wired in the meantime.

## Media

Images, video and documents used across the website. Applicant resumes
are held privately against their application and never appear here.

Every upload is checked against its **actual bytes**, not its file
name. An SVG containing script is rejected, as is an executable renamed
to `.png`.

Before deleting a file the portal shows exactly what uses it. Deletion
is **refused** while a published page depends on it — replace it there
first.

Add alt text to any image that appears on a published page. The library
flags images that have none.

---

## Settings

Company details, SEO defaults, contact addresses and social URLs.

A blank contact value makes the website **omit that field entirely**
rather than render an empty link. Leave anything the business does not
own unset.

**Credentials are never here.** SMTP passwords, signing secrets and
storage keys live in the server's environment, where an authenticated
HTTP request cannot reach them. The Integrations tab reports whether
each integration is configured and working, and nothing about how.

---

## Audit log

Every administrative action: sign-ins, failed sign-ins, content
changes, publishes, status changes, media uploads and deletions, resume
downloads, permission changes and exports — including exports of the
audit log itself.

**It is read-only.** No endpoint creates, edits or deletes an entry.
Passwords, hashes and tokens are stripped before an entry is written,
so they never appear even in a before-and-after snapshot.

---

## If you are locked out

Eight consecutive failed sign-ins lock an account for 15 minutes.
Another administrator can clear it from **Administrators → Unlock**.

If every Super Admin is locked out, re-run the seed with a known
`SEED_ADMIN_PASSWORD` for an address that does **not** yet exist — the
seed creates that account without touching existing ones.

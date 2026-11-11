# Incident response plan

Who does what when something goes wrong. Keep this short enough to
follow at 3 a.m. Every step below exists in the platform today; nothing
here depends on a tool that is not installed.

## Roles

| Role | Responsibility |
|---|---|
| Incident lead | Declares the incident, runs the timeline, decides on containment, owns the postmortem |
| Platform operator | Has shell access to the hosts, the database and the backups |
| Super Admin | Acts inside the portal: revokes sessions, disables accounts, resets passwords |
| Data protection contact | Assesses notification duties (applicants and enquirers are data subjects) |

One person may hold several roles; name them in the on-call sheet.

## First five minutes — for every incident

1. **Declare it**: start a timeline (time, who, what was observed).
2. **Preserve evidence before changing anything**: `scripts/backup.sh`
   (encrypted snapshot of database + uploads), copy the API log
   (`pino` JSON) and the proxy access log to write-once storage, export
   the audit trail (`GET /api/audit/export`, which is itself audited).
3. **Contain** using the matching playbook below.
4. **Communicate**: one internal update every 30 minutes until stable.

## Playbooks

### A. Suspected administrator account compromise

Signals: sign-ins from an unexpected address (Administrators →
account → sessions / audit log), actions the owner denies,
`auth.login_failed` bursts followed by success, MFA recovery-code use
(`recovery code used` in the API log).

1. Super Admin: **Administrators → Revoke sessions** on the account
   (ends every session immediately), then **Reset password**. If the
   account is a Super Admin, do this from another Super Admin account.
   If every Super Admin is suspect, use the database: set
   `is_active = false` and `sessions_valid_from = now()` on each.
2. Review the audit log filtered by `actorId` for the window: exports,
   downloads, role or permission changes, settings changes, publishes.
3. Reverse unauthorised changes: roles via the Roles screen; content via
   **Restore version** then publish; settings by hand.
4. If a role's permissions were changed, every account holding it is
   affected; review them.
5. Rotate: that account's MFA (disable with DB, re-enrol), and if a
   Super Admin was involved, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
   (ends every session platform-wide) and `MFA_ENCRYPTION_KEY`
   (requires every account to re-enrol — plan it).
6. Determine whether personal data was read or exported → playbook F.

### B. Database exposure (dump leaked, credentials leaked, host breached)

1. Rotate `DATABASE_URL` credentials; revoke the old role; check
   `pg_stat_activity` for foreign sessions.
2. Rotate both JWT secrets (invalidates all sessions) and
   `MFA_ENCRYPTION_KEY`; force a password change for every
   administrator (`reset-password` for each, or set
   `sessions_valid_from`). Password hashes are bcrypt and refresh
   tokens are digests, but treat them as burned.
3. Preview links are signed with the access secret; rotating it
   invalidates them.
4. The dump contains applicant and enquirer personal data → playbook F.
5. Restore integrity: compare row counts and recent `updated_at` against
   the last known-good backup; if tampering is suspected, restore
   (`scripts/restore.sh`) to a scratch instance and diff.

### C. Malicious upload

Signals: `upload.malware_rejected` in the audit log (the pipeline
worked), `media.rejected` / `application.resume_rejected` from a
rescan (a file was quarantined before a signature existed), or a
reviewer reports a suspicious document.

1. If the scanner caught it: nothing reached a reviewer. Record the
   signature, address and time; consider a temporary block at the proxy.
2. If a previously CLEAN file is now suspect: run `npm run media:rescan`
   after `freshclam`; any file that turns REJECTED is destroyed and
   its row marked. Check `application.resume_downloaded` audit entries
   for that application to find who opened it, and treat those
   workstations per your endpoint policy.
3. Never open a suspect file on an admin workstation; the download route
   already refuses anything not CLEAN.

### D. Storage compromise (upload directories read or written)

1. Take the API off line or set the proxy to maintenance.
2. Public tier: regenerate from the database — every row has a
   checksum; verify each file (`sha256sum`) and delete anything without
   a matching row (`npm run media:cleanup --dry-run` lists orphans).
3. Private tier: resumes are personal data → playbook F. Re-scan all.
4. Fix the permission model (`0600` files, `0750` directories, API user
   only) and rotate host credentials.

### E. Credential leakage (a secret in a commit, log or message)

1. Identify which secret. Rotate it immediately; every secret is an
   environment variable, so this is a redeploy:
   * JWT secrets → all sessions end; MFA key → re-enrolment;
     `REVALIDATE_SECRET` → update both API and website;
     SMTP → provider; `DATABASE_URL` → database role.
2. Purge the secret from git history if it was committed (`git filter-repo`),
   force-push, and have every clone re-fetch. CI runs gitleaks on every
   push and weekly to catch this earlier.
3. Review the audit log and proxy log for use of the secret in the window.

### F. Data breach assessment

The platform holds: enquirer names, emails, phones, organisations,
messages; applicant names, contact details, employment history,
resumes; administrator emails and bcrypt hashes; audit IPs.

1. Scope: which tables/files, which time window, which actor. The
   audit log's `*.export`, `application.resume_downloaded` and
   `enquiry.read` entries bound what was accessed.
2. The data protection contact decides on notification obligations
   (regulator and data subjects) and timelines; record the decision and
   reasoning in the postmortem.
3. Enquirers and applicants can be contacted from their records; keep a
   list of who was notified.

### G. Website defacement

Published content is versioned: open the page in the portal → **History
→ Restore** the last good version → **Publish**. Programmes and content
blocks have the same history. Then check the audit log for how the
change was made (`page.publish` by whom) → playbook A if the account
was not the owner's.

## Recovery

* Restore order: database → uploads → API → front ends. `scripts/restore.sh`
  verifies the checksum and asks for confirmation. **Rehearse it
  quarterly** on a scratch stack; a restore attempted for the first time
  during an incident is a second incident.
* After any rotation, run `npm run test:security` and `npm run test:e2e`
  against staging before reopening.

## Postmortem

Within five working days: timeline, root cause, what detected it, what
did not, what changed, what is still open. Blameless. Add any new
check to `apps/api/tests/security.py` so the regression cannot return
silently.

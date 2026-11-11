# Authentication and authorization

## Sessions

* **Access token** — JWT, 15 minutes, `httpOnly; SameSite=Lax` (Strict
  in production); `Secure` in production. Carries `sub`, `email`,
  `role`, `sid` (session family) and `scope`. **Never returned in a
  response body** and never readable by JavaScript.
* **Refresh token** — 48 random bytes in an `httpOnly` cookie scoped to
  `/api/auth`, 7 days. Only its SHA-256 digest is stored. Each refresh
  rotates it; presenting a spent one revokes the whole family.
* **Per request** the middleware verifies the signature, then loads
  the account and confirms: active, not locked, the session family
  still has a live refresh token (sign-out and revocation kill it
  instantly), the token post-dates `sessions_valid_from` (password
  change, disable, role change), and loads the **current** permissions
  from the role. The token's own permission claim was removed: a grant
  revoked in the Roles screen is gone on the very next request.
* **Sign-out** revokes the family; a captured access token is dead
  immediately (verified by the security suite).

## Sign-in

1. `POST /auth/login` with email and password. 8 failures lock the
   account for 15 minutes; every failure — unknown address, wrong
   password, locked, disabled — returns the same message and takes
   comparable time (a dummy bcrypt compare runs for unknown addresses).
2. Rate limits: 8 attempts per address+account and 30 per address
   (failed attempts only), per `RATE_LIMIT_WINDOW_MS`.
3. If the account has MFA, the response is `{ mfaRequired, challenge }`
   with **no cookie**. The challenge is a 5-minute single-purpose JWT.
4. `POST /auth/mfa/verify` with the challenge and a 6-digit TOTP or a
   recovery code issues the session. A wrong code counts toward the
   lockout.

## Multi-factor authentication

* TOTP per RFC 6238 (SHA-1, 30 s, 6 digits, ±1 step), implemented on
  `node:crypto` in `lib/totp.ts` — no dependency.
* Enrolment: `POST /auth/mfa/setup` returns the secret once (base32 and
  `otpauth://` URI); `POST /auth/mfa/confirm` with a valid code enables
  it and returns **8 recovery codes once**, stored as SHA-256 digests,
  each usable exactly once.
* The seed is stored encrypted (AES-256-GCM) under `MFA_ENCRYPTION_KEY`;
  without that variable a key is derived from `JWT_REFRESH_SECRET`
  (development only; production boot requires the dedicated key).
* **Policy**: `MFA_REQUIRED_ROLES` (default `Super Admin` in
  production, nobody in development). A member of a required role who
  has not enrolled receives a `scope: "mfa_setup"` session that can
  reach only `/auth/*`; the portal sends them to Your account to enrol.
  Such accounts cannot turn MFA off.
* Disable and regenerate-recovery-codes require the password and a
  current code.

## Re-authentication

`POST /auth/reauth` with the password (and code, if enrolled) sets a
10-minute `ps_elevated` cookie bound to the session family. Routes
guarded by `requireRecentAuth` refuse with `403 REAUTH_REQUIRED`
without it; the portal prompts and retries automatically. Guarded:
administrators (all mutations), roles (all mutations), settings
(writes), enquiry/application/audit exports, resume downloads, media
deletion.

## Authorization

* 34 permissions in 10 groups, granted to roles, roles to accounts.
  Seeded roles: Super Admin (all), Administrator, Content Manager,
  Recruitment Manager, Enquiry Manager (see docs/admin-setup.md).
* **Enforced on the server** by `requirePermission` on every
  administrative route; the portal hides screens only as a convenience.
* **Delegation**: you cannot grant a permission you do not hold —
  neither by assigning a role nor by editing one.
* **Hierarchy** (new): you cannot reset the password of, disable,
  delete or end the sessions of an account whose role holds a
  permission you lack. You cannot change your own role or disable
  yourself. The last active Super Admin cannot be demoted, disabled or
  deleted. The Super Admin role cannot be edited or deleted.
* Public endpoints select published rows with explicit column lists;
  there is no parameter that returns a draft, a note, an assignee or a
  source IP.

## CSRF

Three layers: `SameSite` cookies; CORS restricted to `CORS_ORIGINS`
with a 403 on anything else; and `csrfGuard`, which refuses any
state-changing request carrying a session cookie unless its `Origin`
(or `Sec-Fetch-Site`, or `Referer`) is trusted. Requests with none of
those headers are refused — every current browser sends at least one on
a cross-site write. Bearer-authenticated requests are exempt because a
cross-site form cannot set a header.

## Password policy

≥ 12 characters with lower, upper and digit; bcrypt cost 12; a new
password must differ from the current one; changing it ends every
session including the current one. Administrators resetting another
account's password are subject to the hierarchy rule and
re-authentication, and the target's sessions are revoked.

## Audit events

`auth.login`, `auth.login_failed` (address typed, never the password),
`auth.mfa_failed`, `auth.logout`, `auth.reauth`, `auth.reauth_failed`,
`auth.change_password`, `auth.mfa_enabled/disabled/recovery_regenerated`,
`admin.*`, `role.*`. Passwords, hashes, tokens and secrets are stripped
before any snapshot is written.

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { env, MFA_REQUIRED_ROLES } from "../../config/env.js";
import { hashPassword, verifyPassword, assessPassword } from "../../lib/password.js";
import {
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
  signMfaChallenge,
  verifyMfaChallenge,
  ttlToMs,
} from "../../lib/tokens.js";
import { BadRequestError, UnauthorizedError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { open, seal } from "../../lib/secretbox.js";
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "../../lib/totp.js";

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

/** One message for every way a sign-in can fail, so nothing is learned from the wording. */
const INVALID_CREDENTIALS = "Email or password is incorrect";

interface Ctx {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  mfaEnabled: boolean;
  /** True for a Super Admin who has not yet enrolled: the session is restricted. */
  mfaSetupRequired: boolean;
}

async function loadPermissions(roleId: string): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  });
  return rows.map((r) => r.permission.key);
}

/** Whether this role's members must have a second factor (see MFA_REQUIRED_ROLES). */
function mfaRequiredFor(roleName: string): boolean {
  return MFA_REQUIRED_ROLES.includes(roleName);
}

async function issueSession(userId: string, ctx: Ctx, familyId?: string) {
  const user = await prisma.adminUser.findUniqueOrThrow({
    where: { id: userId },
    include: { role: true },
  });
  const permissions = await loadPermissions(user.roleId);
  const mfaEnabled = Boolean(user.mfaEnabledAt);
  const mfaSetupRequired = mfaRequiredFor(user.role.name) && !mfaEnabled;

  const sid = familyId ?? crypto.randomUUID();
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role.name,
    sid,
    scope: mfaSetupRequired ? "mfa_setup" : "full",
  });

  const { token: refreshToken, hash } = createRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      familyId: sid,
      userId: user.id,
      expiresAt: new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL)),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions,
    mfaEnabled,
    mfaSetupRequired,
  };
  return { accessToken, refreshToken, sid, user: session };
}

export type LoginResult =
  | { kind: "session"; session: Awaited<ReturnType<typeof issueSession>> }
  | { kind: "mfa"; challenge: string };

/**
 * Step one of sign-in. Checks the password; if the account has a
 * second factor it returns a short-lived challenge instead of a
 * session, and nothing is issued until a valid code arrives.
 */
export async function login(email: string, password: string, ctx: Ctx): Promise<LoginResult> {
  const user = await prisma.adminUser.findUnique({
    where: { email },
    include: { role: true },
  });

  // Same error and comparable timing whether the account exists, is
  // locked, is disabled or has the wrong password: the endpoint cannot
  // be used to enumerate addresses or account state.
  if (!user) {
    await verifyPassword(password, "$2b$12$" + "x".repeat(53));
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  const locked = Boolean(user.lockedUntil && user.lockedUntil > new Date());
  const ok = await verifyPassword(password, user.passwordHash);

  if (locked || !user.isActive) {
    logger.warn({ userId: user.id, ip: ctx.ip, locked, active: user.isActive }, "sign-in refused");
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    if (failed >= MAX_FAILED) {
      logger.warn({ userId: user.id, ip: ctx.ip }, "account locked after repeated failures");
    }
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  if (user.mfaEnabledAt) {
    return { kind: "mfa", challenge: signMfaChallenge(user.id) };
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return { kind: "session", session: await issueSession(user.id, ctx) };
}

/**
 * Step two of sign-in: a TOTP code or a recovery code against the
 * challenge from step one. A wrong code counts as a failed sign-in,
 * so the lockout covers the second factor as well as the first.
 */
export async function completeMfaLogin(challenge: string, code: string, ctx: Ctx) {
  let userId: string;
  try {
    userId = verifyMfaChallenge(challenge);
  } catch {
    throw new UnauthorizedError("That sign-in attempt has expired. Start again.");
  }

  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !user.mfaEnabledAt || !user.mfaSecret) {
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  const accepted = await checkSecondFactor(user.id, user.mfaSecret, user.mfaRecoveryCodes, code);
  if (!accepted) {
    const failed = user.failedLoginCount + 1;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    throw new UnauthorizedError("That code is not valid");
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return issueSession(user.id, ctx);
}

/**
 * Accepts a current TOTP code, or burns one recovery code. The last
 * accepted TOTP step is not tracked per user because the login rate
 * limit already bounds replay within the 90-second window.
 */
async function checkSecondFactor(
  userId: string,
  sealedSecret: string,
  recoveryHashes: string[],
  code: string
): Promise<boolean> {
  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed)) {
    return verifyTotp(open(sealedSecret), trimmed) !== null;
  }

  const digest = hashRecoveryCode(trimmed);
  const idx = recoveryHashes.findIndex((h) =>
    h.length === digest.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(digest))
  );
  if (idx < 0) return false;

  // Single use.
  const remaining = recoveryHashes.filter((_, i) => i !== idx);
  await prisma.adminUser.update({ where: { id: userId }, data: { mfaRecoveryCodes: remaining } });
  logger.warn({ userId, remaining: remaining.length }, "recovery code used");
  return true;
}

/**
 * Rotates a refresh token. Presenting one that has already been used
 * means it leaked, so the entire family is revoked and the session
 * ends everywhere.
 */
export async function refresh(presented: string, ctx: Ctx) {
  const hash = hashRefreshToken(presented);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

  if (!existing) throw new UnauthorizedError("Invalid session");

  if (existing.usedAt || existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.warn(
      { userId: existing.userId, familyId: existing.familyId },
      "refresh token reuse detected; family revoked"
    );
    throw new UnauthorizedError("Session revoked. Please sign in again.");
  }

  if (existing.expiresAt < new Date()) {
    throw new UnauthorizedError("Session expired. Please sign in again.");
  }

  const user = await prisma.adminUser.findUnique({ where: { id: existing.userId } });
  if (!user || !user.isActive) throw new UnauthorizedError("This account has been disabled");

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { usedAt: new Date() },
  });

  return issueSession(existing.userId, ctx, existing.familyId);
}

export async function logout(presented: string | undefined, sid?: string): Promise<void> {
  const familyIds = new Set<string>();
  if (sid) familyIds.add(sid);
  if (presented) {
    const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(presented) } });
    if (token) familyIds.add(token.familyId);
  }
  if (familyIds.size === 0) return;
  // Revoke the whole family: signing out ends the session, which the
  // auth middleware enforces on the very next request.
  await prisma.refreshToken.updateMany({
    where: { familyId: { in: [...familyIds] }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function currentUser(userId: string): Promise<SessionUser & { lastLoginAt: Date | null; recoveryCodesLeft: number }> {
  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user || !user.isActive) throw new UnauthorizedError();
  const mfaEnabled = Boolean(user.mfaEnabledAt);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: await loadPermissions(user.roleId),
    lastLoginAt: user.lastLoginAt,
    mfaEnabled,
    mfaSetupRequired: mfaRequiredFor(user.role.name) && !mfaEnabled,
    recoveryCodesLeft: user.mfaRecoveryCodes.length,
  };
}

/**
 * Proves the password (and second factor, when enrolled) again for a
 * sensitive action. Returns nothing; the route issues the elevation.
 */
export async function reauthenticate(userId: string, password: string, code?: string): Promise<void> {
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new UnauthorizedError("Password is incorrect");
  }
  if (user.mfaEnabledAt && user.mfaSecret) {
    if (!code) throw new UnauthorizedError("Enter the code from your authenticator");
    if (!(await checkSecondFactor(user.id, user.mfaSecret, user.mfaRecoveryCodes, code))) {
      throw new UnauthorizedError("That code is not valid");
    }
  }
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  const problems = assessPassword(newPassword);
  if (problems.length) throw new BadRequestError(`Password ${problems.join(", ")}`);

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new BadRequestError("New password must differ from the current one");
  }

  const passwordHash = await hashPassword(newPassword);

  // Changing a password ends every session, including the access
  // token already held by whatever browser made this request.
  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: userId },
      data: { passwordHash, sessionsValidFrom: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/* ── MFA enrolment ─────────────────────────────────────────── */

/** Starts enrolment: a new pending secret, shown once. */
export async function beginMfaEnrolment(userId: string) {
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
  const secret = generateSecret();
  await prisma.adminUser.update({
    where: { id: userId },
    data: { mfaPendingSecret: seal(secret) },
  });
  return { secret, otpauth: otpauthUri(secret, user.email) };
}

/** Confirms enrolment with a code from the pending secret; returns recovery codes once. */
export async function confirmMfaEnrolment(userId: string, code: string) {
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaPendingSecret) throw new BadRequestError("Start two-factor setup first");

  const secret = open(user.mfaPendingSecret);
  if (verifyTotp(secret, code) === null) {
    throw new BadRequestError("That code is not valid. Check the time on your device and try again.");
  }

  const { plain, hashes } = generateRecoveryCodes();
  await prisma.adminUser.update({
    where: { id: userId },
    data: {
      mfaSecret: seal(secret),
      mfaPendingSecret: null,
      mfaEnabledAt: new Date(),
      mfaRecoveryCodes: hashes,
    },
  });
  return { recoveryCodes: plain };
}

export async function disableMfa(userId: string, password: string, code: string) {
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  if (mfaRequiredFor(user.role.name)) {
    throw new BadRequestError(`Two-factor authentication is required for the ${user.role.name} role and cannot be turned off`);
  }
  if (!user.mfaEnabledAt || !user.mfaSecret) throw new BadRequestError("Two-factor authentication is not enabled");
  if (!(await verifyPassword(password, user.passwordHash))) throw new UnauthorizedError("Password is incorrect");
  if (!(await checkSecondFactor(user.id, user.mfaSecret, user.mfaRecoveryCodes, code))) {
    throw new UnauthorizedError("That code is not valid");
  }
  await prisma.adminUser.update({
    where: { id: userId },
    data: { mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: [] },
  });
}

export async function regenerateRecoveryCodes(userId: string, code: string) {
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabledAt || !user.mfaSecret) throw new BadRequestError("Two-factor authentication is not enabled");
  if (verifyTotp(open(user.mfaSecret), code) === null) throw new UnauthorizedError("That code is not valid");
  const { plain, hashes } = generateRecoveryCodes();
  await prisma.adminUser.update({ where: { id: userId }, data: { mfaRecoveryCodes: hashes } });
  return { recoveryCodes: plain };
}

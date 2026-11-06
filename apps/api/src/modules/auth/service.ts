import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword, assessPassword } from "../../lib/password.js";
import {
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
  ttlToMs,
} from "../../lib/tokens.js";
import { BadRequestError, UnauthorizedError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import crypto from "node:crypto";

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

interface Ctx {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

async function loadPermissions(roleId: string): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  });
  return rows.map((r) => r.permission.key);
}

async function issueSession(userId: string, ctx: Ctx, familyId?: string) {
  const user = await prisma.adminUser.findUniqueOrThrow({
    where: { id: userId },
    include: { role: true },
  });
  const permissions = await loadPermissions(user.roleId);

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role.name,
    permissions,
  });

  const { token: refreshToken, hash } = createRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      familyId: familyId ?? crypto.randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL)),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions,
    },
  };
}

export async function login(email: string, password: string, ctx: Ctx) {
  const user = await prisma.adminUser.findUnique({
    where: { email },
    include: { role: true },
  });

  // Same error and comparable timing whether the account exists or
  // not, so the endpoint cannot be used to enumerate addresses.
  const invalid = new UnauthorizedError("Email or password is incorrect");

  if (!user) {
    await verifyPassword(password, "$2b$12$" + "x".repeat(53));
    throw invalid;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new UnauthorizedError("Account temporarily locked. Try again shortly.");
  }

  if (!user.isActive) {
    throw new UnauthorizedError("This account has been disabled");
  }

  const ok = await verifyPassword(password, user.passwordHash);
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
    throw invalid;
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return issueSession(user.id, ctx);
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

export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const hash = hashRefreshToken(presented);
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  if (!token) return;
  // Revoke the whole family: signing out should end the session, not
  // just invalidate the one token presented.
  await prisma.refreshToken.updateMany({
    where: { familyId: token.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function currentUser(userId: string) {
  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user || !user.isActive) throw new UnauthorizedError();
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: await loadPermissions(user.roleId),
    lastLoginAt: user.lastLoginAt,
  };
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

  await prisma.adminUser.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Changing a password ends every other session.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

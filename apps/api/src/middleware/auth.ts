import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken, type AccessPayload } from "../lib/tokens.js";
import { prisma } from "../lib/prisma.js";

export const ACCESS_COOKIE = "ps_access";
export const REFRESH_COOKIE = "ps_refresh";

/**
 * Reads the access token from the httpOnly cookie, falling back to a
 * bearer header so the API stays usable from scripts and tests.
 */
function readToken(req: Request): string | null {
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (typeof cookie === "string" && cookie.length > 0) return cookie;

  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();

  return null;
}

/**
 * Confirms the account behind a valid token is still allowed in, and
 * loads what it may do right now.
 *
 * Access tokens are stateless and short-lived, which is what makes
 * them cheap — but it also means that without these checks, signing
 * out, disabling an account or removing a permission would not take
 * effect until the token expired. Two indexed lookups per request buy:
 *
 *  - immediate revocation: the token's session family must still have
 *    a live refresh token (sign-out and "revoke sessions" kill it);
 *  - immediate permission changes: permissions come from the role in
 *    the database, never from the token.
 */
async function resolveSession(payload: AccessPayload) {
  const [account, family] = await Promise.all([
    prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: {
        isActive: true,
        sessionsValidFrom: true,
        lockedUntil: true,
        role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } },
      },
    }),
    prisma.refreshToken.findFirst({
      where: { familyId: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);

  if (!account) throw new UnauthorizedError("Session expired or invalid");
  if (!account.isActive) throw new UnauthorizedError("This account has been disabled");
  if (!family) throw new UnauthorizedError("Session ended. Please sign in again.");

  if (account.lockedUntil && account.lockedUntil > new Date()) {
    throw new UnauthorizedError("Account temporarily locked");
  }

  // `iat` is in seconds; it is compared against the instant sessions
  // were last invalidated for this account.
  if (account.sessionsValidFrom && typeof payload.iat === "number") {
    if (payload.iat * 1000 < account.sessionsValidFrom.getTime()) {
      throw new UnauthorizedError("Session revoked. Please sign in again.");
    }
  }

  return {
    role: account.role.name,
    permissions: account.role.permissions.map((p) => p.permission.key),
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req);
  if (!token) return next(new UnauthorizedError());

  let payload: AccessPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    // Expired and malformed are deliberately indistinguishable here.
    return next(new UnauthorizedError("Session expired or invalid"));
  }

  try {
    const live = await resolveSession(payload);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: live.role,
      permissions: live.permissions,
      sid: payload.sid,
      scope: payload.scope ?? "full",
    };
  } catch (err) {
    return next(err);
  }

  // A restricted session may only reach the authentication routes, so
  // the only thing it can do is finish enrolling its second factor.
  if (req.user.scope === "mfa_setup" && !req.baseUrl.endsWith("/auth")) {
    return next(new ForbiddenError("Set up two-factor authentication before continuing"));
  }

  next();
}

/**
 * Attaches the user when a token is present, but never refuses.
 * Used where knowing who is calling is useful but not required.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const live = await resolveSession(payload);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: live.role,
      permissions: live.permissions,
      sid: payload.sid,
      scope: payload.scope ?? "full",
    };
  } catch {
    /* ignore: this route does not require a session */
  }
  next();
}

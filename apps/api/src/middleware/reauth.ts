/**
 * Re-authentication for sensitive administrative actions.
 *
 * A session can be fifteen minutes old on a shared machine, or
 * hijacked outright. Before the actions that would do the most damage
 * — changing who can sign in and what they may do, reading applicant
 * files, exporting personal data — the administrator proves the
 * password (and second factor, when enrolled) again.
 *
 * Proof is a short-lived, signed cookie bound to the session's family
 * id. It is not stored: a signature check is enough, and binding to
 * the family means an elevation cannot be carried to a different
 * session. The admin portal reacts to REAUTH_REQUIRED by asking for
 * the password and retrying.
 */

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export const ELEVATED_COOKIE = "ps_elevated";
export const ELEVATION_TTL_MS = 10 * 60 * 1000;

interface ElevationPayload {
  sub: string;
  sid: string;
  purpose: "elevated";
}

export function signElevation(userId: string, sid: string): string {
  return jwt.sign({ sub: userId, sid, purpose: "elevated" } satisfies ElevationPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: Math.floor(ELEVATION_TTL_MS / 1000),
    issuer: "polarsight-api",
  });
}

export class ReauthRequiredError extends AppError {
  constructor() {
    super("Confirm your password to continue", 403, "REAUTH_REQUIRED");
  }
}

/** Requires an elevation cookie that belongs to this user and session. */
export function requireRecentAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new ReauthRequiredError());

  const token = req.cookies?.[ELEVATED_COOKIE] ?? req.get("x-elevation");
  if (typeof token !== "string" || !token) return next(new ReauthRequiredError());

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "polarsight-api" }) as ElevationPayload;
    if (payload.purpose !== "elevated" || payload.sub !== req.user.id || payload.sid !== req.user.sid) {
      return next(new ReauthRequiredError());
    }
    next();
  } catch {
    next(new ReauthRequiredError());
  }
}

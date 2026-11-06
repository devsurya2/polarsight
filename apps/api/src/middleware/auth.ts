import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";

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

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) return next(new UnauthorizedError());

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions ?? [],
    };
    next();
  } catch {
    // Expired and malformed are deliberately indistinguishable here.
    next(new UnauthorizedError("Session expired or invalid"));
  }
}

/** Attaches the user when a token is present, but never refuses. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions ?? [],
      };
    } catch {
      /* ignore: this route does not require a session */
    }
  }
  next();
}

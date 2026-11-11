/**
 * Cross-site request forgery guard for cookie-authenticated calls.
 *
 * SameSite cookies are the first line and CORS the second; this is
 * the third, for the cases they do not cover (older browsers, a
 * cookie domain shared with a sibling host, a future relaxation of
 * SameSite). It is deliberately simple:
 *
 *   A state-changing request that carries a session cookie must come
 *   from an origin the API trusts.
 *
 * "Comes from" is read from the Origin header, falling back to
 * Sec-Fetch-Site, falling back to Referer. A request with none of
 * them and a session cookie is refused: every current browser sends
 * at least one on a cross-site POST, so their absence means either a
 * non-browser client (which should use the Authorization header and
 * carries no cookie) or something trying to look like one.
 *
 * Requests authenticated by bearer header are untouched: a header
 * cannot be attached by a cross-site form, so there is no forgery to
 * guard against.
 */

import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { ForbiddenError } from "../lib/errors.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./auth.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const hasSessionCookie = Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
  if (!hasSessionCookie) return next();

  const origin = originOf(req.get("origin"));
  if (origin) {
    return env.CORS_ORIGINS.includes(origin)
      ? next()
      : next(new ForbiddenError("Cross-site request refused"));
  }

  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none"
      ? next()
      : next(new ForbiddenError("Cross-site request refused"));
  }

  const referer = originOf(req.get("referer"));
  if (referer) {
    return env.CORS_ORIGINS.includes(referer)
      ? next()
      : next(new ForbiddenError("Cross-site request refused"));
  }

  next(new ForbiddenError("Cross-site request refused"));
}

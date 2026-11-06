import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

/**
 * Permission gate. The token carries the permissions granted to the
 * user's role at sign-in; the access token is short-lived, so a role
 * change takes effect within one refresh cycle.
 */
export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());

    const held = new Set(req.user.permissions);
    const missing = required.filter((p) => !held.has(p));

    if (missing.length > 0) {
      return next(new ForbiddenError(`Missing permission: ${missing.join(", ")}`));
    }
    next();
  };
}

/** Any one of the listed permissions is enough. */
export function requireAnyPermission(...accepted: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    const held = new Set(req.user.permissions);
    if (!accepted.some((p) => held.has(p))) {
      return next(new ForbiddenError(`Requires one of: ${accepted.join(", ")}`));
    }
    next();
  };
}

import type { Request } from "express";

/**
 * Reads a route parameter that a validator has already proven present.
 * `noUncheckedIndexedAccess` types req.params lookups as possibly
 * undefined, which is correct in general but not after validation.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new Error(`Route parameter "${name}" is missing; is the validator wired up?`);
  }
  return value;
}

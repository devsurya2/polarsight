import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { BadRequestError } from "../lib/errors.js";

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates and REPLACES the request parts with the parsed result, so
 * handlers only ever see data that has been through a schema. Unknown
 * keys are stripped by Zod's object parsing, which is what stops
 * mass-assignment.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, "query", { value: parsed, writable: true, configurable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new BadRequestError(
            "Validation failed",
            err.issues.map((i) => ({ field: i.path.join(".") || "(root)", message: i.message }))
          )
        );
      }
      next(err);
    }
  };
}

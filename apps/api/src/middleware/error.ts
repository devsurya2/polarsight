import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { isProd } from "../config/env.js";

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError("Endpoint"));
}

/** Turns a Prisma failure into something meaningful without leaking schema detail. */
function fromPrisma(err: unknown): AppError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const target = (err.meta?.target as string[] | undefined)?.join(", ");
        return new AppError(
          target ? `A record with that ${target} already exists` : "That record already exists",
          409,
          "CONFLICT"
        );
      }
      case "P2003":
        return new AppError("That references something which does not exist", 400, "BAD_REQUEST");
      case "P2025":
        return new AppError("Record not found", 404, "NOT_FOUND");
      default:
        return null;
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError("Invalid query", 400, "BAD_REQUEST");
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const mapped = err instanceof AppError ? err : fromPrisma(err);

  if (mapped) {
    if (mapped.status >= 500) {
      logger.error({ err, path: req.path }, mapped.message);
    } else {
      logger.warn({ code: mapped.code, path: req.path }, mapped.message);
    }
    res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, details: mapped.details },
    });
    return;
  }

  // Anything unrecognised is a bug. Log it fully, tell the caller nothing.
  logger.error({ err, path: req.path, method: req.method }, "unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
      ...(isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}

import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
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
/** Upload-parser failures are the client's problem, not ours. */
function fromMulter(err: unknown): AppError | null {
  if (!(err instanceof multer.MulterError)) return null;
  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      return new AppError("That file is larger than the allowed size", 413, "PAYLOAD_TOO_LARGE");
    case "LIMIT_FILE_COUNT":
    case "LIMIT_UNEXPECTED_FILE":
      return new AppError("Unexpected file in the upload", 400, "BAD_REQUEST");
    case "LIMIT_PART_COUNT":
    case "LIMIT_FIELD_COUNT":
    case "LIMIT_FIELD_KEY":
    case "LIMIT_FIELD_VALUE":
      return new AppError("The upload has too many or too large form fields", 400, "BAD_REQUEST");
    default:
      return new AppError("The upload could not be read", 400, "BAD_REQUEST");
  }
}

/**
 * A multipart body the parser cannot read (a malformed part header, a
 * truncated form, a missing boundary) is malformed input, not a fault
 * in the API. busboy raises these as plain Errors, so they are
 * recognised by message.
 */
const MULTIPART_ERRORS =
  /^(Malformed part header|Unexpected end of (form|multipart data)|Multipart: Boundary not found|Missing Content-Type|Malformed content type)/i;

function fromMultipart(err: unknown): AppError | null {
  if (err instanceof Error && MULTIPART_ERRORS.test(err.message)) {
    return new AppError("The upload could not be read", 400, "BAD_REQUEST");
  }
  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const mapped =
    err instanceof AppError ? err : (fromMulter(err) ?? fromMultipart(err) ?? fromPrisma(err));

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

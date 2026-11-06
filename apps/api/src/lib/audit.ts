import type { Request } from "express";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Strip anything that must never be written to the audit trail. */
function scrub(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value ?? undefined;
  if (Array.isArray(value)) return value.map(scrub);
  const banned = new Set(["passwordHash", "password", "tokenHash", "token", "refreshToken"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !banned.has(k))
      .map(([k, v]) => [k, scrub(v)])
  );
}

/**
 * Records an administrative change. Deliberately never throws: an
 * audit failure must not roll back the action the user asked for,
 * but it must be shouted about in the logs.
 */
export async function writeAudit(req: Request, input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: (scrub(input.before) as object) ?? undefined,
        after: (scrub(input.after) as object) ?? undefined,
        actorId: req.user?.id ?? null,
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, "failed to write audit log");
  }
}

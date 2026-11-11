/**
 * Audit trail.
 *
 * Read-only by design: there is no endpoint here that creates, edits
 * or deletes an entry. Records are written by `lib/audit.ts` as a side
 * effect of the action being audited, and the only way to remove one
 * is direct database access.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { requireRecentAuth } from "../../middleware/reauth.js";
import { writeAudit } from "../../lib/audit.js";
import { exportFilename, toCsv } from "../../lib/csv.js";
import { paginated, skipTake } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import { NotFoundError } from "../../lib/errors.js";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  entity: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  actorId: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
  search: z.string().trim().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function buildWhere(q: z.infer<typeof listQuery>) {
  const where: Record<string, unknown> = {
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.action ? { action: { contains: q.action, mode: "insensitive" as const } } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
  };

  if (q.from || q.to) {
    where.createdAt = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
  }

  if (q.search) {
    const contains = { contains: q.search, mode: "insensitive" as const };
    where.OR = [
      { action: contains },
      { entity: contains },
      { entityId: contains },
      { actorLabel: contains },
      { ip: contains },
      { actor: { name: contains } },
      { actor: { email: contains } },
    ];
  }

  return where;
}

const rowSelect = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  before: true,
  after: true,
  ip: true,
  userAgent: true,
  actorLabel: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true } },
} as const;

export const auditRouter = Router();
auditRouter.use(requireAuth);

auditRouter.get(
  "/",
  requirePermission("audit:read"),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof listQuery>;
      const where = buildWhere(q);

      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...skipTake({ page: q.page, perPage: q.perPage }),
          select: rowSelect,
        }),
        prisma.auditLog.count({ where }),
      ]);
      res.json(paginated(items, total, { page: q.page, perPage: q.perPage }));
    } catch (err) {
      next(err);
    }
  }
);

/** The distinct entities and actions present, to populate the filters. */
auditRouter.get("/facets", requirePermission("audit:read"), async (_req, res, next) => {
  try {
    const [entities, actions, actors] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["entity"], _count: { _all: true } }),
      prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
      prisma.adminUser.findMany({
        where: { auditLogs: { some: {} } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
    ]);

    res.json({
      entities: entities
        .map((e) => ({ value: e.entity, count: e._count._all }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      actions: actions
        .map((a) => ({ value: a.action, count: a._count._all }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      actors,
    });
  } catch (err) {
    next(err);
  }
});

auditRouter.get(
  "/export",
  requirePermission("audit:read"),
  requireRecentAuth,
  validate({ query: listQuery.omit({ page: true, perPage: true }) }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof listQuery>;
      const rows = await prisma.auditLog.findMany({
        where: buildWhere(q),
        orderBy: { createdAt: "desc" },
        // Bounded: an unbounded export of an append-only log would
        // grow without limit and could be used to exhaust memory.
        take: 5_000,
        select: rowSelect,
      });

      // Exporting the trail is itself an auditable act.
      await writeAudit(req, {
        action: "audit.export",
        entity: "AuditLog",
        after: { count: rows.length },
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename("audit-log", "csv")}"`
      );
      res.send(
        toCsv(
          rows.map((r) => ({
            createdAt: r.createdAt,
            action: r.action,
            entity: r.entity,
            entityId: r.entityId,
            actor: r.actor?.name ?? r.actorLabel ?? "",
            actorEmail: r.actor?.email ?? "",
            ip: r.ip,
          })),
          [
            { key: "createdAt", header: "When" },
            { key: "action", header: "Action" },
            { key: "entity", header: "Resource" },
            { key: "entityId", header: "Resource ID" },
            { key: "actor", header: "Administrator" },
            { key: "actorEmail", header: "Email" },
            { key: "ip", header: "IP address" },
          ]
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

auditRouter.get(
  "/:id",
  requirePermission("audit:read"),
  validate({ params: z.object({ id: z.string().min(1) }) }),
  async (req, res, next) => {
    try {
      const item = await prisma.auditLog.findUnique({
        where: { id: param(req, "id") },
        select: rowSelect,
      });
      if (!item) throw new NotFoundError("Audit entry");
      res.json({ item });
    } catch (err) {
      next(err);
    }
  }
);

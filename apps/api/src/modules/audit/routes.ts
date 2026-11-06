import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { paginated, skipTake } from "../../lib/pagination.js";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  entity: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  actorId: z.string().trim().max(60).optional(),
});

export const auditRouter = Router();
auditRouter.use(requireAuth);

// The audit trail is read-only over the API by design: there is no
// endpoint that edits or deletes an entry.
auditRouter.get(
  "/",
  requirePermission("audit:read"),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, perPage, entity, action, actorId } = req.query as unknown as z.infer<
        typeof listQuery
      >;
      const where = {
        ...(entity ? { entity } : {}),
        ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
        ...(actorId ? { actorId } : {}),
      };

      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...skipTake({ page, perPage }),
          include: { actor: { select: { id: true, name: true, email: true } } },
        }),
        prisma.auditLog.count({ where }),
      ]);
      res.json(paginated(items, total, { page, perPage }));
    } catch (err) {
      next(err);
    }
  }
);

import { Router, type Request } from "express";
import { z, type ZodType } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "./audit.js";
import { NotFoundError } from "./errors.js";
import { paginated, skipTake } from "./pagination.js";
import { param } from "./params.js";

/** Minimal shape of a Prisma model delegate, so the factory stays typed-ish. */
interface Delegate {
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown | null>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
}

export interface CrudConfig {
  /** Human name used in errors, e.g. "Programme". */
  name: string;
  delegate: Delegate;
  permissions: { read: string; write: string; remove?: string; publish?: string };
  createSchema: ZodType;
  updateSchema: ZodType;
  /** Text columns offered to the search box. */
  searchFields?: string[];
  defaultOrderBy?: Record<string, "asc" | "desc">;
  /** Adds publish and unpublish endpoints and a status filter. */
  publishable?: boolean;
  include?: Record<string, unknown>;
}

const idParam = z.object({ id: z.string().min(1) });

export function createCrudRouter(cfg: CrudConfig): Router {
  const router = Router();
  const entity = cfg.name;
  const orderBy = cfg.defaultOrderBy ?? { createdAt: "desc" as const };

  const listQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  });

  // Everything below requires a session.
  router.use(requireAuth);

  router.get(
    "/",
    requirePermission(cfg.permissions.read),
    validate({ query: listQuery }),
    async (req, res, next) => {
      try {
        const { page, perPage, search, status } = req.query as unknown as z.infer<typeof listQuery>;

        const where: Record<string, unknown> = {};
        if (status && cfg.publishable) where.status = status;
        if (search && cfg.searchFields?.length) {
          where.OR = cfg.searchFields.map((f) => ({
            [f]: { contains: search, mode: "insensitive" },
          }));
        }

        const [items, total] = await Promise.all([
          cfg.delegate.findMany({ where, orderBy, ...skipTake({ page, perPage }), include: cfg.include }),
          cfg.delegate.count({ where }),
        ]);

        res.json(paginated(items, total, { page, perPage }));
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id",
    requirePermission(cfg.permissions.read),
    validate({ params: idParam }),
    async (req, res, next) => {
      try {
        const found = await cfg.delegate.findUnique({
          where: { id: param(req, "id") },
          include: cfg.include,
        });
        if (!found) throw new NotFoundError(entity);
        res.json({ item: found });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/",
    requirePermission(cfg.permissions.write),
    validate({ body: cfg.createSchema }),
    async (req: Request, res, next) => {
      try {
        const created = (await cfg.delegate.create({ data: req.body })) as { id: string };
        await writeAudit(req, {
          action: `${entity.toLowerCase()}.create`,
          entity,
          entityId: created.id,
          after: created,
        });
        res.status(201).json({ item: created });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/:id",
    requirePermission(cfg.permissions.write),
    validate({ params: idParam, body: cfg.updateSchema }),
    async (req, res, next) => {
      try {
        const before = await cfg.delegate.findUnique({ where: { id: param(req, "id") } });
        if (!before) throw new NotFoundError(entity);

        const after = await cfg.delegate.update({
          where: { id: param(req, "id") },
          data: req.body,
        });
        await writeAudit(req, {
          action: `${entity.toLowerCase()}.update`,
          entity,
          entityId: param(req, "id"),
          before,
          after,
        });
        res.json({ item: after });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/:id",
    requirePermission(cfg.permissions.remove ?? cfg.permissions.write),
    validate({ params: idParam }),
    async (req, res, next) => {
      try {
        const before = await cfg.delegate.findUnique({ where: { id: param(req, "id") } });
        if (!before) throw new NotFoundError(entity);

        await cfg.delegate.delete({ where: { id: param(req, "id") } });
        await writeAudit(req, {
          action: `${entity.toLowerCase()}.delete`,
          entity,
          entityId: param(req, "id"),
          before,
        });
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  if (cfg.publishable) {
    const setStatus = (status: "PUBLISHED" | "DRAFT") =>
      async (req: Request, res: import("express").Response, next: import("express").NextFunction) => {
        try {
          const before = await cfg.delegate.findUnique({ where: { id: param(req, "id") } });
          if (!before) throw new NotFoundError(entity);

          const after = await cfg.delegate.update({
            where: { id: param(req, "id") },
            data: {
              status,
              ...("publishedAt" in (before as object)
                ? { publishedAt: status === "PUBLISHED" ? new Date() : null }
                : {}),
            },
          });
          await writeAudit(req, {
            action: `${entity.toLowerCase()}.${status === "PUBLISHED" ? "publish" : "unpublish"}`,
            entity,
            entityId: param(req, "id"),
            before,
            after,
          });
          res.json({ item: after });
        } catch (err) {
          next(err);
        }
      };

    const publishPerm = cfg.permissions.publish ?? cfg.permissions.write;
    router.post("/:id/publish", requirePermission(publishPerm), validate({ params: idParam }), setStatus("PUBLISHED"));
    router.post("/:id/unpublish", requirePermission(publishPerm), validate({ params: idParam }), setStatus("DRAFT"));
  }

  return router;
}

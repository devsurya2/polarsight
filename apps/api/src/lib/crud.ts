import { Router, type NextFunction, type Request, type Response } from "express";
import { z, type ZodType } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "./audit.js";
import { BadRequestError, NotFoundError } from "./errors.js";
import { paginated, skipTake } from "./pagination.js";
import { param } from "./params.js";
import { prisma } from "./prisma.js";
import { snapshot, type VersionedEntity } from "./versioning.js";
import { revalidateInBackground } from "./revalidate.js";

/** Minimal shape of a Prisma model delegate, so the factory stays typed-ish. */
interface Delegate {
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown | null>;
  findFirst(args?: unknown): Promise<unknown | null>;
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
  /** Columns a caller may sort by. Anything else is refused. */
  sortableFields?: string[];
  /** Adds publish, unpublish, archive and a status filter. */
  publishable?: boolean;
  /** Adds POST /reorder, for sortOrder-bearing models. */
  reorderable?: boolean;
  /** Keeps version history for this entity. */
  versioned?: VersionedEntity;
  include?: Record<string, unknown>;
  /**
   * Refuses a write when it returns a message. Used to protect rows
   * the API must not let an editor change, e.g. locked content.
   */
  guardWrite?: (row: Record<string, unknown>, action: "update" | "delete") => string | null;
  /**
   * Refuses a publish when it returns a message. Separate from
   * guardWrite because the bar for putting something on the public
   * site is higher than the bar for editing a draft.
   */
  guardPublish?: (row: Record<string, unknown>) => string | null;
  /** Last chance to adjust or validate a payload before it is written. */
  beforeWrite?: (
    data: Record<string, unknown>,
    ctx: { req: Request; existing: Record<string, unknown> | null }
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

const idParam = z.object({ id: z.string().min(1) });

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

const reorderSchema = z
  .object({
    items: z
      .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0).max(9999) }))
      .min(1)
      .max(500),
  })
  .strict();

export function createCrudRouter(cfg: CrudConfig): Router {
  const router = Router();
  const entity = cfg.name;
  const slug = entity.toLowerCase();
  const defaultOrder = cfg.defaultOrderBy ?? { createdAt: "desc" as const };

  const listQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    status: z.enum(STATUSES).optional(),
    sort: z.string().trim().max(60).optional(),
    dir: z.enum(["asc", "desc"]).default("asc"),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  });

  /** Only a whitelisted column may be sorted on, never caller input. */
  const orderFor = (sort?: string, dir: "asc" | "desc" = "asc") => {
    if (!sort) return defaultOrder;
    if (!cfg.sortableFields?.includes(sort)) {
      throw new BadRequestError(
        `Cannot sort by "${sort}". Allowed: ${(cfg.sortableFields ?? []).join(", ") || "none"}`
      );
    }
    return { [sort]: dir };
  };

  const fetchRow = async (id: string) =>
    (await cfg.delegate.findUnique({ where: { id } })) as Record<string, unknown> | null;

  const guard = (row: Record<string, unknown>, action: "update" | "delete") => {
    const message = cfg.guardWrite?.(row, action);
    if (message) throw new BadRequestError(message);
  };

  // Everything below requires a session.
  router.use(requireAuth);

  router.get(
    "/",
    requirePermission(cfg.permissions.read),
    validate({ query: listQuery }),
    async (req, res, next) => {
      try {
        const { page, perPage, search, status, sort, dir, from, to } =
          req.query as unknown as z.infer<typeof listQuery>;

        const where: Record<string, unknown> = {};
        if (status && cfg.publishable) where.status = status;
        if (from || to) {
          where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
        }
        if (search && cfg.searchFields?.length) {
          where.OR = cfg.searchFields.map((f) => ({
            [f]: { contains: search, mode: "insensitive" },
          }));
        }

        const [items, total] = await Promise.all([
          cfg.delegate.findMany({
            where,
            orderBy: orderFor(sort, dir),
            ...skipTake({ page, perPage }),
            include: cfg.include,
          }),
          cfg.delegate.count({ where }),
        ]);

        res.json(paginated(items, total, { page, perPage }));
      } catch (err) {
        next(err);
      }
    }
  );

  if (cfg.reorderable) {
    // Registered before "/:id" so "reorder" is not read as an id.
    router.post(
      "/reorder",
      requirePermission(cfg.permissions.write),
      validate({ body: reorderSchema }),
      async (req, res, next) => {
        try {
          const { items } = req.body as z.infer<typeof reorderSchema>;

          // One transaction, so a partial reorder cannot leave the
          // list in an order nobody chose.
          await prisma.$transaction(
            items.map((i) =>
              (cfg.delegate as unknown as {
                update(a: unknown): Promise<unknown>;
              }).update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } })
            ) as never
          );

          await writeAudit(req, {
            action: `${slug}.reorder`,
            entity,
            after: { count: items.length },
          });
          res.json({ updated: items.length });
        } catch (err) {
          next(err);
        }
      }
    );
  }

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
        const data = cfg.beforeWrite
          ? await cfg.beforeWrite(req.body, { req, existing: null })
          : req.body;

        const created = (await cfg.delegate.create({ data, include: cfg.include })) as {
          id: string;
        };
        await writeAudit(req, {
          action: `${slug}.create`,
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
        const id = param(req, "id");
        const before = await fetchRow(id);
        if (!before) throw new NotFoundError(entity);
        guard(before, "update");

        const data = cfg.beforeWrite
          ? await cfg.beforeWrite(req.body, { req, existing: before })
          : req.body;

        const after = await cfg.delegate.update({ where: { id }, data, include: cfg.include });
        await writeAudit(req, {
          action: `${slug}.update`,
          entity,
          entityId: id,
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
        const id = param(req, "id");
        const before = await fetchRow(id);
        if (!before) throw new NotFoundError(entity);
        guard(before, "delete");

        // Deleting published content takes it off the public site, so
        // it has to be unpublished first. That makes the removal a
        // deliberate two-step action rather than one careless click.
        if (cfg.publishable && before.status === "PUBLISHED") {
          throw new BadRequestError(
            `This ${slug} is published. Unpublish or archive it before deleting.`
          );
        }

        await cfg.delegate.delete({ where: { id } });
        await writeAudit(req, {
          action: `${slug}.delete`,
          entity,
          entityId: id,
          before,
        });
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  if (cfg.publishable) {
    const transition =
      (status: (typeof STATUSES)[number]) =>
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const id = param(req, "id");
          const before = await fetchRow(id);
          if (!before) throw new NotFoundError(entity);
          guard(before, "update");

          if (status === "PUBLISHED") {
            const refusal = cfg.guardPublish?.(before);
            if (refusal) throw new BadRequestError(refusal);
          }

          const data: Record<string, unknown> = { status };
          if ("publishedAt" in before) {
            data.publishedAt = status === "PUBLISHED" ? new Date() : null;
          }
          if ("archivedAt" in before) {
            data.archivedAt = status === "ARCHIVED" ? new Date() : null;
          }

          const after = await cfg.delegate.update({ where: { id }, data, include: cfg.include });

          // A publish is the moment worth being able to roll back to.
          if (cfg.versioned && status === "PUBLISHED") {
            await snapshot({
              entity: cfg.versioned,
              entityId: id,
              payload: after,
              label: "Published",
              actorId: req.user?.id,
            });
          }

          // Anything entering or leaving the public site changes what
          // a visitor sees, so the website is told to drop its cache.
          revalidateInBackground(["site-content", slug]);

          const verb =
            status === "PUBLISHED" ? "publish" : status === "ARCHIVED" ? "archive" : "unpublish";
          await writeAudit(req, {
            action: `${slug}.${verb}`,
            entity,
            entityId: id,
            before: { status: before.status },
            after: { status },
          });
          res.json({ item: after });
        } catch (err) {
          next(err);
        }
      };

    const publishPerm = cfg.permissions.publish ?? cfg.permissions.write;
    const gate = [requirePermission(publishPerm), validate({ params: idParam })] as const;

    router.post("/:id/publish", ...gate, transition("PUBLISHED"));
    router.post("/:id/unpublish", ...gate, transition("DRAFT"));
    router.post("/:id/archive", ...gate, transition("ARCHIVED"));
    // Named "unarchive" rather than "restore" on purpose: a module may
    // also offer /:id/restore to roll back to an earlier *version*,
    // and two different meanings on one path would shadow each other.
    router.post("/:id/unarchive", ...gate, transition("DRAFT"));
  }

  return router;
}

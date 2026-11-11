/**
 * Curriculum builder.
 *
 * Mounted at /api/programmes/:programmeId/modules, so a module is
 * always addressed through the programme that owns it. Every handler
 * re-checks that ownership rather than trusting the id in the path,
 * which stops a module being moved between programmes by editing a URL.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { writeAudit } from "../../lib/audit.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { requiredSafeText, safeText } from "../../lib/sanitize.js";

const moduleBase = {
  title: requiredSafeText(240, "Module title"),
  summary: safeText(2_000, "Module summary").nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
};

const topicBase = {
  title: requiredSafeText(240, "Topic title"),
  description: safeText(2_000, "Topic description").nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
};

const createModuleSchema = z.object(moduleBase).strict();
const updateModuleSchema = z.object(moduleBase).partial().strict();
const createTopicSchema = z.object(topicBase).strict();
const updateTopicSchema = z.object(topicBase).partial().strict();

const reorderSchema = z
  .object({
    items: z
      .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0).max(999) }))
      .min(1)
      .max(200),
  })
  .strict();

const moduleInclude = { topics: { orderBy: { sortOrder: "asc" as const } } };

// mergeParams, so :programmeId from the parent router is visible here.
export const curriculumRouter = Router({ mergeParams: true });
curriculumRouter.use(requireAuth);

/** The programme in the path must exist; returns its id. */
async function requireProgramme(req: import("express").Request): Promise<string> {
  const programmeId = (req.params as Record<string, string | undefined>).programmeId;
  if (!programmeId) throw new BadRequestError("Programme id is missing from the path");

  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true },
  });
  if (!programme) throw new NotFoundError("Programme");
  return programme.id;
}

/** A module, confirmed to belong to the programme in the path. */
async function requireOwnedModule(req: import("express").Request) {
  const programmeId = await requireProgramme(req);
  const moduleId = (req.params as Record<string, string | undefined>).moduleId;
  if (!moduleId) throw new BadRequestError("Module id is missing from the path");

  const found = await prisma.curriculumModule.findFirst({
    where: { id: moduleId, programmeId },
    include: moduleInclude,
  });
  if (!found) throw new NotFoundError("Module");
  return found;
}

/* ── Modules ─────────────────────────────────────────────────── */

curriculumRouter.get("/", requirePermission("programme:read"), async (req, res, next) => {
  try {
    const programmeId = await requireProgramme(req);
    const items = await prisma.curriculumModule.findMany({
      where: { programmeId },
      orderBy: { sortOrder: "asc" },
      include: moduleInclude,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Before "/:moduleId", so "reorder" is not read as an id.
curriculumRouter.post(
  "/reorder",
  requirePermission("programme:write"),
  validate({ body: reorderSchema }),
  async (req, res, next) => {
    try {
      const programmeId = await requireProgramme(req);
      const { items } = req.body as z.infer<typeof reorderSchema>;

      // Scoped to this programme, so a stray id cannot reorder
      // somebody else's curriculum.
      const owned = await prisma.curriculumModule.findMany({
        where: { programmeId, id: { in: items.map((i) => i.id) } },
        select: { id: true },
      });
      if (owned.length !== items.length) {
        throw new BadRequestError("One or more modules do not belong to this programme");
      }

      await prisma.$transaction(
        items.map((i) =>
          prisma.curriculumModule.update({
            where: { id: i.id },
            data: { sortOrder: i.sortOrder },
          })
        )
      );

      await writeAudit(req, {
        action: "curriculum.reorder_modules",
        entity: "CurriculumModule",
        entityId: programmeId,
        after: { count: items.length },
      });
      res.json({ updated: items.length });
    } catch (err) {
      next(err);
    }
  }
);

curriculumRouter.post(
  "/",
  requirePermission("programme:write"),
  validate({ body: createModuleSchema }),
  async (req, res, next) => {
    try {
      const programmeId = await requireProgramme(req);

      // Default to the end of the list when no order is given, so
      // adding a module never silently reshuffles the curriculum.
      const body = req.body as z.infer<typeof createModuleSchema>;
      const sortOrder =
        body.sortOrder ||
        (await prisma.curriculumModule.count({ where: { programmeId } }));

      const created = await prisma.curriculumModule.create({
        data: { ...body, sortOrder, programmeId },
        include: moduleInclude,
      });

      await writeAudit(req, {
        action: "curriculum.module_create",
        entity: "CurriculumModule",
        entityId: created.id,
        after: { programmeId, title: created.title },
      });
      res.status(201).json({ item: created });
    } catch (err) {
      next(err);
    }
  }
);

curriculumRouter.patch(
  "/:moduleId",
  requirePermission("programme:write"),
  validate({ body: updateModuleSchema }),
  async (req, res, next) => {
    try {
      const before = await requireOwnedModule(req);
      const after = await prisma.curriculumModule.update({
        where: { id: before.id },
        data: req.body,
        include: moduleInclude,
      });
      await writeAudit(req, {
        action: "curriculum.module_update",
        entity: "CurriculumModule",
        entityId: before.id,
        before,
        after,
      });
      res.json({ item: after });
    } catch (err) {
      next(err);
    }
  }
);

/** Publishing a module makes it visible in the public curriculum. */
for (const [path, status] of [
  ["publish", "PUBLISHED"],
  ["unpublish", "DRAFT"],
] as const) {
  curriculumRouter.post(
    `/:moduleId/${path}`,
    requirePermission("programme:publish"),
    async (req, res, next) => {
      try {
        const before = await requireOwnedModule(req);
        const after = await prisma.curriculumModule.update({
          where: { id: before.id },
          data: { status },
          include: moduleInclude,
        });
        await writeAudit(req, {
          action: `curriculum.module_${path}`,
          entity: "CurriculumModule",
          entityId: before.id,
          before: { status: before.status },
          after: { status },
        });
        res.json({ item: after });
      } catch (err) {
        next(err);
      }
    }
  );
}

curriculumRouter.delete(
  "/:moduleId",
  requirePermission("programme:write"),
  async (req, res, next) => {
    try {
      const before = await requireOwnedModule(req);

      // Topics cascade with the module, so say so plainly in the log.
      await prisma.curriculumModule.delete({ where: { id: before.id } });
      await writeAudit(req, {
        action: "curriculum.module_delete",
        entity: "CurriculumModule",
        entityId: before.id,
        before: { title: before.title, topicCount: before.topics.length },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/* ── Topics ──────────────────────────────────────────────────── */

curriculumRouter.post(
  "/:moduleId/topics/reorder",
  requirePermission("programme:write"),
  validate({ body: reorderSchema }),
  async (req, res, next) => {
    try {
      const mod = await requireOwnedModule(req);
      const { items } = req.body as z.infer<typeof reorderSchema>;

      const ownedIds = new Set(mod.topics.map((t) => t.id));
      if (items.some((i) => !ownedIds.has(i.id))) {
        throw new BadRequestError("One or more topics do not belong to this module");
      }

      await prisma.$transaction(
        items.map((i) =>
          prisma.curriculumTopic.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } })
        )
      );
      res.json({ updated: items.length });
    } catch (err) {
      next(err);
    }
  }
);

curriculumRouter.post(
  "/:moduleId/topics",
  requirePermission("programme:write"),
  validate({ body: createTopicSchema }),
  async (req, res, next) => {
    try {
      const mod = await requireOwnedModule(req);
      const body = req.body as z.infer<typeof createTopicSchema>;

      const created = await prisma.curriculumTopic.create({
        data: { ...body, sortOrder: body.sortOrder || mod.topics.length, moduleId: mod.id },
      });
      await writeAudit(req, {
        action: "curriculum.topic_create",
        entity: "CurriculumTopic",
        entityId: created.id,
        after: { moduleId: mod.id, title: created.title },
      });
      res.status(201).json({ item: created });
    } catch (err) {
      next(err);
    }
  }
);

curriculumRouter.patch(
  "/:moduleId/topics/:topicId",
  requirePermission("programme:write"),
  validate({ body: updateTopicSchema }),
  async (req, res, next) => {
    try {
      const mod = await requireOwnedModule(req);
      const topicId = (req.params as Record<string, string | undefined>).topicId;
      const before = mod.topics.find((t) => t.id === topicId);
      if (!before) throw new NotFoundError("Topic");

      const after = await prisma.curriculumTopic.update({
        where: { id: before.id },
        data: req.body,
      });
      await writeAudit(req, {
        action: "curriculum.topic_update",
        entity: "CurriculumTopic",
        entityId: before.id,
        before,
        after,
      });
      res.json({ item: after });
    } catch (err) {
      next(err);
    }
  }
);

curriculumRouter.delete(
  "/:moduleId/topics/:topicId",
  requirePermission("programme:write"),
  async (req, res, next) => {
    try {
      const mod = await requireOwnedModule(req);
      const topicId = (req.params as Record<string, string | undefined>).topicId;
      const before = mod.topics.find((t) => t.id === topicId);
      if (!before) throw new NotFoundError("Topic");

      await prisma.curriculumTopic.delete({ where: { id: before.id } });
      await writeAudit(req, {
        action: "curriculum.topic_delete",
        entity: "CurriculumTopic",
        entityId: before.id,
        before: { title: before.title },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

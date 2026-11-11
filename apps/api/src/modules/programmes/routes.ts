import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { USABLE_MEDIA } from "../../lib/quarantine.js";
import { createCrudRouter } from "../../lib/crud.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { writeAudit } from "../../lib/audit.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { param } from "../../lib/params.js";
import { requiredSafeText, safeText, safeTextList } from "../../lib/sanitize.js";
import { getVersion, listVersions, snapshot } from "../../lib/versioning.js";
import { curriculumRouter } from "./curriculum.js";

const idParam = z.object({ id: z.string().min(1) });

const base = {
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only"),
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and hyphens only"),
  name: requiredSafeText(160, "Name"),
  tag: requiredSafeText(80, "Category"),
  summary: requiredSafeText(600, "Summary"),
  body: safeText(20_000, "Full description").nullish(),

  durationWeeks: z.coerce.number().int().min(1).max(260).nullish(),
  level: safeText(60, "Level").nullish(),

  points: safeTextList(20, 300, "Bullet point").default([]),
  objectives: safeTextList(30, 400, "Objective").default([]),
  targetAudience: safeTextList(20, 300, "Audience").default([]),
  eligibility: safeTextList(20, 300, "Eligibility requirement").default([]),
  prerequisites: safeTextList(20, 300, "Prerequisite").default([]),
  tools: safeTextList(60, 120, "Tool").default([]),
  exercises: safeTextList(40, 400, "Exercise").default([]),
  projects: safeTextList(30, 400, "Project").default([]),
  learningOutcomes: safeTextList(30, 400, "Learning outcome").default([]),
  careerPathways: safeTextList(20, 200, "Career pathway").default([]),

  seoTitle: safeText(200, "SEO title").nullish(),
  seoDescription: safeText(400, "SEO description").nullish(),

  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  imageId: z.string().min(1).nullish(),
};

const detailInclude = {
  image: { select: { id: true, url: true, alt: true, width: true, height: true } },
  gallery: {
    orderBy: { sortOrder: "asc" as const },
    include: { media: { select: { id: true, url: true, alt: true, title: true } } },
  },
  modules: {
    orderBy: { sortOrder: "asc" as const },
    include: { topics: { orderBy: { sortOrder: "asc" as const } } },
  },
  _count: { select: { modules: true } },
};

/** The generic CRUD screen, plus everything programme-specific below. */
export const programmesRouter = createCrudRouter({
  name: "Programme",
  delegate: prisma.programme,
  permissions: {
    read: "programme:read",
    write: "programme:write",
    remove: "programme:delete",
    publish: "programme:publish",
  },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["name", "code", "tag", "summary"],
  defaultOrderBy: { sortOrder: "asc" },
  sortableFields: ["sortOrder", "name", "code", "createdAt", "updatedAt"],
  publishable: true,
  reorderable: true,
  versioned: "Programme",
  include: detailInclude,
  async beforeWrite(data) {
    // A cover image must exist and must not be applicant data.
    if (typeof data.imageId === "string") {
      const image = await prisma.mediaAsset.findFirst({
        where: { id: data.imageId, ...USABLE_MEDIA, mimeType: { startsWith: "image/" } },
        select: { id: true },
      });
      if (!image) throw new BadRequestError("That cover image is not in the media library");
    }
    return data;
  },
});

/* ── Curriculum (modules and topics) ─────────────────────────── */

programmesRouter.use("/:programmeId/modules", curriculumRouter);

/* ── Programme-specific routes ───────────────────────────────── */

const extras = Router();
extras.use(requireAuth);

/**
 * Duplicates a programme, its curriculum and its gallery.
 *
 * The copy is always a draft with a fresh slug and code, so creating
 * one can never put unreviewed content on the public site.
 */
extras.post(
  "/:id/duplicate",
  requirePermission("programme:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const source = await prisma.programme.findUnique({
        where: { id },
        include: {
          modules: { include: { topics: true }, orderBy: { sortOrder: "asc" } },
          gallery: true,
        },
      });
      if (!source) throw new NotFoundError("Programme");

      const suffix = await uniqueSuffix(source.slug, source.code);

      const copy = await prisma.$transaction(async (tx) => {
        const created = await tx.programme.create({
          data: {
            slug: `${source.slug}-${suffix}`,
            code: `${source.code}-${suffix.toUpperCase()}`,
            name: `${source.name} (copy)`,
            tag: source.tag,
            summary: source.summary,
            body: source.body,
            durationWeeks: source.durationWeeks,
            level: source.level,
            points: source.points,
            objectives: source.objectives,
            targetAudience: source.targetAudience,
            eligibility: source.eligibility,
            prerequisites: source.prerequisites,
            tools: source.tools,
            exercises: source.exercises,
            projects: source.projects,
            learningOutcomes: source.learningOutcomes,
            careerPathways: source.careerPathways,
            seoTitle: source.seoTitle,
            seoDescription: source.seoDescription,
            imageId: source.imageId,
            sortOrder: source.sortOrder + 1,
            // Never inherit published state.
            status: "DRAFT",
            publishedAt: null,
          },
        });

        for (const m of source.modules) {
          await tx.curriculumModule.create({
            data: {
              programmeId: created.id,
              title: m.title,
              summary: m.summary,
              status: m.status,
              sortOrder: m.sortOrder,
              topics: {
                create: m.topics
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((t) => ({
                    title: t.title,
                    description: t.description,
                    sortOrder: t.sortOrder,
                  })),
              },
            },
          });
        }

        if (source.gallery.length) {
          await tx.programmeImage.createMany({
            data: source.gallery.map((g) => ({
              programmeId: created.id,
              mediaId: g.mediaId,
              sortOrder: g.sortOrder,
            })),
          });
        }

        return created;
      });

      await writeAudit(req, {
        action: "programme.duplicate",
        entity: "Programme",
        entityId: copy.id,
        after: { from: source.slug, to: copy.slug },
      });

      res.status(201).json({
        item: await prisma.programme.findUnique({ where: { id: copy.id }, include: detailInclude }),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Finds a slug and code suffix that are both free. */
async function uniqueSuffix(slug: string, code: string): Promise<string> {
  for (let n = 2; n < 50; n += 1) {
    const candidate = `copy-${n}`;
    const clash = await prisma.programme.findFirst({
      where: {
        OR: [{ slug: `${slug}-${candidate}` }, { code: `${code}-${candidate.toUpperCase()}` }],
      },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new BadRequestError("Too many copies of that programme already exist");
}

/* ── Gallery ─────────────────────────────────────────────────── */

const gallerySchema = z
  .object({
    mediaIds: z.array(z.string().min(1)).max(20),
  })
  .strict();

extras.put(
  "/:id/gallery",
  requirePermission("programme:write"),
  validate({ params: idParam, body: gallerySchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const programme = await prisma.programme.findUnique({ where: { id }, select: { id: true } });
      if (!programme) throw new NotFoundError("Programme");

      const { mediaIds } = req.body as z.infer<typeof gallerySchema>;
      const unique = [...new Set(mediaIds)];

      if (unique.length) {
        const found = await prisma.mediaAsset.findMany({
          where: { id: { in: unique }, ...USABLE_MEDIA, mimeType: { startsWith: "image/" } },
          select: { id: true },
        });
        if (found.length !== unique.length) {
          throw new BadRequestError("One or more images are not in the media library");
        }
      }

      await prisma.$transaction([
        prisma.programmeImage.deleteMany({ where: { programmeId: id } }),
        ...(unique.length
          ? [
              prisma.programmeImage.createMany({
                data: unique.map((mediaId, i) => ({ programmeId: id, mediaId, sortOrder: i })),
              }),
            ]
          : []),
      ]);

      await writeAudit(req, {
        action: "programme.gallery_updated",
        entity: "Programme",
        entityId: id,
        after: { count: unique.length },
      });

      res.json({
        item: await prisma.programme.findUnique({ where: { id }, include: detailInclude }),
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Version history ─────────────────────────────────────────── */

extras.get(
  "/:id/versions",
  requirePermission("programme:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      res.json({ items: await listVersions("Programme", param(req, "id")) });
    } catch (err) {
      next(err);
    }
  }
);

extras.post(
  "/:id/snapshot",
  requirePermission("programme:write"),
  validate({ params: idParam, body: z.object({ label: safeText(120, "Label").optional() }).strict() }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const programme = await prisma.programme.findUnique({
        where: { id },
        include: { modules: { include: { topics: true } } },
      });
      if (!programme) throw new NotFoundError("Programme");

      const created = await snapshot({
        entity: "Programme",
        entityId: id,
        payload: programme,
        label: (req.body as { label?: string }).label ?? "Manual snapshot",
        actorId: req.user?.id,
      });
      res.status(201).json({ item: created });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Restores a snapshot of a programme's own fields.
 *
 * The programme is forced back to DRAFT, so a restore never changes
 * the live site by itself. Curriculum is not overwritten: modules and
 * topics are separate records with their own history, and silently
 * replacing them would destroy work nobody asked to discard.
 */
extras.post(
  "/:id/restore",
  requirePermission("version:restore"),
  validate({ params: idParam, body: z.object({ version: z.coerce.number().int().min(1) }).strict() }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.programme.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Programme");

      const version = Number((req.body as { version: number }).version);
      const snap = await getVersion("Programme", id, version);
      const p = snap.payload as Record<string, unknown>;

      const restorable = [
        "name", "tag", "summary", "body", "durationWeeks", "level", "points",
        "objectives", "targetAudience", "eligibility", "prerequisites", "tools",
        "exercises", "projects", "learningOutcomes", "careerPathways",
        "seoTitle", "seoDescription",
      ] as const;

      const data: Record<string, unknown> = { status: "DRAFT", publishedAt: null };
      for (const field of restorable) {
        if (field in p) data[field] = p[field];
      }

      const after = await prisma.programme.update({ where: { id }, data, include: detailInclude });

      await writeAudit(req, {
        action: "programme.restore",
        entity: "Programme",
        entityId: id,
        before,
        after: { restoredFromVersion: version },
      });

      res.json({
        item: after,
        note: "Restored into draft and unpublished. Review it, then publish to make it live.",
      });
    } catch (err) {
      next(err);
    }
  }
);

programmesRouter.use("/", extras);

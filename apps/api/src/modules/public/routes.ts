/**
 * Public, unauthenticated, read-only.
 *
 * Three rules hold everywhere in this file:
 *
 *  1. Every query filters on PUBLISHED. No endpoint here accepts a
 *     status from the caller, so an unpublished record cannot be
 *     requested — a draft is indistinguishable from a missing one.
 *  2. Every response is built from an explicit `select`. Nothing is
 *     returned by spreading a row, so a column added later is not
 *     exposed by accident.
 *  3. Internal fields — notes, assignees, applicant data, source IPs,
 *     verification notes, draft columns — are never selected.
 *
 * The one exception is the preview route, which renders a draft and
 * requires a signed, short-lived token issued to an authenticated
 * administrator.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { USABLE_MEDIA } from "../../lib/quarantine.js";
import { param } from "../../lib/params.js";
import { NotFoundError } from "../../lib/errors.js";
import { validate } from "../../middleware/validate.js";
import { isPageKey, PAGE_KEYS } from "../pages/schema.js";
import { verifyPreviewToken } from "../pages/routes.js";

export const publicRouter = Router();

const PUBLISHED = { status: "PUBLISHED" } as const;

// Cached briefly: the marketing site is read-heavy and this content
// changes rarely. stale-while-revalidate keeps it serving during a
// regeneration rather than blocking on one.
publicRouter.use((req, res, next) => {
  // Only reads are cacheable. The form endpoints share this prefix
  // and must never be marked public-cacheable.
  res.setHeader(
    "Cache-Control",
    req.method === "GET" || req.method === "HEAD"
      ? "public, max-age=60, stale-while-revalidate=300"
      : "no-store"
  );
  next();
});

/* ── Keyed content blocks ────────────────────────────────────── */

/** `value` only. `draftValue` is never selected here. */
const contentSelect = { key: true, section: true, type: true, value: true } as const;

publicRouter.get("/content", async (_req, res, next) => {
  try {
    const rows = await prisma.websiteContent.findMany({
      where: PUBLISHED,
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
      select: contentSelect,
    });
    res.json({ content: keyed(rows) });
  } catch (err) {
    next(err);
  }
});

/* ── Pages ───────────────────────────────────────────────────── */

const pageSelect = {
  key: true,
  title: true,
  seoTitle: true,
  seoDescription: true,
  published: true,
  publishedAt: true,
  seoImage: { select: { url: true, alt: true, width: true, height: true } },
} as const;

publicRouter.get("/pages", async (_req, res, next) => {
  try {
    const rows = await prisma.sitePage.findMany({ where: PUBLISHED, select: pageSelect });
    const assets = await withImages(rows, (r) => r.published);
    res.json({ pages: Object.fromEntries(rows.map((p) => [p.key, shapePage(p, assets)])) });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/pages/:key", async (req, res, next) => {
  try {
    const key = param(req, "key");
    if (!isPageKey(key)) throw new NotFoundError("Page");

    const page = await prisma.sitePage.findFirst({
      where: { key, ...PUBLISHED },
      select: pageSelect,
    });
    if (!page) throw new NotFoundError("Page");
    const assets = await withImages([page], (r) => r.published);
    res.json({ item: shapePage(page, assets) });
  } catch (err) {
    next(err);
  }
});

/**
 * Draft preview.
 *
 * Requires a token signed by the API for an authenticated editor and
 * valid for ten minutes. Without a valid token this returns 404, the
 * same as any other unpublished content. Never cached.
 */
const previewQuery = z.object({
  token: z.string().min(1).max(200),
  expires: z.coerce.number().int(),
});

publicRouter.get(
  "/pages/:key/preview",
  validate({ query: previewQuery }),
  async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");

      const key = param(req, "key");
      const { token, expires } = req.query as unknown as z.infer<typeof previewQuery>;

      if (!isPageKey(key) || !verifyPreviewToken(key, token, expires)) {
        throw new NotFoundError("Page");
      }

      const page = await prisma.sitePage.findUnique({
        where: { key },
        select: { ...pageSelect, draft: true, status: true },
      });
      if (!page) throw new NotFoundError("Page");

      const assets = await withImages([page], (r) => r.draft);

      // The draft, explicitly flagged so a preview can never be
      // mistaken for the live page.
      res.json({
        item: {
          key: page.key,
          title: page.title,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          content: resolveImages(page.draft, assets),
          seoImage: page.seoImage,
          isPreview: true,
          status: page.status,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Programmes ──────────────────────────────────────────────── */

const programmeCardSelect = {
  slug: true,
  code: true,
  name: true,
  tag: true,
  summary: true,
  durationWeeks: true,
  level: true,
  points: true,
  image: { select: { url: true, alt: true, width: true, height: true } },
} as const;

const programmeDetailSelect = {
  ...programmeCardSelect,
  body: true,
  objectives: true,
  targetAudience: true,
  eligibility: true,
  prerequisites: true,
  tools: true,
  exercises: true,
  projects: true,
  learningOutcomes: true,
  careerPathways: true,
  seoTitle: true,
  seoDescription: true,
  gallery: {
    orderBy: { sortOrder: "asc" as const },
    select: { media: { select: { url: true, alt: true, width: true, height: true } } },
  },
  // Only published modules, and only their public fields.
  modules: {
    where: PUBLISHED,
    orderBy: { sortOrder: "asc" as const },
    select: {
      title: true,
      summary: true,
      topics: {
        orderBy: { sortOrder: "asc" as const },
        select: { title: true, description: true },
      },
    },
  },
} as const;

publicRouter.get("/programmes", async (_req, res, next) => {
  try {
    const items = await prisma.programme.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: "asc" },
      select: programmeCardSelect,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/programmes/:slug", async (req, res, next) => {
  try {
    const item = await prisma.programme.findFirst({
      where: { slug: param(req, "slug"), ...PUBLISHED },
      select: programmeDetailSelect,
    });
    // A draft is indistinguishable from a missing record here, on purpose.
    if (!item) throw new NotFoundError("Programme");

    res.json({
      item: {
        ...item,
        gallery: item.gallery.map((g) => g.media),
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── Careers ─────────────────────────────────────────────────── */

const jobSelect = {
  slug: true,
  title: true,
  department: true,
  employmentType: true,
  location: true,
  workMode: true,
  description: true,
  responsibilities: true,
  requiredSkills: true,
  preferredQualifications: true,
  certifications: true,
  experienceMinYears: true,
  experienceNote: true,
  applicationInstructions: true,
  applicationDeadline: true,
  publishedAt: true,
} as const;

/**
 * Open positions.
 *
 * An opening whose deadline has passed is not "open", so it is
 * filtered out here as well as by status. Nothing about applications
 * — counts included — is exposed: how many people applied for a role
 * is internal.
 */
publicRouter.get("/jobs", async (_req, res, next) => {
  try {
    const items = await prisma.jobOpening.findMany({
      where: {
        ...PUBLISHED,
        OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, ...jobSelect },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/jobs/:slug", async (req, res, next) => {
  try {
    const item = await prisma.jobOpening.findFirst({
      where: {
        slug: param(req, "slug"),
        ...PUBLISHED,
        OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
      },
      select: { id: true, ...jobSelect, seoTitle: true, seoDescription: true },
    });
    if (!item) throw new NotFoundError("Position");
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

/* ── Everything the site needs, in one round trip ────────────── */

publicRouter.get("/site", async (_req, res, next) => {
  try {
    const [contentRows, pages, programmes, jobs, settings] = await Promise.all([
      prisma.websiteContent.findMany({
        where: PUBLISHED,
        orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
        select: contentSelect,
      }),
      prisma.sitePage.findMany({ where: PUBLISHED, select: pageSelect }),
      prisma.programme.findMany({
        where: PUBLISHED,
        orderBy: { sortOrder: "asc" },
        select: programmeCardSelect,
      }),
      prisma.jobOpening.findMany({
        where: {
          ...PUBLISHED,
          OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true, ...jobSelect },
      }),
      // Public settings only. A secret is excluded by the query
      // itself, not filtered out afterwards.
      prisma.siteSetting.findMany({
        where: { isSecret: false, group: { in: ["general", "seo", "contact"] } },
        select: { key: true, value: true, type: true },
      }),
    ]);

    const pageAssets = await withImages(pages, (p) => p.published);

    // Exactly what the website reads, and nothing more.
    res.json({
      content: keyed(contentRows),
      pages: Object.fromEntries(pages.map((p) => [p.key, shapePage(p, pageAssets)])),
      programmes,
      jobs,
      settings: Object.fromEntries(
        settings.filter((s) => s.value !== "").map((s) => [s.key, s.value])
      ),
      editablePages: PAGE_KEYS,
    });
  } catch (err) {
    next(err);
  }
});

/* ── Helpers ─────────────────────────────────────────────────── */

/** Content rows as a keyed map, which is how the site consumes them. */
function keyed(rows: Array<{ key: string; type: string; value: string }>) {
  const content: Record<string, unknown> = {};
  for (const r of rows) {
    content[r.key] = r.type === "JSON" ? safeJson(r.value) : r.value;
  }
  return content;
}

/**
 * Resolves image references inside a page document.
 *
 * The CMS stores an image as `{ mediaId, alt }`; the website needs a
 * URL. Rather than make every page fetch media separately, the join is
 * done here, once, for whatever the document happens to contain.
 *
 * A reference whose asset has been deleted keeps its alt text and no
 * URL, which the site reads as "use the built-in illustration".
 */
async function withImages<T>(documents: T[], read: (d: T) => unknown): Promise<Map<string, {
  url: string;
  width: number | null;
  height: number | null;
}>> {
  const ids = new Set<string>();

  const collect = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(collect);
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeof node.mediaId === "string" && node.mediaId) ids.add(node.mediaId);
    Object.values(node).forEach(collect);
  };

  documents.forEach((d) => collect(read(d)));
  if (ids.size === 0) return new Map();

  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: [...ids] }, ...USABLE_MEDIA },
    select: { id: true, url: true, width: true, height: true },
  });
  return new Map(assets.map((a) => [a.id, { url: a.url, width: a.width, height: a.height }]));
}

/** Rewrites every image reference in a document with its resolved URL. */
function resolveImages(
  value: unknown,
  assets: Map<string, { url: string; width: number | null; height: number | null }>
): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveImages(v, assets));
  if (!value || typeof value !== "object") return value;

  const node = value as Record<string, unknown>;
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) resolved[k] = resolveImages(v, assets);

  if (typeof node.mediaId === "string") {
    const asset = assets.get(node.mediaId);
    if (asset) {
      resolved.url = asset.url;
      resolved.width = asset.width;
      resolved.height = asset.height;
    }
  }
  return resolved;
}

function shapePage(p: {
  key: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  published: unknown;
  publishedAt: Date | null;
  seoImage: { url: string; alt: string | null } | null;
}, assets?: Map<string, { url: string; width: number | null; height: number | null }>) {
  return {
    key: p.key,
    title: p.title,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    // The published document. `draft` is not in the select at all.
    content: assets ? resolveImages(p.published, assets) : p.published,
    publishedAt: p.publishedAt,
    seoImage: p.seoImage,
  };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // A malformed JSON block must not take the whole page down.
    return value;
  }
}

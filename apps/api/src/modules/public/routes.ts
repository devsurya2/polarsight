import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { param } from "../../lib/params.js";

/**
 * Public, unauthenticated, read-only.
 *
 * Every query here filters on status PUBLISHED. Nothing in this file
 * may return a draft, and no endpoint here accepts a status filter
 * from the caller, so an unpublished record cannot be requested.
 */
export const publicRouter = Router();

const PUBLISHED = { status: "PUBLISHED" } as const;

// Cached briefly: the marketing site is read-heavy and this content
// changes rarely.
publicRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  next();
});

publicRouter.get("/content", async (_req, res, next) => {
  try {
    const rows = await prisma.websiteContent.findMany({
      where: PUBLISHED,
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
      select: { key: true, section: true, type: true, value: true },
    });

    // Returned as a keyed map, which is how the site consumes it.
    const content: Record<string, unknown> = {};
    for (const r of rows) {
      content[r.key] = r.type === "JSON" ? safeJson(r.value) : r.value;
    }
    res.json({ content });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/programmes", async (_req, res, next) => {
  try {
    const items = await prisma.programme.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: "asc" },
      select: {
        slug: true,
        code: true,
        name: true,
        tag: true,
        summary: true,
        body: true,
        durationWeeks: true,
        level: true,
        points: true,
        image: { select: { url: true, alt: true, width: true, height: true } },
      },
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
      select: {
        slug: true,
        code: true,
        name: true,
        tag: true,
        summary: true,
        body: true,
        durationWeeks: true,
        level: true,
        points: true,
        image: { select: { url: true, alt: true } },
      },
    });
    // A draft is indistinguishable from a missing record here, on purpose.
    if (!item) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Programme not found" } });
      return;
    }
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/statistics", async (_req, res, next) => {
  try {
    const items = await prisma.statistic.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: "asc" },
      select: { key: true, label: true, value: true },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/audiences", async (_req, res, next) => {
  try {
    const items = await prisma.audience.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: "asc" },
      select: {
        slug: true,
        name: true,
        heading: true,
        blurb: true,
        outcome: true,
        bullets: true,
        image: { select: { url: true, alt: true } },
      },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/career", async (_req, res, next) => {
  try {
    const items = await prisma.careerContent.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: "asc" },
      select: { key: true, title: true, body: true },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/faqs", async (_req, res, next) => {
  try {
    const items = await prisma.fAQ.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: "asc" },
      select: { question: true, answer: true, category: true },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** Everything the homepage needs, in one round trip. */
publicRouter.get("/site", async (_req, res, next) => {
  try {
    const [contentRows, programmes, statistics, audiences, career, faqs] = await Promise.all([
      prisma.websiteContent.findMany({
        where: PUBLISHED,
        orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
        select: { key: true, type: true, value: true },
      }),
      prisma.programme.findMany({
        where: PUBLISHED,
        orderBy: { sortOrder: "asc" },
        select: {
          slug: true, code: true, name: true, tag: true, summary: true,
          durationWeeks: true, level: true, points: true,
        },
      }),
      prisma.statistic.findMany({
        where: PUBLISHED, orderBy: { sortOrder: "asc" },
        select: { key: true, label: true, value: true },
      }),
      prisma.audience.findMany({
        where: PUBLISHED, orderBy: { sortOrder: "asc" },
        select: { slug: true, name: true, heading: true, blurb: true, outcome: true, bullets: true },
      }),
      prisma.careerContent.findMany({
        where: PUBLISHED, orderBy: { sortOrder: "asc" },
        select: { key: true, title: true, body: true },
      }),
      prisma.fAQ.findMany({
        where: PUBLISHED, orderBy: { sortOrder: "asc" },
        select: { question: true, answer: true },
      }),
    ]);

    const content: Record<string, unknown> = {};
    for (const r of contentRows) {
      content[r.key] = r.type === "JSON" ? safeJson(r.value) : r.value;
    }

    res.json({ content, programmes, statistics, audiences, career, faqs });
  } catch (err) {
    next(err);
  }
});

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // A malformed JSON block should not take the whole page down.
    return value;
  }
}

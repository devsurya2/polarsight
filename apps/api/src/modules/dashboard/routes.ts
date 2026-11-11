/**
 * Dashboard.
 *
 * Every number here comes from a live count against the database.
 * Nothing is hardcoded, estimated or cached, and a figure the viewer
 * lacks permission to see is omitted rather than faked.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnyPermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";

const rangeQuery = z.object({
  /** Window for the "new in period" figures. Defaults to 30 days. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  requireAnyPermission(
    "enquiry:read",
    "content:read",
    "programme:read",
    "application:read",
    "job:read"
  ),
  validate({ query: rangeQuery }),
  async (req, res, next) => {
    try {
      const { from, to, days } = req.query as unknown as z.infer<typeof rangeQuery>;
      const since = from ?? new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const until = to ?? new Date();
      const window = { gte: since, lte: until };

      const held = new Set(req.user!.permissions);
      const can = (p: string) => held.has(p);

      // Only query what this administrator is allowed to see. A card
      // they cannot read is absent from the response entirely, so the
      // interface has nothing to render rather than a zero to
      // misinterpret.
      const [
        enquiries,
        applications,
        programmes,
        jobs,
        pages,
        content,
        media,
        admins,
      ] = await Promise.all([
        can("enquiry:read") ? enquiryStats(window) : null,
        can("application:read") ? applicationStats(window) : null,
        can("programme:read") ? programmeStats() : null,
        can("job:read") ? jobStats() : null,
        can("page:read") ? pageStats() : null,
        can("content:read") ? contentStats() : null,
        can("media:read") ? mediaStats() : null,
        can("admin:read") ? adminStats() : null,
      ]);

      const [recentEnquiries, recentApplications, recentActivity, recentContent] =
        await Promise.all([
          can("enquiry:read") ? recentEnquiryRows() : null,
          can("application:read") ? recentApplicationRows() : null,
          can("audit:read") ? recentActivityRows() : null,
          can("content:read") || can("page:read") ? recentlyUpdatedContent() : null,
        ]);

      res.json({
        range: { from: since.toISOString(), to: until.toISOString() },
        cards: {
          enquiries,
          applications,
          programmes,
          jobs,
          pages,
          content,
          media,
          admins,
        },
        recentEnquiries,
        recentApplications,
        recentActivity,
        recentContent,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Cards ───────────────────────────────────────────────────── */

async function enquiryStats(window: { gte: Date; lte: Date }) {
  const [total, newCount, pending, inPeriod, followUpDue, unassigned, converted] =
    await Promise.all([
      prisma.enquiry.count({ where: { archivedAt: null } }),
      prisma.enquiry.count({ where: { archivedAt: null, status: "NEW" } }),
      // "Pending" is anything being worked but not yet resolved.
      prisma.enquiry.count({
        where: {
          archivedAt: null,
          status: { in: ["NEW", "IN_PROGRESS", "UNDER_REVIEW", "CONTACTED", "FOLLOW_UP_REQUIRED"] },
        },
      }),
      prisma.enquiry.count({ where: { archivedAt: null, createdAt: window } }),
      prisma.enquiry.count({
        where: { archivedAt: null, followUpAt: { not: null, lte: new Date() } },
      }),
      prisma.enquiry.count({ where: { archivedAt: null, assignedToId: null } }),
      prisma.enquiry.count({ where: { status: "CONVERTED" } }),
    ]);
  return { total, new: newCount, pending, inPeriod, followUpDue, unassigned, converted };
}

async function applicationStats(window: { gte: Date; lte: Date }) {
  const [total, newCount, pending, inPeriod, shortlisted, interviews, selected] =
    await Promise.all([
      prisma.trainerApplication.count({ where: { archivedAt: null } }),
      prisma.trainerApplication.count({ where: { archivedAt: null, status: "NEW" } }),
      prisma.trainerApplication.count({
        where: {
          archivedAt: null,
          status: {
            in: [
              "NEW",
              "UNDER_REVIEW",
              "SHORTLISTED",
              "INTERVIEW_SCHEDULED",
              "TECHNICAL_ASSESSMENT",
              "DEMO_SESSION",
            ],
          },
        },
      }),
      prisma.trainerApplication.count({ where: { archivedAt: null, createdAt: window } }),
      prisma.trainerApplication.count({ where: { archivedAt: null, status: "SHORTLISTED" } }),
      prisma.trainerApplication.count({
        where: { archivedAt: null, interviewAt: { gte: new Date() } },
      }),
      prisma.trainerApplication.count({ where: { status: "SELECTED" } }),
    ]);
  return {
    total,
    new: newCount,
    pending,
    inPeriod,
    shortlisted,
    upcomingInterviews: interviews,
    selected,
  };
}

async function programmeStats() {
  const [total, published, draft, archived, modules] = await Promise.all([
    prisma.programme.count(),
    prisma.programme.count({ where: { status: "PUBLISHED" } }),
    prisma.programme.count({ where: { status: "DRAFT" } }),
    prisma.programme.count({ where: { status: "ARCHIVED" } }),
    prisma.curriculumModule.count(),
  ]);
  return { total, published, draft, archived, curriculumModules: modules };
}

async function jobStats() {
  const [total, open, draft, archived, closing] = await Promise.all([
    prisma.jobOpening.count(),
    prisma.jobOpening.count({ where: { status: "PUBLISHED" } }),
    prisma.jobOpening.count({ where: { status: "DRAFT" } }),
    prisma.jobOpening.count({ where: { status: "ARCHIVED" } }),
    // Deadlines inside the next week, so they can be acted on.
    prisma.jobOpening.count({
      where: {
        status: "PUBLISHED",
        applicationDeadline: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);
  return { total, open, draft, archived, closingSoon: closing };
}

async function pageStats() {
  const rows = await prisma.sitePage.findMany({
    select: { status: true, draft: true, published: true },
  });
  return {
    total: rows.length,
    published: rows.filter((r) => r.status === "PUBLISHED").length,
    draft: rows.filter((r) => r.status !== "PUBLISHED").length,
    withUnpublishedChanges: rows.filter(
      (r) => JSON.stringify(r.draft) !== JSON.stringify(r.published)
    ).length,
  };
}

async function contentStats() {
  const [total, published, pendingDrafts] = await Promise.all([
    prisma.websiteContent.count(),
    prisma.websiteContent.count({ where: { status: "PUBLISHED" } }),
    prisma.websiteContent.count({ where: { draftValue: { not: null } } }),
  ]);
  return { total, published, draft: total - published, pendingDrafts };
}

async function mediaStats() {
  const agg = await prisma.mediaAsset.aggregate({
    where: { isPrivate: false },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  return { total: agg._count._all, totalBytes: agg._sum.sizeBytes ?? 0 };
}

async function adminStats() {
  const [total, active, roles, lockedOut] = await Promise.all([
    prisma.adminUser.count(),
    prisma.adminUser.count({ where: { isActive: true } }),
    prisma.role.count(),
    prisma.adminUser.count({ where: { lockedUntil: { gt: new Date() } } }),
  ]);
  return { total, active, inactive: total - active, roles, lockedOut };
}



/* ── Activity panels ─────────────────────────────────────────── */

function recentEnquiryRows() {
  return prisma.enquiry.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      name: true,
      email: true,
      organisation: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  });
}

function recentApplicationRows() {
  return prisma.trainerApplication.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      fullName: true,
      appliedPosition: true,
      experienceYears: true,
      status: true,
      createdAt: true,
    },
  });
}

function recentActivityRows() {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      createdAt: true,
      actorLabel: true,
      actor: { select: { id: true, name: true } },
    },
  });
}

/** What changed on the website most recently, across content types. */
async function recentlyUpdatedContent() {
  const [pages, blocks, programmes] = await Promise.all([
    prisma.sitePage.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { key: true, title: true, status: true, updatedAt: true },
    }),
    prisma.websiteContent.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, key: true, label: true, status: true, updatedAt: true },
    }),
    prisma.programme.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, name: true, status: true, updatedAt: true },
    }),
  ]);

  return [
    ...pages.map((p) => ({
      type: "Page" as const,
      id: p.key,
      name: p.title,
      status: p.status,
      updatedAt: p.updatedAt,
    })),
    ...blocks.map((b) => ({
      type: "Content block" as const,
      id: b.id,
      name: b.label,
      status: b.status,
      updatedAt: b.updatedAt,
    })),
    ...programmes.map((p) => ({
      type: "Programme" as const,
      id: p.id,
      name: p.name,
      status: p.status,
      updatedAt: p.updatedAt,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8);
}

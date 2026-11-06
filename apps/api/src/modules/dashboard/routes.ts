import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnyPermission } from "../../middleware/authorize.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  requireAnyPermission("enquiry:read", "content:read", "programme:read"),
  async (_req, res, next) => {
    try {
      const [
        totalEnquiries,
        newEnquiries,
        totalProgrammes,
        publishedProgrammes,
        contentBlocks,
        faqCount,
        mediaCount,
        recentEnquiries,
      ] = await Promise.all([
        prisma.enquiry.count(),
        prisma.enquiry.count({ where: { status: "NEW" } }),
        prisma.programme.count(),
        prisma.programme.count({ where: { status: "PUBLISHED" } }),
        prisma.websiteContent.count(),
        prisma.fAQ.count(),
        prisma.mediaAsset.count(),
        prisma.enquiry.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true, name: true, email: true, organisation: true,
            status: true, createdAt: true,
          },
        }),
      ]);

      res.json({
        enquiries: { total: totalEnquiries, new: newEnquiries },
        programmes: {
          total: totalProgrammes,
          published: publishedProgrammes,
          draft: totalProgrammes - publishedProgrammes,
        },
        content: { blocks: contentBlocks, faqs: faqCount, media: mediaCount },
        recentEnquiries,
      });
    } catch (err) {
      next(err);
    }
  }
);

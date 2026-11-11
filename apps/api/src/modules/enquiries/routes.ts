import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { requireRecentAuth } from "../../middleware/reauth.js";
import { enquiryLimiter } from "../../middleware/rateLimit.js";
import { writeAudit, writeSystemAudit } from "../../lib/audit.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { exportFilename, toCsv } from "../../lib/csv.js";
import { logger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";
import { enquiryTemplates, sendMail } from "../../lib/email.js";
import {
  addNoteSchema,
  assignEnquirySchema,
  createEnquirySchema,
  ENQUIRY_SUBJECTS,
  exportQuerySchema,
  followUpSchema,
  listEnquiriesSchema,
  updateStatusSchema,
} from "./validators.js";
import * as service from "./service.js";

const idParam = z.object({ id: z.string().min(1) });

/* ─────────────────────────────────────────────────────────────
 * Public: the website contact form posts here.
 * ───────────────────────────────────────────────────────────── */

export const publicEnquiryRouter = Router();

publicEnquiryRouter.post(
  "/",
  enquiryLimiter,
  validate({ body: createEnquirySchema }),
  async (req, res, next) => {
    try {
      const { website, ...input } = req.body as z.infer<typeof createEnquirySchema>;

      // Honeypot tripped: accept silently so the bot learns nothing.
      if (website) {
        logger.warn({ ip: req.ip }, "enquiry honeypot tripped");
        res.status(202).json({ message: "Thanks, we will be in touch." });
        return;
      }

      // Same address, same message, within five minutes: that is a
      // double submit rather than a second enquiry.
      const duplicate = await prisma.enquiry.findFirst({
        where: {
          email: input.email,
          message: input.message,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (duplicate) {
        // Reported as success: the enquiry really is recorded, and
        // telling a visitor off for a slow double-click is unhelpful.
        res.status(200).json({ id: duplicate.id, message: "Thanks, we will be in touch." });
        return;
      }

      const created = await prisma.enquiry.create({
        data: {
          ...input,
          sourceIp: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        },
        select: { id: true, name: true, email: true, createdAt: true },
      });

      await writeSystemAudit({
        action: "enquiry.received",
        entity: "Enquiry",
        entityId: created.id,
        actorLabel: "public form",
        ip: req.ip ?? null,
        after: { subject: input.subject ?? null },
      });

      // Acknowledgement is best effort and is never claimed when
      // email is not configured on the server.
      const ack = await sendMail({
        to: created.email,
        ...enquiryTemplates.received({ name: created.name }),
      });

      logger.info({ enquiryId: created.id, acknowledged: ack.sent }, "enquiry received");
      res.status(201).json({
        id: created.id,
        message: "Thanks, we will be in touch.",
        acknowledgementEmailSent: ack.sent,
      });
    } catch (err) {
      next(err);
    }
  }
);

/** The category list the contact form renders. */
publicEnquiryRouter.get("/subjects", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ items: ENQUIRY_SUBJECTS });
});

/* ─────────────────────────────────────────────────────────────
 * Admin: triage and management.
 * ───────────────────────────────────────────────────────────── */

export const enquiriesRouter = Router();
enquiriesRouter.use(requireAuth);

enquiriesRouter.get(
  "/",
  requirePermission("enquiry:read"),
  validate({ query: listEnquiriesSchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof listEnquiriesSchema>;
      res.json(await service.list(q, q.page, q.perPage, q.sort, q.dir));
    } catch (err) {
      next(err);
    }
  }
);

/** Counts per status plus the follow-up queue, for the summary row. */
enquiriesRouter.get("/stats", requirePermission("enquiry:read"), async (_req, res, next) => {
  try {
    const [grouped, due, unassigned, archived, subjects] = await Promise.all([
      prisma.enquiry.groupBy({
        by: ["status"],
        where: { archivedAt: null },
        _count: { _all: true },
      }),
      prisma.enquiry.count({
        where: { archivedAt: null, followUpAt: { not: null, lte: new Date() } },
      }),
      prisma.enquiry.count({ where: { archivedAt: null, assignedToId: null } }),
      prisma.enquiry.count({ where: { archivedAt: { not: null } } }),
      prisma.enquiry.groupBy({
        by: ["subject"],
        where: { archivedAt: null },
        _count: { _all: true },
      }),
    ]);

    res.json({
      byStatus: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
      bySubject: Object.fromEntries(
        subjects.map((s) => [s.subject ?? "Unspecified", s._count._all])
      ),
      total: grouped.reduce((n, g) => n + g._count._all, 0),
      followUpDue: due,
      unassigned,
      archived,
    });
  } catch (err) {
    next(err);
  }
});

// Registered before "/:id" so "export" is not read as an id.
enquiriesRouter.get(
  "/export",
  requirePermission("enquiry:export"),
  requireRecentAuth,
  validate({ query: exportQuerySchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof exportQuerySchema>;
      const rows = await service.exportRows(q);

      await writeAudit(req, {
        action: "enquiry.export",
        entity: "Enquiry",
        after: { count: rows.length, format: q.format },
      });

      if (q.format === "json") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${exportFilename("enquiries", "json")}"`
        );
        res.json({ exportedAt: new Date().toISOString(), count: rows.length, rows });
        return;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename("enquiries", "csv")}"`
      );
      res.send(toCsv(rows as unknown as Record<string, unknown>[], service.EXPORT_COLUMNS));
    } catch (err) {
      next(err);
    }
  }
);

enquiriesRouter.get(
  "/:id",
  requirePermission("enquiry:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      res.json({ item: await service.detail(param(req, "id")) });
    } catch (err) {
      next(err);
    }
  }
);

/** Notes and status changes in one timeline. */
enquiriesRouter.get(
  "/:id/history",
  requirePermission("enquiry:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const exists = await prisma.enquiry.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundError("Enquiry");
      res.json({ items: await service.history(id) });
    } catch (err) {
      next(err);
    }
  }
);

enquiriesRouter.patch(
  "/:id/status",
  requirePermission("enquiry:write"),
  validate({ params: idParam, body: updateStatusSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const body = req.body as z.infer<typeof updateStatusSchema>;

      const before = await prisma.enquiry.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Enquiry");
      if (before.status === body.status) {
        throw new ConflictError(`This enquiry is already marked ${body.status.replace(/_/g, " ").toLowerCase()}`);
      }

      // The status change and its note are one unit, so a recorded
      // reason can never be separated from the change it explains.
      await prisma.$transaction([
        prisma.enquiry.update({
          where: { id },
          data: {
            status: body.status,
            // Resolving an enquiry clears any pending chase-up.
            ...(["CONVERTED", "CLOSED", "SPAM"].includes(body.status)
              ? { followUpAt: null }
              : {}),
          },
        }),
        ...(body.note
          ? [
              prisma.enquiryNote.create({
                data: { enquiryId: id, body: body.note, authorId: req.user!.id },
              }),
            ]
          : []),
      ]);

      await writeAudit(req, {
        action: "enquiry.status",
        entity: "Enquiry",
        entityId: id,
        before: { status: before.status },
        after: { status: body.status },
      });

      res.json({ item: await service.detail(id) });
    } catch (err) {
      next(err);
    }
  }
);

enquiriesRouter.patch(
  "/:id/assign",
  requirePermission("enquiry:write"),
  validate({ params: idParam, body: assignEnquirySchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.enquiry.findUnique({
        where: { id },
        select: { id: true, assignedToId: true },
      });
      if (!before) throw new NotFoundError("Enquiry");

      const { assignedToId } = req.body as { assignedToId: string | null };
      if (assignedToId) {
        const admin = await prisma.adminUser.findFirst({
          where: { id: assignedToId, isActive: true },
          select: { id: true },
        });
        if (!admin) throw new BadRequestError("That administrator does not exist or is inactive");
      }

      await prisma.enquiry.update({ where: { id }, data: { assignedToId } });
      await writeAudit(req, {
        action: "enquiry.assign",
        entity: "Enquiry",
        entityId: id,
        before: { assignedToId: before.assignedToId },
        after: { assignedToId },
      });
      res.json({ item: await service.detail(id) });
    } catch (err) {
      next(err);
    }
  }
);

enquiriesRouter.patch(
  "/:id/follow-up",
  requirePermission("enquiry:write"),
  validate({ params: idParam, body: followUpSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.enquiry.findUnique({
        where: { id },
        select: { id: true, followUpAt: true },
      });
      if (!before) throw new NotFoundError("Enquiry");

      const { followUpAt } = req.body as { followUpAt: Date | null };
      if (followUpAt && followUpAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        throw new BadRequestError("Pick a follow-up date that is not in the past");
      }

      await prisma.enquiry.update({ where: { id }, data: { followUpAt } });
      await writeAudit(req, {
        action: "enquiry.follow_up_set",
        entity: "Enquiry",
        entityId: id,
        before: { followUpAt: before.followUpAt },
        after: { followUpAt },
      });
      res.json({ item: await service.detail(id) });
    } catch (err) {
      next(err);
    }
  }
);

enquiriesRouter.post(
  "/:id/notes",
  requirePermission("enquiry:write"),
  validate({ params: idParam, body: addNoteSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const exists = await prisma.enquiry.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundError("Enquiry");

      const note = await prisma.enquiryNote.create({
        data: { body: req.body.body, enquiryId: id, authorId: req.user!.id },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
      await writeAudit(req, {
        action: "enquiry.note_added",
        entity: "Enquiry",
        entityId: id,
        after: { noteId: note.id },
      });
      res.status(201).json({ item: note });
    } catch (err) {
      next(err);
    }
  }
);

/** Archiving keeps the record but takes it out of the working list. */
enquiriesRouter.post(
  "/:id/archive",
  requirePermission("enquiry:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.enquiry.findUnique({
        where: { id },
        select: { id: true, archivedAt: true },
      });
      if (!before) throw new NotFoundError("Enquiry");

      const archivedAt = before.archivedAt ? null : new Date();
      await prisma.enquiry.update({ where: { id }, data: { archivedAt } });
      await writeAudit(req, {
        action: archivedAt ? "enquiry.archive" : "enquiry.unarchive",
        entity: "Enquiry",
        entityId: id,
      });
      res.json({ item: await service.detail(id) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Permanent deletion.
 *
 * Archiving is the ordinary way to clear an enquiry; this exists for
 * genuine erasure requests and spam, and needs its own permission.
 */
enquiriesRouter.delete(
  "/:id",
  requirePermission("enquiry:delete"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.enquiry.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Enquiry");

      await prisma.enquiry.delete({ where: { id } });
      await writeAudit(req, {
        action: "enquiry.delete",
        entity: "Enquiry",
        entityId: id,
        before: { name: before.name, email: before.email, subject: before.subject },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

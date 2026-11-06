import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { enquiryLimiter } from "../../middleware/rateLimit.js";
import { writeAudit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import {
  addNoteSchema,
  createEnquirySchema,
  exportQuerySchema,
  listEnquiriesSchema,
  updateStatusSchema,
} from "./validators.js";
import * as service from "./service.js";
import { param } from "../../lib/params.js";

const idParam = z.object({ id: z.string().min(1) });

/** Public: the website contact form posts here. No session required. */
export const publicEnquiryRouter = Router();

publicEnquiryRouter.post(
  "/",
  enquiryLimiter,
  validate({ body: createEnquirySchema }),
  async (req, res, next) => {
    try {
      const { website, ...input } = req.body;

      // Honeypot tripped: accept silently so the bot learns nothing.
      if (website) {
        logger.warn({ ip: req.ip }, "enquiry honeypot tripped");
        res.status(202).json({ message: "Thanks, we will be in touch." });
        return;
      }

      const created = await prisma.enquiry.create({
        data: {
          ...input,
          sourceIp: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        },
        select: { id: true, createdAt: true },
      });

      logger.info({ enquiryId: created.id }, "enquiry received");
      res.status(201).json({ id: created.id, message: "Thanks, we will be in touch." });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: triage and management. */
export const enquiriesRouter = Router();
enquiriesRouter.use(requireAuth);

enquiriesRouter.get(
  "/",
  requirePermission("enquiry:read"),
  validate({ query: listEnquiriesSchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof listEnquiriesSchema>;
      res.json(await service.list(q, q.page, q.perPage));
    } catch (err) {
      next(err);
    }
  }
);

// Registered before "/:id" so "export" is not read as an id.
enquiriesRouter.get(
  "/export",
  requirePermission("enquiry:export"),
  validate({ query: exportQuerySchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof exportQuerySchema>;
      const rows = await service.exportRows(q);
      const stamp = new Date().toISOString().slice(0, 10);

      await writeAudit(req, {
        action: "enquiry.export",
        entity: "Enquiry",
        after: { count: rows.length, format: q.format },
      });

      if (q.format === "json") {
        res.setHeader("Content-Disposition", `attachment; filename="enquiries-${stamp}.json"`);
        res.json({ exportedAt: new Date().toISOString(), count: rows.length, rows });
        return;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="enquiries-${stamp}.csv"`);
      res.send(service.toCsv(rows as unknown as Record<string, unknown>[]));
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

enquiriesRouter.patch(
  "/:id/status",
  requirePermission("enquiry:write"),
  validate({ params: idParam, body: updateStatusSchema }),
  async (req, res, next) => {
    try {
      const before = await prisma.enquiry.findUnique({ where: { id: param(req, "id") } });
      if (!before) throw new NotFoundError("Enquiry");

      const after = await prisma.enquiry.update({
        where: { id: param(req, "id") },
        data: { status: req.body.status },
      });
      await writeAudit(req, {
        action: "enquiry.status",
        entity: "Enquiry",
        entityId: after.id,
        before: { status: before.status },
        after: { status: after.status },
      });
      res.json({ item: after });
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
      const exists = await prisma.enquiry.findUnique({
        where: { id: param(req, "id") },
        select: { id: true },
      });
      if (!exists) throw new NotFoundError("Enquiry");

      const note = await prisma.enquiryNote.create({
        data: {
          body: req.body.body,
          enquiryId: param(req, "id"),
          authorId: req.user!.id,
        },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
      await writeAudit(req, {
        action: "enquiry.note_added",
        entity: "Enquiry",
        entityId: param(req, "id"),
        after: { noteId: note.id },
      });
      res.status(201).json({ item: note });
    } catch (err) {
      next(err);
    }
  }
);

enquiriesRouter.delete(
  "/:id",
  requirePermission("enquiry:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const before = await prisma.enquiry.findUnique({ where: { id: param(req, "id") } });
      if (!before) throw new NotFoundError("Enquiry");

      await prisma.enquiry.delete({ where: { id: param(req, "id") } });
      await writeAudit(req, {
        action: "enquiry.delete",
        entity: "Enquiry",
        entityId: param(req, "id"),
        before,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

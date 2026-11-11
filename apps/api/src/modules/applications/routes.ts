import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { applicationLimiter } from "../../middleware/rateLimit.js";
import { writeAudit, writeSystemAudit } from "../../lib/audit.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { exportFilename, toCsv } from "../../lib/csv.js";
import { logger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";
import { storage, validateResume } from "../../lib/storage.js";
import { rescanQuarantined, storeScanned } from "../../lib/quarantine.js";
import { requireRecentAuth } from "../../middleware/reauth.js";
import { env } from "../../config/env.js";
import { applicationTemplates, sendMail } from "../../lib/email.js";
import * as service from "./service.js";
import {
  addApplicationNoteSchema,
  assignApplicationSchema,
  exportApplicationsSchema,
  listApplicationsSchema,
  publicApplicationSchema,
  updateApplicationSchema,
  updateApplicationStatusSchema,
} from "./validators.js";

const idParam = z.object({ id: z.string().min(1) });

// A resume only: one file, buffered so it is inspected before it ever
// touches the disk. The size ceiling is enforced by multer before the
// body is read in full, so an oversized upload is refused cheaply.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.RESUME_MAX_BYTES, files: 1, fields: 40, fieldSize: 20_000 },
});

/* ─────────────────────────────────────────────────────────────
 * Public: the careers page application form posts here.
 * ───────────────────────────────────────────────────────────── */

export const publicApplicationRouter = Router();

publicApplicationRouter.post(
  "/",
  applicationLimiter,
  upload.single("resume"),
  validate({ body: publicApplicationSchema }),
  async (req, res, next) => {
    try {
      const { website, jobOpeningId, ...input } = req.body as z.infer<
        typeof publicApplicationSchema
      >;

      // Honeypot tripped: accept silently so the bot learns nothing.
      if (website) {
        logger.warn({ ip: req.ip }, "application honeypot tripped");
        res.status(202).json({ message: "Thanks — we have received your application." });
        return;
      }

      // An opening may only be applied to while it is published. A
      // draft or archived opening is treated as nonexistent.
      let opening: { id: string; title: string } | null = null;
      if (jobOpeningId) {
        opening = await prisma.jobOpening.findFirst({
          where: { id: jobOpeningId, status: "PUBLISHED" },
          select: { id: true, title: true, applicationDeadline: true },
        });
        if (!opening) throw new BadRequestError("That position is no longer accepting applications");

        const deadline = (opening as { applicationDeadline?: Date | null }).applicationDeadline;
        if (deadline && deadline.getTime() < Date.now()) {
          throw new BadRequestError("The deadline for that position has passed");
        }
      }

      // One application per address per opening. Re-applying to the
      // same role is almost always a double submit.
      const duplicate = await prisma.trainerApplication.findFirst({
        where: {
          email: input.email,
          ...(opening ? { jobOpeningId: opening.id } : { appliedPosition: input.appliedPosition }),
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError(
          "We already have a recent application from this address for that position."
        );
      }

      // The resume is stored as a private asset: it is applicant data,
      // not website media, so it never appears in the media library
      // and cannot be fetched from the public media URL.
      let resumeId: string | null = null;
      let resumeScan: string | null = null;
      if (req.file) {
        // Policy first (type, size, name, structure, active content),
        // then quarantine and scan. A file that fails either is never
        // associated with an application.
        const { mimeType } = validateResume(
          req.file.buffer,
          req.file.mimetype,
          req.file.size,
          req.file.originalname
        );

        const scanned = await storeScanned(req.file.buffer, mimeType, {
          private: true,
          label: "public form",
          ip: req.ip ?? null,
        });

        const asset = await prisma.mediaAsset.create({
          data: {
            filename: scanned.stored.storageKey,
            // Metadata only: the name on disk is random.
            originalName: req.file.originalname.slice(0, 200),
            mimeType,
            sizeBytes: req.file.size,
            storageKey: scanned.stored.storageKey,
            url: "",
            checksum: scanned.stored.checksum,
            isPrivate: true,
            title: `Resume — ${input.fullName}`,
            scanStatus: scanned.scanStatus,
            scanDetail: scanned.scanDetail,
            scannerVersion: scanned.scannerVersion,
            scannedAt: scanned.scannedAt,
          },
          select: { id: true },
        });
        resumeId = asset.id;
        resumeScan = scanned.scanStatus;
      }

      const created = await prisma.trainerApplication.create({
        data: {
          ...input,
          ...(opening ? { jobOpeningId: opening.id, appliedPosition: opening.title } : {}),
          resumeId,
          sourceIp: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        },
        select: { id: true, fullName: true, email: true, appliedPosition: true, createdAt: true },
      });

      // Opening event, so the history starts at submission.
      await prisma.applicationEvent.create({
        data: { applicationId: created.id, toStatus: "NEW", note: "Application submitted." },
      });

      await writeSystemAudit({
        action: "application.received",
        entity: "TrainerApplication",
        entityId: created.id,
        actorLabel: "public form",
        ip: req.ip ?? null,
        after: { position: created.appliedPosition, resumeScan },
      });

      // Acknowledgement is best effort. If email is not configured the
      // candidate still gets the on-screen confirmation, and nothing
      // claims a message was sent.
      const ack = await sendMail({
        to: created.email,
        ...applicationTemplates.received({
          name: created.fullName,
          position: created.appliedPosition,
        }),
      });

      logger.info({ applicationId: created.id, acknowledged: ack.sent }, "application received");

      res.status(201).json({
        id: created.id,
        message: "Thanks — we have received your application.",
        acknowledgementEmailSent: ack.sent,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────
 * Admin: the recruitment pipeline.
 * ───────────────────────────────────────────────────────────── */

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

applicationsRouter.get(
  "/",
  requirePermission("application:read"),
  validate({ query: listApplicationsSchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof listApplicationsSchema>;
      res.json(await service.list(q, q.page, q.perPage, q.sort, q.dir));
    } catch (err) {
      next(err);
    }
  }
);

/** Counts per status, for the pipeline summary. */
applicationsRouter.get("/stats", requirePermission("application:read"), async (_req, res, next) => {
  try {
    const grouped = await prisma.trainerApplication.groupBy({
      by: ["status"],
      where: { archivedAt: null },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    res.json({
      byStatus,
      total: grouped.reduce((n, g) => n + g._count._all, 0),
      archived: await prisma.trainerApplication.count({ where: { archivedAt: { not: null } } }),
    });
  } catch (err) {
    next(err);
  }
});

// Registered before "/:id" so these are not read as ids.
applicationsRouter.get(
  "/export",
  requirePermission("application:export"),
  requireRecentAuth,
  validate({ query: exportApplicationsSchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof exportApplicationsSchema>;
      const rows = await service.exportRows(q);

      await writeAudit(req, {
        action: "application.export",
        entity: "TrainerApplication",
        after: { count: rows.length, format: q.format },
      });

      if (q.format === "json") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${exportFilename("trainer-applications", "json")}"`
        );
        res.json({ exportedAt: new Date().toISOString(), count: rows.length, rows });
        return;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename("trainer-applications", "csv")}"`
      );
      res.send(toCsv(rows as unknown as Record<string, unknown>[], service.EXPORT_COLUMNS));
    } catch (err) {
      next(err);
    }
  }
);

applicationsRouter.get(
  "/:id",
  requirePermission("application:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      res.json({ item: await service.detail(param(req, "id")) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Streams a resume to an authorised reviewer.
 *
 * The file is served from here rather than from its storage URL so
 * that reading applicant data always requires a session and always
 * leaves an audit entry.
 */
applicationsRouter.get(
  "/:id/resume",
  requirePermission("application:read"),
  requireRecentAuth,
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const application = await prisma.trainerApplication.findUnique({
        where: { id: param(req, "id") },
        select: { id: true, fullName: true, resume: true },
      });
      if (!application) throw new NotFoundError("Application");
      if (!application.resume) throw new NotFoundError("Resume");

      // Only a file the scanner has passed leaves the server. A file
      // whose scan failed or never ran stays where it is until a
      // rescan says otherwise.
      if (application.resume.scanStatus !== "CLEAN") {
        throw new ConflictError(
          application.resume.scanStatus === "REJECTED"
            ? "This resume was rejected by the malware scanner and is not available"
            : "This resume has not passed a malware scan yet. Rescan it, or wait for the scanner to come back."
        );
      }

      const buffer = await storage.get(application.resume.storageKey, "private");

      await writeAudit(req, {
        action: "application.resume_downloaded",
        entity: "TrainerApplication",
        entityId: application.id,
        after: { filename: application.resume.originalName },
      });

      const safeName = application.fullName.replace(/[^a-zA-Z0-9 ]+/g, "").trim() || "applicant";

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("Content-Disposition", `attachment; filename="resume-${safeName}.pdf"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

/** Re-runs the malware scan on a resume whose scan failed or never ran. */
applicationsRouter.post(
  "/:id/resume/rescan",
  requirePermission("application:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const application = await prisma.trainerApplication.findUnique({
        where: { id: param(req, "id") },
        select: { id: true, resume: true },
      });
      if (!application) throw new NotFoundError("Application");
      if (!application.resume) throw new NotFoundError("Resume");
      if (application.resume.scanStatus === "CLEAN") {
        res.json({ scanStatus: "CLEAN", message: "This resume has already passed scanning." });
        return;
      }
      if (application.resume.scanStatus === "REJECTED") {
        throw new ConflictError("This resume was rejected and its file has been destroyed");
      }

      const result = await rescanQuarantined(application.resume.storageKey, { private: true });
      if ("destroyed" in result) {
        await prisma.mediaAsset.update({
          where: { id: application.resume.id },
          data: { scanStatus: "REJECTED", scanDetail: `Malware detected: ${result.signature}`, scannedAt: new Date() },
        });
        await writeAudit(req, {
          action: "application.resume_rejected",
          entity: "TrainerApplication",
          entityId: application.id,
          after: { signature: result.signature },
        });
        throw new ConflictError("The scanner rejected this resume; the file has been destroyed");
      }

      const updated = await prisma.mediaAsset.update({
        where: { id: application.resume.id },
        data: {
          scanStatus: result.scanStatus,
          scanDetail: result.scanDetail,
          scannerVersion: result.scannerVersion,
          scannedAt: result.scannedAt,
        },
        select: { scanStatus: true, scanDetail: true, scannedAt: true },
      });
      await writeAudit(req, {
        action: "application.resume_rescanned",
        entity: "TrainerApplication",
        entityId: application.id,
        after: updated,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

applicationsRouter.patch(
  "/:id",
  requirePermission("application:write"),
  validate({ params: idParam, body: updateApplicationSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.trainerApplication.findUnique({ where: { id } });
      if (!before) throw new NotFoundError("Application");

      const after = await prisma.trainerApplication.update({ where: { id }, data: req.body });
      await writeAudit(req, {
        action: "application.update",
        entity: "TrainerApplication",
        entityId: id,
        before,
        after,
      });
      res.json({ item: await service.detail(id) });
    } catch (err) {
      next(err);
    }
  }
);

applicationsRouter.patch(
  "/:id/status",
  requirePermission("application:write"),
  validate({ params: idParam, body: updateApplicationStatusSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const body = req.body as z.infer<typeof updateApplicationStatusSchema>;

      const { item, mail } = await service.changeStatus({
        id,
        status: body.status,
        note: body.note,
        scheduledAt: body.scheduledAt,
        actorId: req.user!.id,
        notifyCandidate: body.notifyCandidate,
        notifyMessage: body.notifyMessage,
      });

      await writeAudit(req, {
        action: "application.status",
        entity: "TrainerApplication",
        entityId: id,
        after: { status: body.status, notified: mail?.sent ?? false },
      });

      // The interface reports exactly what happened to the email: it
      // must never imply a message was delivered when it was not.
      res.json({
        item,
        notification: mail
          ? mail.sent
            ? { sent: true }
            : { sent: false, reason: mail.reason, detail: mail.detail ?? null }
          : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

applicationsRouter.patch(
  "/:id/assign",
  requirePermission("application:write"),
  validate({ params: idParam, body: assignApplicationSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const exists = await prisma.trainerApplication.findUnique({
        where: { id },
        select: { id: true, assignedToId: true },
      });
      if (!exists) throw new NotFoundError("Application");

      const assignedToId = (req.body as { assignedToId: string | null }).assignedToId;
      if (assignedToId) {
        const recruiter = await prisma.adminUser.findFirst({
          where: { id: assignedToId, isActive: true },
          select: { id: true },
        });
        if (!recruiter) throw new BadRequestError("That administrator does not exist or is inactive");
      }

      await prisma.trainerApplication.update({ where: { id }, data: { assignedToId } });
      await writeAudit(req, {
        action: "application.assign",
        entity: "TrainerApplication",
        entityId: id,
        before: { assignedToId: exists.assignedToId },
        after: { assignedToId },
      });
      res.json({ item: await service.detail(id) });
    } catch (err) {
      next(err);
    }
  }
);

applicationsRouter.post(
  "/:id/notes",
  requirePermission("application:write"),
  validate({ params: idParam, body: addApplicationNoteSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const exists = await prisma.trainerApplication.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundError("Application");

      const note = await prisma.applicationNote.create({
        data: {
          applicationId: id,
          body: req.body.body,
          kind: req.body.kind,
          authorId: req.user!.id,
        },
        include: { author: { select: { id: true, name: true, email: true } } },
      });

      await writeAudit(req, {
        action: "application.note_added",
        entity: "TrainerApplication",
        entityId: id,
        after: { noteId: note.id, kind: note.kind },
      });
      res.status(201).json({ item: note });
    } catch (err) {
      next(err);
    }
  }
);

applicationsRouter.post(
  "/:id/archive",
  requirePermission("application:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.trainerApplication.findUnique({
        where: { id },
        select: { id: true, archivedAt: true },
      });
      if (!before) throw new NotFoundError("Application");

      const archivedAt = before.archivedAt ? null : new Date();
      await prisma.trainerApplication.update({ where: { id }, data: { archivedAt } });
      await writeAudit(req, {
        action: archivedAt ? "application.archive" : "application.unarchive",
        entity: "TrainerApplication",
        entityId: id,
      });
      res.json({ item: await service.detail(id) });
    } catch (err) {
      next(err);
    }
  }
);

applicationsRouter.delete(
  "/:id",
  requirePermission("application:delete"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.trainerApplication.findUnique({
        where: { id },
        select: { id: true, fullName: true, email: true, appliedPosition: true, resume: true },
      });
      if (!before) throw new NotFoundError("Application");

      // Notes and events cascade; the resume object has to go too, or
      // applicant data outlives the record that justified holding it.
      await prisma.trainerApplication.delete({ where: { id } });
      if (before.resume) {
        await prisma.mediaAsset.delete({ where: { id: before.resume.id } }).catch(() => undefined);
        await storage.remove(before.resume.storageKey, "private").catch(() => undefined);
      }

      await writeAudit(req, {
        action: "application.delete",
        entity: "TrainerApplication",
        entityId: id,
        before: { fullName: before.fullName, appliedPosition: before.appliedPosition },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { uploadLimiter } from "../../middleware/rateLimit.js";
import { writeAudit } from "../../lib/audit.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { paginated, skipTake } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import { safeText } from "../../lib/sanitize.js";
import { ALLOWED_MIME, kindOf, MAX_UPLOAD_BYTES, storage, validateUpload } from "../../lib/storage.js";
import { rescanQuarantined, storeScanned } from "../../lib/quarantine.js";
import { requireRecentAuth } from "../../middleware/reauth.js";

/**
 * Files are buffered in memory and inspected before anything touches
 * the disk, so a rejected upload is never written anywhere.
 *
 * `files: 10` allows a multi-file upload; each one is validated
 * independently and a failure in one does not discard the rest.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 10 },
});

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(200).optional(),
  kind: z.enum(["image", "video", "document"]).optional(),
  sort: z.enum(["createdAt", "originalName", "sizeBytes"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const metaSchema = z
  .object({
    alt: safeText(300, "Alt text").nullish(),
    title: safeText(200, "Title").nullish(),
    description: safeText(1_000, "Description").nullish(),
  })
  .strict();

/** Which mime prefixes belong to which kind, for the filter. */
const KIND_FILTER: Record<string, { in: string[] }> = {
  image: { in: [...ALLOWED_MIME].filter(([, s]) => s.kind === "image").map(([m]) => m) },
  video: { in: [...ALLOWED_MIME].filter(([, s]) => s.kind === "video").map(([m]) => m) },
  document: { in: [...ALLOWED_MIME].filter(([, s]) => s.kind === "document").map(([m]) => m) },
};

const assetSelect = {
  id: true,
  filename: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  url: true,
  width: true,
  height: true,
  alt: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { id: true, name: true } },
  scanStatus: true,
  scanDetail: true,
  scannedAt: true,
  _count: { select: { programmes: true, programmeGallery: true, pageSeoImages: true } },
} as const;

/** How many records of any kind reference an asset. */
interface UsageCounts {
  programmes: number;
  programmeGallery: number;
  pageSeoImages: number;
}

const usageCount = (a: { _count: UsageCounts }) =>
  a._count.programmes + a._count.programmeGallery + a._count.pageSeoImages;

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

/**
 * The library listing.
 *
 * Private assets — applicant resumes — are excluded unconditionally.
 * They are personal data attached to one application, not website
 * media, and they are reachable only through the application they
 * belong to.
 */
mediaRouter.get(
  "/",
  requirePermission("media:read"),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, perPage, search, kind, sort, dir } = req.query as unknown as z.infer<
        typeof listQuery
      >;

      const where: Record<string, unknown> = { isPrivate: false };
      if (kind) where.mimeType = KIND_FILTER[kind];
      if (search) {
        where.OR = [
          { originalName: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
          { alt: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.mediaAsset.findMany({
          where,
          orderBy: { [sort]: dir },
          ...skipTake({ page, perPage }),
          select: assetSelect,
        }),
        prisma.mediaAsset.count({ where }),
      ]);

      const items = rows.map((r) => ({
        ...r,
        kind: kindOf(r.mimeType),
        usageCount: usageCount(r),
      }));

      res.json(paginated(items, total, { page, perPage }));
    } catch (err) {
      next(err);
    }
  }
);

/** What the library holds, for the dashboard and the storage notice. */
mediaRouter.get("/stats", requirePermission("media:read"), async (_req, res, next) => {
  try {
    const grouped = await prisma.mediaAsset.groupBy({
      by: ["mimeType"],
      where: { isPrivate: false },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });

    const byKind: Record<string, { count: number; bytes: number }> = {
      image: { count: 0, bytes: 0 },
      video: { count: 0, bytes: 0 },
      document: { count: 0, bytes: 0 },
    };
    for (const g of grouped) {
      const kind = kindOf(g.mimeType);
      if (!kind) continue;
      byKind[kind]!.count += g._count._all;
      byKind[kind]!.bytes += g._sum.sizeBytes ?? 0;
    }

    res.json({
      byKind,
      total: grouped.reduce((n, g) => n + g._count._all, 0),
      totalBytes: grouped.reduce((n, g) => n + (g._sum.sizeBytes ?? 0), 0),
      allowedTypes: [...ALLOWED_MIME.keys()],
    });
  } catch (err) {
    next(err);
  }
});

mediaRouter.get(
  "/:id",
  requirePermission("media:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const asset = await prisma.mediaAsset.findFirst({
        where: { id: param(req, "id"), isPrivate: false },
        select: assetSelect,
      });
      if (!asset) throw new NotFoundError("Media asset");
      res.json({ item: { ...asset, kind: kindOf(asset.mimeType), usageCount: usageCount(asset) } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Exactly where an asset is used.
 *
 * The delete confirmation shows this, so nobody removes a file that
 * a published page depends on without being told what will break.
 */
mediaRouter.get(
  "/:id/usage",
  requirePermission("media:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const asset = await prisma.mediaAsset.findUnique({ where: { id }, select: { id: true } });
      if (!asset) throw new NotFoundError("Media asset");

      const [covers, gallery, pages, settings] = await Promise.all([
        prisma.programme.findMany({
          where: { imageId: id },
          select: { id: true, name: true, slug: true, status: true },
        }),
        prisma.programmeImage.findMany({
          where: { mediaId: id },
          select: { programme: { select: { id: true, name: true, slug: true, status: true } } },
        }),
        prisma.sitePage.findMany({
          where: { seoImageId: id },
          select: { id: true, key: true, title: true, status: true },
        }),
        prisma.siteSetting.findMany({
          where: { type: "MEDIA", value: id },
          select: { key: true, label: true, group: true },
        }),
      ]);

      const usages = [
        ...covers.map((p) => ({ type: "Programme cover", name: p.name, status: p.status })),
        ...gallery.map((g) => ({
          type: "Programme gallery",
          name: g.programme.name,
          status: g.programme.status,
        })),
        ...pages.map((p) => ({ type: "Page social image", name: p.title, status: p.status })),
        ...settings.map((s) => ({ type: "Site setting", name: s.label, status: "PUBLISHED" })),
      ];

      res.json({
        items: usages,
        total: usages.length,
        // The specific warning the confirmation dialog needs.
        publishedUsageCount: usages.filter((u) => u.status === "PUBLISHED").length,
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Uploads one or more files. Each is validated on its own bytes. */
mediaRouter.post(
  "/",
  uploadLimiter,
  requirePermission("media:write"),
  upload.array("file", 10),
  async (req, res, next) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw new BadRequestError("No file was uploaded");

      const created: unknown[] = [];
      const rejected: Array<{ filename: string; reason: string }> = [];

      for (const file of files) {
        try {
          // Trust the bytes, not the headers.
          const { mimeType } = validateUpload(file.buffer, file.mimetype, file.size);

          // Dedupe on content before anything is written.
          const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
          const duplicate = await prisma.mediaAsset.findFirst({
            where: { checksum, isPrivate: false },
            select: { id: true, originalName: true },
          });
          if (duplicate) {
            rejected.push({
              filename: file.originalname,
              reason: `Already in the library as "${duplicate.originalName}"`,
            });
            continue;
          }

          // Quarantine, scan, and only then release to the public tier.
          const scanned = await storeScanned(file.buffer, mimeType, {
            private: false,
            label: req.user!.email,
            ip: req.ip ?? null,
          });

          const asset = await prisma.mediaAsset.create({
            data: {
              filename: scanned.stored.storageKey,
              // Metadata only: the name on disk is random.
              originalName: file.originalname.slice(0, 200),
              mimeType,
              sizeBytes: file.size,
              storageKey: scanned.stored.storageKey,
              url: scanned.stored.url ?? "",
              checksum,
              uploadedById: req.user!.id,
              scanStatus: scanned.scanStatus,
              scanDetail: scanned.scanDetail,
              scannerVersion: scanned.scannerVersion,
              scannedAt: scanned.scannedAt,
            },
            select: assetSelect,
          });

          await writeAudit(req, {
            action: "media.upload",
            entity: "MediaAsset",
            entityId: asset.id,
            after: {
              filename: asset.filename,
              sizeBytes: asset.sizeBytes,
              mimeType: asset.mimeType,
              scanStatus: asset.scanStatus,
            },
          });

          created.push({ ...asset, kind: kindOf(asset.mimeType), usageCount: 0 });
        } catch (err) {
          // One bad file in a batch must not discard the good ones.
          rejected.push({
            filename: file.originalname,
            reason: err instanceof Error ? err.message : "Upload failed",
          });
        }
      }

      if (created.length === 0) {
        throw new BadRequestError(
          rejected.length === 1
            ? rejected[0]!.reason
            : "None of those files could be uploaded",
          rejected.map((r) => ({ field: r.filename, message: r.reason }))
        );
      }

      res.status(201).json({ items: created, rejected });
    } catch (err) {
      next(err);
    }
  }
);

mediaRouter.patch(
  "/:id",
  requirePermission("media:write"),
  validate({ params: idParam, body: metaSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.mediaAsset.findFirst({
        where: { id, isPrivate: false },
      });
      if (!before) throw new NotFoundError("Media asset");

      const after = await prisma.mediaAsset.update({
        where: { id },
        data: req.body,
        select: assetSelect,
      });
      await writeAudit(req, {
        action: "media.update",
        entity: "MediaAsset",
        entityId: id,
        before: { alt: before.alt, title: before.title, description: before.description },
        after: { alt: after.alt, title: after.title, description: after.description },
      });
      res.json({ item: { ...after, kind: kindOf(after.mimeType), usageCount: usageCount(after) } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Deletes an asset.
 *
 * Refused outright while anything references it. `?force=true` is
 * accepted only when nothing *published* uses it, so a draft can be
 * cleaned up but a live page can never silently lose its image.
 */
/** Re-runs the scan on an upload the scanner could not verdict. */
mediaRouter.post(
  "/:id/rescan",
  requirePermission("media:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, isPrivate: false },
        select: { id: true, storageKey: true, scanStatus: true },
      });
      if (!asset) throw new NotFoundError("Media asset");
      if (asset.scanStatus === "CLEAN") {
        res.json({ scanStatus: "CLEAN", message: "Already scanned clean." });
        return;
      }
      if (asset.scanStatus === "REJECTED") throw new ConflictError("That file was rejected and destroyed");
      if (asset.scanStatus === "SCAN_SKIPPED") {
        // Legacy or dev-released file: it lives in the public tier.
        // Scan it in place by reading it back.
        const buffer = await storage.get(asset.storageKey, "public");
        const { scanBuffer } = await import("../../lib/scan.js");
        const verdict = await scanBuffer(buffer);
        if (verdict.verdict === "infected") {
          await storage.remove(asset.storageKey, "public");
          await prisma.mediaAsset.update({
            where: { id },
            data: { scanStatus: "REJECTED", scanDetail: `Malware detected: ${verdict.signature}`, scannedAt: new Date(), url: "" },
          });
          await writeAudit(req, { action: "media.rejected", entity: "MediaAsset", entityId: id, after: { signature: verdict.signature } });
          throw new ConflictError("The scanner rejected this file; it has been removed from the website");
        }
        const updated = await prisma.mediaAsset.update({
          where: { id },
          data:
            verdict.verdict === "clean"
              ? { scanStatus: "CLEAN", scanDetail: null, scannerVersion: verdict.version, scannedAt: new Date() }
              : { scanDetail: `Scan ${verdict.reason}` },
          select: { scanStatus: true, scanDetail: true, scannedAt: true },
        });
        res.json(updated);
        return;
      }

      const result = await rescanQuarantined(asset.storageKey, { private: false });
      if ("destroyed" in result) {
        await prisma.mediaAsset.update({
          where: { id },
          data: { scanStatus: "REJECTED", scanDetail: `Malware detected: ${result.signature}`, scannedAt: new Date() },
        });
        await writeAudit(req, { action: "media.rejected", entity: "MediaAsset", entityId: id, after: { signature: result.signature } });
        throw new ConflictError("The scanner rejected this file; it has been destroyed");
      }
      const updated = await prisma.mediaAsset.update({
        where: { id },
        data: {
          scanStatus: result.scanStatus,
          scanDetail: result.scanDetail,
          scannerVersion: result.scannerVersion,
          scannedAt: result.scannedAt,
          url: result.stored.url ?? "",
        },
        select: { scanStatus: true, scanDetail: true, scannedAt: true, url: true },
      });
      await writeAudit(req, { action: "media.rescanned", entity: "MediaAsset", entityId: id, after: updated });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

mediaRouter.delete(
  "/:id",
  requirePermission("media:delete"),
  requireRecentAuth,
  validate({ params: idParam, query: z.object({ force: z.coerce.boolean().default(false) }) }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const force = (req.query as unknown as { force: boolean }).force;

      const asset = await prisma.mediaAsset.findFirst({
        where: { id, isPrivate: false },
        select: { ...assetSelect, storageKey: true, scanStatus: true },
      });
      if (!asset) throw new NotFoundError("Media asset");

      const inUse = usageCount(asset);
      if (inUse > 0) {
        const published = await publishedUsage(id);
        if (published > 0) {
          throw new ConflictError(
            `That file is used by ${published} published record(s). Replace it there first, ` +
              `or unpublish them, before deleting it.`
          );
        }
        if (!force) {
          throw new ConflictError(
            `That file is used by ${inUse} draft record(s). Delete it anyway to remove it from them.`
          );
        }
      }

      // Rows first, then the object: an orphaned row is a broken image
      // on a page, an orphaned object is just wasted bytes.
      await prisma.mediaAsset.delete({ where: { id } });
      const tier = asset.scanStatus === "CLEAN" || asset.scanStatus === "SCAN_SKIPPED" ? "public" : "private";
      await storage.remove(asset.storageKey, tier).catch(() => undefined);

      await writeAudit(req, {
        action: "media.delete",
        entity: "MediaAsset",
        entityId: id,
        before: { filename: asset.filename, usageCount: inUse, forced: force },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/** How many PUBLISHED records depend on an asset. */
async function publishedUsage(id: string): Promise<number> {
  const [covers, gallery, pages] = await Promise.all([
    prisma.programme.count({ where: { imageId: id, status: "PUBLISHED" } }),
    prisma.programmeImage.count({ where: { mediaId: id, programme: { status: "PUBLISHED" } } }),
    prisma.sitePage.count({ where: { seoImageId: id, status: "PUBLISHED" } }),
  ]);
  return covers + gallery + pages;
}

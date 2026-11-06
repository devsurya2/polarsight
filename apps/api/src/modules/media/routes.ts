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
import {
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
  rejectUnsafeSvg,
  sniffMime,
  storage,
} from "../../lib/storage.js";

// Files are buffered in memory and inspected before anything touches
// the disk, so a rejected upload never gets written anywhere.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(200).optional(),
});

const metaSchema = z.object({ alt: z.string().trim().max(300).nullish() }).strict();

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

mediaRouter.get(
  "/",
  requirePermission("media:read"),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, perPage, search } = req.query as unknown as z.infer<typeof listQuery>;
      const where = search
        ? {
            OR: [
              { originalName: { contains: search, mode: "insensitive" as const } },
              { alt: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [items, total] = await Promise.all([
        prisma.mediaAsset.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...skipTake({ page, perPage }),
          include: { uploadedBy: { select: { id: true, name: true } } },
        }),
        prisma.mediaAsset.count({ where }),
      ]);
      res.json(paginated(items, total, { page, perPage }));
    } catch (err) {
      next(err);
    }
  }
);

mediaRouter.post(
  "/",
  uploadLimiter,
  requirePermission("media:write"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) throw new BadRequestError("No file was uploaded");
      if (file.size === 0) throw new BadRequestError("That file is empty");

      // Trust the bytes, not the headers. A declared image/png that
      // sniffs as something else is rejected outright.
      const sniffed = sniffMime(file.buffer);
      if (!sniffed) throw new BadRequestError("Unrecognised or unsupported file type");
      if (!ALLOWED_MIME.has(sniffed)) {
        throw new BadRequestError(
          `Unsupported file type. Allowed: ${[...ALLOWED_MIME.keys()].join(", ")}`
        );
      }
      if (file.mimetype !== sniffed) {
        throw new BadRequestError(
          `File contents (${sniffed}) do not match the declared type (${file.mimetype})`
        );
      }
      if (sniffed === "image/svg+xml") rejectUnsafeSvg(file.buffer);

      const stored = await storage.put(file.buffer, file.originalname, sniffed);

      const duplicate = await prisma.mediaAsset.findFirst({
        where: { checksum: stored.checksum },
        select: { id: true, url: true },
      });
      if (duplicate) {
        await storage.remove(stored.storageKey);
        throw new ConflictError("That exact file has already been uploaded");
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          filename: stored.storageKey,
          originalName: file.originalname.slice(0, 200),
          mimeType: sniffed,
          sizeBytes: file.size,
          storageKey: stored.storageKey,
          url: stored.url,
          checksum: stored.checksum,
          uploadedById: req.user!.id,
        },
      });

      await writeAudit(req, {
        action: "media.upload",
        entity: "MediaAsset",
        entityId: asset.id,
        after: { filename: asset.filename, sizeBytes: asset.sizeBytes, mimeType: asset.mimeType },
      });
      res.status(201).json({ item: asset });
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
      const before = await prisma.mediaAsset.findUnique({ where: { id: param(req, "id") } });
      if (!before) throw new NotFoundError("Media asset");

      const after = await prisma.mediaAsset.update({
        where: { id: param(req, "id") },
        data: { alt: req.body.alt ?? null },
      });
      await writeAudit(req, {
        action: "media.update",
        entity: "MediaAsset",
        entityId: after.id,
        before: { alt: before.alt },
        after: { alt: after.alt },
      });
      res.json({ item: after });
    } catch (err) {
      next(err);
    }
  }
);

mediaRouter.delete(
  "/:id",
  requirePermission("media:delete"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const asset = await prisma.mediaAsset.findUnique({
        where: { id: param(req, "id") },
        include: { _count: { select: { programmes: true, audiences: true } } },
      });
      if (!asset) throw new NotFoundError("Media asset");

      const inUse = asset._count.programmes + asset._count.audiences;
      if (inUse > 0) {
        throw new ConflictError(`That file is still used by ${inUse} record(s)`);
      }

      await prisma.mediaAsset.delete({ where: { id: asset.id } });
      await storage.remove(asset.storageKey);

      await writeAudit(req, {
        action: "media.delete",
        entity: "MediaAsset",
        entityId: asset.id,
        before: { filename: asset.filename },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

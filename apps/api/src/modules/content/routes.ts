/**
 * Keyed content blocks.
 *
 * `value` is what the website shows. `draftValue` is the editor's work
 * in progress and is never served publicly — the public API reads
 * `value` only. Publishing copies draftValue into value and records a
 * version, so every change to the live site is reversible.
 *
 * Structural blocks (navigation, footer link columns) are marked
 * `isLocked` by the seed and the API refuses to change them: those are
 * routing, not copy, and an edit could point the site at a dead URL.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { writeAudit } from "../../lib/audit.js";
import { revalidateInBackground } from "../../lib/revalidate.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { param } from "../../lib/params.js";
import { assertSafeText, requiredSafeText } from "../../lib/sanitize.js";
import { getVersion, listVersions, pruneVersions, snapshot } from "../../lib/versioning.js";

const idParam = z.object({ id: z.string().min(1) });

const base = {
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, digits, dot, dash and underscore only"),
  section: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only"),
  label: requiredSafeText(160, "Label"),
  type: z.enum(["TEXT", "RICH_TEXT", "JSON"]).default("TEXT"),
  value: z.string().max(50_000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};

/**
 * A JSON block has to parse, and every string inside it is screened.
 * A TEXT block is screened directly. Either way nothing with markup
 * in it reaches the database.
 */
function checkValue(type: string, value: string, field = "Value"): string {
  if (type === "JSON") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestError(`${field} must be valid JSON for a JSON block`);
    }
    const walk = (v: unknown): void => {
      if (typeof v === "string") assertSafeText(v, field);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(parsed);
    return value;
  }
  return assertSafeText(value, field);
}

export const contentRouter = createCrudRouter({
  name: "WebsiteContent",
  delegate: prisma.websiteContent,
  permissions: { read: "content:read", write: "content:write", publish: "content:publish" },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().omit({ key: true }).strict(),
  searchFields: ["key", "label", "value"],
  defaultOrderBy: { key: "asc" },
  sortableFields: ["key", "section", "label", "sortOrder", "updatedAt"],
  publishable: true,
  versioned: "WebsiteContent",
  guardWrite(row, action) {
    if (row.isLocked) {
      return action === "delete"
        ? `"${row.label}" is a structural block and cannot be deleted.`
        : `"${row.label}" is a structural block (site navigation or routing) and cannot be edited here.`;
    }
    return null;
  },
  beforeWrite(data, { existing }) {
    const type = (data.type as string | undefined) ?? (existing?.type as string | undefined) ?? "TEXT";
    if (typeof data.value === "string") data.value = checkValue(type, data.value);
    return data;
  },
});

/* ── Draft workflow ──────────────────────────────────────────── */

const draftSchema = z.object({ draftValue: z.string().max(50_000) }).strict();

const extras = Router();
extras.use(requireAuth);

async function load(id: string) {
  const row = await prisma.websiteContent.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Content block");
  return row;
}

/** Saves a draft. The live value, and therefore the website, is untouched. */
extras.put(
  "/:id/draft",
  requirePermission("content:write"),
  validate({ params: idParam, body: draftSchema }),
  async (req, res, next) => {
    try {
      const row = await load(param(req, "id"));
      if (row.isLocked) {
        throw new BadRequestError(`"${row.label}" is a structural block and cannot be edited here`);
      }

      const draftValue = checkValue(row.type, (req.body as { draftValue: string }).draftValue, "Draft");

      const after = await prisma.websiteContent.update({
        where: { id: row.id },
        data: { draftValue },
      });

      await writeAudit(req, {
        action: "websitecontent.draft_saved",
        entity: "WebsiteContent",
        entityId: row.id,
        before: { draftValue: row.draftValue },
        after: { draftValue: after.draftValue },
      });

      res.json({ item: after, hasUnpublishedChanges: after.draftValue !== null });
    } catch (err) {
      next(err);
    }
  }
);

extras.delete(
  "/:id/draft",
  requirePermission("content:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const row = await load(param(req, "id"));
      const after = await prisma.websiteContent.update({
        where: { id: row.id },
        data: { draftValue: null },
      });
      await writeAudit(req, {
        action: "websitecontent.draft_discarded",
        entity: "WebsiteContent",
        entityId: row.id,
        before: { draftValue: row.draftValue },
      });
      res.json({ item: after });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Promotes the draft to the live value.
 *
 * The previous live value is snapshotted first, so "restore previous
 * version" always has something to restore.
 */
extras.post(
  "/:id/publish-draft",
  requirePermission("content:publish"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const row = await load(param(req, "id"));
      if (row.isLocked) {
        throw new BadRequestError(`"${row.label}" is a structural block and cannot be published here`);
      }
      if (row.draftValue === null) {
        throw new BadRequestError("There is no draft to publish for this block");
      }

      const draftValue = checkValue(row.type, row.draftValue, "Draft");

      const after = await prisma.$transaction(async (tx) => {
        await snapshot(
          {
            entity: "WebsiteContent",
            entityId: row.id,
            payload: { key: row.key, label: row.label, type: row.type, value: row.value },
            label: "Value before publish",
            actorId: req.user?.id,
          },
          tx
        );
        return tx.websiteContent.update({
          where: { id: row.id },
          data: {
            value: draftValue,
            draftValue: null,
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });
      });

      await pruneVersions("WebsiteContent", row.id);
      revalidateInBackground(["site-content"]);

      await writeAudit(req, {
        action: "websitecontent.publish_draft",
        entity: "WebsiteContent",
        entityId: row.id,
        before: { value: row.value },
        after: { value: after.value },
      });

      res.json({ item: after });
    } catch (err) {
      next(err);
    }
  }
);

extras.get(
  "/:id/versions",
  requirePermission("content:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      res.json({ items: await listVersions("WebsiteContent", param(req, "id")) });
    } catch (err) {
      next(err);
    }
  }
);

/** Restores an earlier value into the draft, not into the live value. */
extras.post(
  "/:id/restore",
  requirePermission("version:restore"),
  validate({
    params: idParam,
    body: z.object({ version: z.coerce.number().int().min(1) }).strict(),
  }),
  async (req, res, next) => {
    try {
      const row = await load(param(req, "id"));
      const version = Number((req.body as { version: number }).version);
      const snap = await getVersion("WebsiteContent", row.id, version);
      const payload = snap.payload as { value?: string };

      if (typeof payload.value !== "string") {
        throw new BadRequestError("That version does not contain a value to restore");
      }

      const after = await prisma.websiteContent.update({
        where: { id: row.id },
        data: { draftValue: payload.value },
      });

      await writeAudit(req, {
        action: "websitecontent.restore",
        entity: "WebsiteContent",
        entityId: row.id,
        after: { restoredFromVersion: version },
      });

      res.json({
        item: after,
        note: "Restored into the draft. Review it, then publish to make it live.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Grouped by section, which is how the CMS screen renders it. */
extras.get("/grouped/all", requirePermission("content:read"), async (_req, res, next) => {
  try {
    const rows = await prisma.websiteContent.findMany({
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
    });
    const sections: Record<string, typeof rows> = {};
    for (const r of rows) (sections[r.section] ??= []).push(r);
    res.json({
      sections,
      pendingDrafts: rows.filter((r) => r.draftValue !== null).length,
    });
  } catch (err) {
    next(err);
  }
});

contentRouter.use("/", extras);

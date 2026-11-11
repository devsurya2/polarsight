import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { USABLE_MEDIA } from "../../lib/quarantine.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { writeAudit } from "../../lib/audit.js";
import { revalidateInBackground } from "../../lib/revalidate.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { param } from "../../lib/params.js";
import { safeText } from "../../lib/sanitize.js";
import { assertReasonableDocument, assertSafeJson } from "../../lib/sanitize.js";
import { getVersion, listVersions, pruneVersions, snapshot } from "../../lib/versioning.js";
import { env } from "../../config/env.js";
import {
  PAGE_DESCRIPTIONS,
  PAGE_KEYS,
  PAGE_LABELS,
  PAGE_ROUTES,
  PAGE_SCHEMAS,
  isPageKey,
  type PageKey,
} from "./schema.js";

const keyParam = z.object({ key: z.string().min(1).max(40) });

const metaSchema = z
  .object({
    title: safeText(200, "Title").optional(),
    seoTitle: safeText(200, "SEO title").nullish(),
    seoDescription: safeText(400, "SEO description").nullish(),
    seoImageId: z.string().min(1).nullish(),
  })
  .strict();

/** Draft payloads are validated against that page's own schema. */
const draftSchema = z.object({ draft: z.unknown() }).strict();

const publishSchema = z.object({ label: safeText(120, "Label").optional() }).strict();

const restoreSchema = z
  .object({ version: z.coerce.number().int().min(1) })
  .strict();

export const pagesRouter = Router();
pagesRouter.use(requireAuth);

/** Resolves a page key, refusing anything not declared in schema.ts. */
function requireKey(req: import("express").Request): PageKey {
  const key = param(req, "key");
  if (!isPageKey(key)) {
    throw new NotFoundError(`Page "${key}"`);
  }
  return key;
}

async function loadPage(key: PageKey) {
  const page = await prisma.sitePage.findUnique({
    where: { key },
    include: { seoImage: { select: { id: true, url: true, alt: true } } },
  });
  if (!page) {
    throw new NotFoundError(
      `Page "${key}". Run the database seed to create the editable pages.`
    );
  }
  return page;
}

/** Catalogue of editable pages, for the CMS index screen. */
pagesRouter.get("/", requirePermission("page:read"), async (_req, res, next) => {
  try {
    const rows = await prisma.sitePage.findMany({
      // Only pages the site actually has. A row left behind by an
      // earlier schema is not shown as something editable.
      where: { key: { in: PAGE_KEYS } },
      orderBy: { key: "asc" },
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        seoTitle: true,
        seoDescription: true,
        draft: true,
        published: true,
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      label: isPageKey(r.key) ? PAGE_LABELS[r.key] : r.title,
      route: isPageKey(r.key) ? PAGE_ROUTES[r.key] : null,
      description: isPageKey(r.key) ? PAGE_DESCRIPTIONS[r.key] : null,
      status: r.status,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      hasSeo: Boolean(r.seoTitle && r.seoDescription),
      // Whether the draft differs from what the public site shows.
      hasUnpublishedChanges: !sameDocument(r.draft, r.published),
    }));

    res.json({ items, editableKeys: PAGE_KEYS });
  } catch (err) {
    next(err);
  }
});

pagesRouter.get(
  "/:key",
  requirePermission("page:read"),
  validate({ params: keyParam }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      const page = await loadPage(key);
      res.json({
        item: {
          ...page,
          label: PAGE_LABELS[key],
          route: PAGE_ROUTES[key],
          description: PAGE_DESCRIPTIONS[key],
          hasUnpublishedChanges: !sameDocument(page.draft, page.published),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Saves the working draft. The public site is untouched. */
pagesRouter.put(
  "/:key/draft",
  requirePermission("page:write"),
  validate({ params: keyParam, body: draftSchema }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      const page = await loadPage(key);

      const draft = parseDraft(key, (req.body as { draft: unknown }).draft);

      const updated = await prisma.sitePage.update({
        where: { key },
        data: { draft },
      });

      await writeAudit(req, {
        action: "page.draft_saved",
        entity: "SitePage",
        entityId: page.id,
        before: { draft: page.draft },
        after: { draft: updated.draft },
      });

      res.json({
        item: updated,
        hasUnpublishedChanges: !sameDocument(updated.draft, updated.published),
      });
    } catch (err) {
      next(err);
    }
  }
);

pagesRouter.patch(
  "/:key",
  requirePermission("page:write"),
  validate({ params: keyParam, body: metaSchema }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      const page = await loadPage(key);

      const body = req.body as z.infer<typeof metaSchema>;
      if (body.seoImageId) {
        const image = await prisma.mediaAsset.findFirst({
          where: { id: body.seoImageId, ...USABLE_MEDIA },
          select: { id: true },
        });
        if (!image) throw new BadRequestError("That image does not exist in the media library");
      }

      const updated = await prisma.sitePage.update({ where: { key }, data: body });
      await writeAudit(req, {
        action: "page.meta_updated",
        entity: "SitePage",
        entityId: page.id,
        before: {
          title: page.title,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
        },
        after: {
          title: updated.title,
          seoTitle: updated.seoTitle,
          seoDescription: updated.seoDescription,
        },
      });
      res.json({ item: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Publishes the draft.
 *
 * Copies draft → published in one transaction and snapshots the result
 * so there is always a version to roll back to. The public API reads
 * only `published`, so until this runs nothing an editor typed is
 * reachable from the website.
 */
pagesRouter.post(
  "/:key/publish",
  requirePermission("page:publish"),
  validate({ params: keyParam, body: publishSchema }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      const page = await loadPage(key);

      // Re-validate at the moment of publishing. A draft saved before
      // a schema change must not reach the site unchecked.
      const draft = parseDraft(key, page.draft);

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.sitePage.update({
          where: { key },
          data: { published: draft, status: "PUBLISHED", publishedAt: new Date() },
        });
        await snapshot(
          {
            entity: "SitePage",
            entityId: row.id,
            payload: {
              title: row.title,
              seoTitle: row.seoTitle,
              seoDescription: row.seoDescription,
              content: draft,
            },
            label: (req.body as { label?: string }).label ?? "Published",
            actorId: req.user?.id,
          },
          tx
        );
        return row;
      });

      await pruneVersions("SitePage", updated.id);
      revalidateInBackground(["site-content"]);

      await writeAudit(req, {
        action: "page.publish",
        entity: "SitePage",
        entityId: updated.id,
        after: { key, publishedAt: updated.publishedAt },
      });

      res.json({ item: updated });
    } catch (err) {
      next(err);
    }
  }
);

/** Takes a page's content off the public site, keeping the draft. */
pagesRouter.post(
  "/:key/unpublish",
  requirePermission("page:publish"),
  validate({ params: keyParam }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      const page = await loadPage(key);

      const updated = await prisma.sitePage.update({
        where: { key },
        // Prisma.DbNull writes a real SQL NULL; a bare `null` would be
        // read as "leave this column alone".
        data: { published: Prisma.DbNull, status: "DRAFT", publishedAt: null },
      });

      await writeAudit(req, {
        action: "page.unpublish",
        entity: "SitePage",
        entityId: page.id,
        before: { status: page.status },
        after: { status: updated.status },
      });

      revalidateInBackground(["site-content"]);

      // The public site falls back to its built-in copy for a page
      // with nothing published, so unpublishing is safe.
      res.json({
        item: updated,
        note: "The website will fall back to its built-in copy for this page.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Preview ───────────────────────────────────────────────────
 *
 * A preview token is a short-lived HMAC over the page key. The public
 * site accepts it on a preview route and renders the draft; without a
 * valid token the draft is unreachable. Tokens are stateless and
 * expire in 10 minutes.
 */

const PREVIEW_TTL_MS = 10 * 60 * 1000;

function signPreview(key: string, expires: number): string {
  return crypto
    .createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(`preview:${key}:${expires}`)
    .digest("base64url");
}

export function verifyPreviewToken(key: string, token: string, expires: number): boolean {
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = signPreview(key, expires);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

pagesRouter.post(
  "/:key/preview",
  requirePermission("page:read"),
  validate({ params: keyParam }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      await loadPage(key);

      const expires = Date.now() + PREVIEW_TTL_MS;
      const token = signPreview(key, expires);

      const url = new URL(PAGE_ROUTES[key], env.WEB_URL);
      url.searchParams.set("preview", "1");
      url.searchParams.set("key", key);
      url.searchParams.set("token", token);
      url.searchParams.set("expires", String(expires));

      await writeAudit(req, { action: "page.preview", entity: "SitePage", entityId: key });

      res.json({ url: url.toString(), expiresAt: new Date(expires).toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Version history ─────────────────────────────────────────── */

pagesRouter.get(
  "/:key/versions",
  requirePermission("page:read"),
  validate({ params: keyParam }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      const page = await loadPage(key);
      const versions = await listVersions("SitePage", page.id);

      // Marked per version, so the interface can disable a restore that
      // would be refused rather than offering it and failing.
      const payloads = await prisma.contentVersion.findMany({
        where: { entity: "SitePage", entityId: page.id },
        select: { version: true, payload: true },
      });
      const restorable = new Map(
        payloads.map((p) => [
          p.version,
          matchesSchema(key, (p.payload as { content?: unknown })?.content),
        ])
      );

      res.json({
        items: versions.map((v) => ({
          ...v,
          restorable: restorable.get(v.version) ?? false,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

pagesRouter.get(
  "/:key/versions/:version",
  requirePermission("page:read"),
  validate({ params: keyParam.extend({ version: z.coerce.number().int().min(1) }) }),
  async (req, res, next) => {
    try {
      const page = await loadPage(requireKey(req));
      const version = Number(req.params.version);
      res.json({ item: await getVersion("SitePage", page.id, version) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Restores an earlier version into the DRAFT.
 *
 * It does not change what the public site shows: someone has to
 * review the restored draft and publish it. A rollback is therefore
 * itself an auditable, reviewable action rather than an instant
 * change to the live site.
 */
pagesRouter.post(
  "/:key/restore",
  requirePermission("version:restore"),
  validate({ params: keyParam, body: restoreSchema }),
  async (req, res, next) => {
    try {
      const key = requireKey(req);
      const page = await loadPage(key);
      const { version } = req.body as z.infer<typeof restoreSchema>;

      const snap = await getVersion("SitePage", page.id, version);
      const payload = snap.payload as {
        content?: unknown;
        title?: string;
        seoTitle?: string | null;
        seoDescription?: string | null;
      };

      if (!matchesSchema(key, payload.content)) {
        throw new BadRequestError(
          `Version ${version} was saved before this page's editable sections changed, ` +
            `so it no longer matches the page. It is kept as a record but cannot be restored.`
        );
      }

      const draft = parseDraft(key, payload.content);

      const updated = await prisma.sitePage.update({
        where: { key },
        data: {
          draft,
          ...(typeof payload.title === "string" ? { title: payload.title } : {}),
          seoTitle: payload.seoTitle ?? page.seoTitle,
          seoDescription: payload.seoDescription ?? page.seoDescription,
        },
      });

      await writeAudit(req, {
        action: "page.restore",
        entity: "SitePage",
        entityId: page.id,
        before: { draft: page.draft },
        after: { restoredFromVersion: version },
      });

      res.json({
        item: updated,
        note: "Version restored into the draft. Review it, then publish to make it live.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Helpers ─────────────────────────────────────────────────── */

/**
 * Whether a stored document still matches the page's editable regions.
 *
 * Regions change as the site changes, and a version recorded before
 * such a change describes a page that no longer exists. Restoring it
 * would either fail at validation or quietly drop sections, so it is
 * identified up front instead.
 */
function matchesSchema(key: PageKey, content: unknown): boolean {
  if (!content || typeof content !== "object") return false;
  return PAGE_SCHEMAS[key].safeParse(content).success;
}

/**
 * Validates a draft document against its page schema and screens
 * every string in it for markup. Returns the parsed document.
 */
function parseDraft(key: PageKey, value: unknown) {
  assertReasonableDocument(value);
  assertSafeJson(value, key);

  const parsed = PAGE_SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    throw new BadRequestError(
      "That page content does not match the expected structure",
      parsed.error.issues.map((i) => ({
        field: i.path.join(".") || "(root)",
        message: i.message,
      }))
    );
  }
  return parsed.data as object;
}

/** Order-insensitive comparison of two stored documents. */
function sameDocument(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => x.localeCompare(y));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}

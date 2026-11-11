import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { requireRecentAuth } from "../../middleware/reauth.js";
import { scannerStatus } from "../../lib/scan.js";
import { USABLE_MEDIA } from "../../lib/quarantine.js";
import { writeAudit } from "../../lib/audit.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { assertSafeText, externalUrl } from "../../lib/sanitize.js";
import { emailStatus } from "../../lib/email.js";
import { env } from "../../config/env.js";
import { storage } from "../../lib/storage.js";

const keyParam = z.object({ key: z.string().min(1).max(120) });

const updateSchema = z.object({ value: z.string().max(20_000) }).strict();

const bulkSchema = z
  .object({
    values: z
      .array(z.object({ key: z.string().min(1).max(120), value: z.string().max(20_000) }))
      .min(1)
      .max(100),
  })
  .strict();

/**
 * Keys that may never be stored in the database, whatever an
 * administrator asks. Credentials belong in the server's environment,
 * where they are not reachable through an authenticated HTTP call.
 */
const CREDENTIAL_PATTERN =
  /(password|passwd|secret|api[_-]?key|token|credential|private[_-]?key|smtp_pass|access[_-]?key)/i;

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

/** Validates a value against the type declared for that setting. */
function parseValue(type: string, raw: string, label: string): string {
  const value = raw.trim();

  switch (type) {
    case "URL": {
      if (value === "") return "";
      const parsed = externalUrl.safeParse(value);
      if (!parsed.success) {
        throw new BadRequestError(`${label} must be a full http:// or https:// URL`);
      }
      return parsed.data;
    }
    case "EMAIL": {
      if (value === "") return "";
      const parsed = z.string().email().max(200).safeParse(value);
      if (!parsed.success) throw new BadRequestError(`${label} must be a valid email address`);
      return parsed.data.toLowerCase();
    }
    case "NUMBER": {
      if (value === "") return "";
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        throw new BadRequestError(`${label} must be a number`);
      }
      return value;
    }
    case "BOOLEAN": {
      if (!["true", "false"].includes(value)) {
        throw new BadRequestError(`${label} must be true or false`);
      }
      return value;
    }
    case "MEDIA":
      // Validated against the media library by the caller.
      return value;
    case "JSON": {
      if (value === "") return "";
      try {
        JSON.parse(value);
      } catch {
        throw new BadRequestError(`${label} must be valid JSON`);
      }
      assertSafeText(value, label);
      return value;
    }
    default:
      return assertSafeText(value, label);
  }
}

/** Never return the value of a secret, only the fact that one is set. */
const present = (row: { isSecret: boolean; value: string }) =>
  row.isSecret ? (row.value ? "(set)" : "") : row.value;

settingsRouter.get("/", requirePermission("setting:read"), async (_req, res, next) => {
  try {
    const rows = await prisma.siteSetting.findMany({
      orderBy: [{ group: "asc" }, { label: "asc" }],
      include: { updatedBy: { select: { id: true, name: true } } },
    });

    const groups: Record<string, unknown[]> = {};
    for (const r of rows) {
      (groups[r.group] ??= []).push({
        id: r.id,
        key: r.key,
        group: r.group,
        label: r.label,
        type: r.type,
        hint: r.hint,
        value: present(r),
        isSecret: r.isSecret,
        isLocked: r.isLocked,
        updatedAt: r.updatedAt,
        updatedBy: r.updatedBy,
      });
    }

    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

/**
 * Health of the things the platform depends on.
 *
 * Reports whether each integration is configured and reachable, and
 * nothing about how it is configured beyond what is safe to show.
 */
settingsRouter.get("/integrations", requirePermission("setting:read"), async (_req, res, next) => {
  try {
    const started = Date.now();
    let database: { ok: boolean; latencyMs: number | null; error: string | null };
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = { ok: true, latencyMs: Date.now() - started, error: null };
    } catch (err) {
      database = {
        ok: false,
        latencyMs: null,
        error: err instanceof Error ? err.message : "unreachable",
      };
    }

    // Storage: probed rather than assumed to work.
    let mediaStorage: { ok: boolean; driver: string; error: string | null };
    try {
      await storage.get("00000000000000000000000000000000.probe", "public").catch((err: unknown) => {
        // ENOENT proves the directory is reachable, which is what
        // we are testing. Anything else is a real problem.
        const code = (err as { code?: string }).code;
        if (code !== "ENOENT") throw err;
      });
      mediaStorage = { ok: true, driver: env.STORAGE_DRIVER, error: null };
    } catch (err) {
      mediaStorage = {
        ok: false,
        driver: env.STORAGE_DRIVER,
        error: err instanceof Error ? err.message : "unavailable",
      };
    }

    const [malwareScanner, quarantined] = await Promise.all([
      scannerStatus(),
      prisma.mediaAsset.count({ where: { scanStatus: { in: ["QUARANTINED", "SCAN_FAILED"] } } }),
    ]);

    res.json({
      api: { ok: true, uptimeSeconds: Math.round(process.uptime()), environment: env.NODE_ENV },
      database,
      mediaStorage,
      malwareScanner: { ...malwareScanner, awaitingScan: quarantined },
      email: emailStatus(),
      // Secrets are not reported, only whether the expected ones exist.
      security: {
        cookieSecure: env.COOKIE_SECURE,
        accessTokenTtl: env.JWT_ACCESS_TTL,
        refreshTokenTtl: env.JWT_REFRESH_TTL,
        distinctJwtSecrets: env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET,
        mfaKeyConfigured: Boolean(env.MFA_ENCRYPTION_KEY),
        trustProxy: env.TRUST_PROXY,
        corsOrigins: env.CORS_ORIGINS,
        loginAttemptLimit: env.LOGIN_RATE_LIMIT_MAX,
        resumeMaxBytes: env.RESUME_MAX_BYTES,
      },
    });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch(
  "/:key",
  requirePermission("setting:write"),
  requireRecentAuth,
  validate({ params: keyParam, body: updateSchema }),
  async (req, res, next) => {
    try {
      const key = req.params.key as string;
      const setting = await prisma.siteSetting.findUnique({ where: { key } });
      if (!setting) throw new NotFoundError("Setting");

      if (setting.isLocked) {
        throw new BadRequestError(`"${setting.label}" is managed by the server and cannot be changed here`);
      }
      if (setting.isSecret || CREDENTIAL_PATTERN.test(key)) {
        throw new BadRequestError(
          `"${setting.label}" is a credential. Set it in the server environment, not through the admin portal.`
        );
      }

      const value = await resolveValue(setting.type, req.body.value, setting.label);

      const updated = await prisma.siteSetting.update({
        where: { key },
        data: { value, updatedById: req.user!.id },
      });

      await writeAudit(req, {
        action: "setting.update",
        entity: "SiteSetting",
        entityId: updated.id,
        before: { key, value: setting.value },
        after: { key, value: updated.value },
      });

      res.json({ item: { ...updated, value: present(updated) } });
    } catch (err) {
      next(err);
    }
  }
);

/** Saves a whole group in one transaction, so a form submits atomically. */
settingsRouter.put(
  "/",
  requirePermission("setting:write"),
  requireRecentAuth,
  validate({ body: bulkSchema }),
  async (req, res, next) => {
    try {
      const { values } = req.body as z.infer<typeof bulkSchema>;

      const keys = values.map((v) => v.key);
      const existing = await prisma.siteSetting.findMany({ where: { key: { in: keys } } });
      const byKey = new Map(existing.map((s) => [s.key, s]));

      const missing = keys.filter((k) => !byKey.has(k));
      if (missing.length) {
        throw new BadRequestError(`Unknown setting(s): ${missing.join(", ")}`);
      }

      const writes: Array<{ key: string; value: string; before: string }> = [];
      for (const { key, value } of values) {
        const setting = byKey.get(key)!;
        if (setting.isLocked) {
          throw new BadRequestError(`"${setting.label}" cannot be changed here`);
        }
        if (setting.isSecret || CREDENTIAL_PATTERN.test(key)) {
          throw new BadRequestError(
            `"${setting.label}" is a credential and must be set in the server environment`
          );
        }
        writes.push({
          key,
          value: await resolveValue(setting.type, value, setting.label),
          before: setting.value,
        });
      }

      await prisma.$transaction(
        writes.map((w) =>
          prisma.siteSetting.update({
            where: { key: w.key },
            data: { value: w.value, updatedById: req.user!.id },
          })
        )
      );

      await writeAudit(req, {
        action: "setting.bulk_update",
        entity: "SiteSetting",
        before: Object.fromEntries(writes.map((w) => [w.key, w.before])),
        after: Object.fromEntries(writes.map((w) => [w.key, w.value])),
      });

      res.json({ updated: writes.length });
    } catch (err) {
      next(err);
    }
  }
);

/** Type-checks a value, and for MEDIA proves the asset exists. */
async function resolveValue(type: string, raw: string, label: string): Promise<string> {
  const value = parseValue(type, raw, label);
  if (type === "MEDIA" && value !== "") {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: value, ...USABLE_MEDIA },
      select: { id: true },
    });
    if (!asset) throw new BadRequestError(`${label} must reference a file in the media library`);
  }
  return value;
}

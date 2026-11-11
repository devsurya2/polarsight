/**
 * The upload pipeline: validate → quarantine → scan → release or refuse.
 *
 * Every file is written to the private tier first and scanned there.
 * What happens next depends on the verdict and on what the file is:
 *
 *   clean      public media → moved to the public tier, CLEAN
 *              resume       → stays private, CLEAN (downloadable)
 *   infected   → destroyed, upload refused, event audited
 *   error      → stays private, SCAN_FAILED. A resume cannot be
 *                downloaded; a media file has no URL and cannot be
 *                referenced by content. `rescan` tries again later.
 *
 * The one deliberate relaxation: in development with no scanner
 * configured, public media is released as SCAN_SKIPPED so the media
 * library is usable on a laptop. Resumes are never relaxed, and
 * production refuses to boot without CLAMAV_HOST (see config/env.ts).
 */

import type { ScanStatus } from "@prisma/client";
import { isProd } from "../config/env.js";
import { BadRequestError } from "./errors.js";
import { logger } from "./logger.js";
import { isScannerConfigured, scanBuffer } from "./scan.js";
import { storage, type StoredObject } from "./storage.js";
import { writeSystemAudit } from "./audit.js";

export interface ScannedObject {
  stored: StoredObject;
  scanStatus: ScanStatus;
  scanDetail: string | null;
  scannerVersion: string | null;
  scannedAt: Date | null;
}

/** Media that may be referenced by content or served to the public. */
export const USABLE_MEDIA = {
  isPrivate: false,
  scanStatus: { in: ["CLEAN", "SCAN_SKIPPED"] as ScanStatus[] },
} as const;

export class UploadRejectedError extends BadRequestError {
  constructor(public readonly signature: string) {
    super("That file was rejected by the malware scanner and has been discarded");
  }
}

export async function storeScanned(
  buffer: Buffer,
  mimeType: string,
  opts: { private: boolean; label: string; ip?: string | null }
): Promise<ScannedObject> {
  const stored = await storage.put(buffer, mimeType, "private");
  const verdict = await scanBuffer(buffer);
  const now = new Date();

  if (verdict.verdict === "infected") {
    await storage.remove(stored.storageKey, "private");
    await writeSystemAudit({
      action: "upload.malware_rejected",
      entity: "MediaAsset",
      actorLabel: opts.label,
      ip: opts.ip ?? null,
      after: { signature: verdict.signature, mimeType, bytes: buffer.length },
    });
    throw new UploadRejectedError(verdict.signature);
  }

  if (verdict.verdict === "clean") {
    const released = opts.private ? stored : await storage.release(stored.storageKey);
    return {
      stored: released,
      scanStatus: "CLEAN",
      scanDetail: null,
      scannerVersion: verdict.version,
      scannedAt: now,
    };
  }

  // Scanner error. Fail closed: the file stays in quarantine.
  const detail = `Scan ${verdict.reason}${verdict.detail ? `: ${verdict.detail}` : ""}`;

  if (!opts.private && !isScannerConfigured()) {
    if (isProd) {
      await storage.remove(stored.storageKey, "private");
      throw new BadRequestError("Uploads are disabled until the malware scanner is configured");
    }
    logger.warn({ mimeType }, "no scanner configured; releasing public media unscanned (development only)");
    const released = await storage.release(stored.storageKey);
    return {
      stored: released,
      scanStatus: "SCAN_SKIPPED",
      scanDetail: "No scanner configured in development; not scanned.",
      scannerVersion: null,
      scannedAt: null,
    };
  }

  logger.error({ reason: verdict.reason, mimeType }, "upload left in quarantine: scan did not complete");
  return { stored, scanStatus: "SCAN_FAILED", scanDetail: detail, scannerVersion: null, scannedAt: null };
}

/**
 * Re-runs the scan on a quarantined object. Returns the new state; the
 * caller persists it. An infected verdict destroys the file.
 */
export async function rescanQuarantined(
  storageKey: string,
  opts: { private: boolean }
): Promise<ScannedObject | { destroyed: true; signature: string }> {
  const buffer = await storage.get(storageKey, "private");
  const verdict = await scanBuffer(buffer);
  const now = new Date();

  if (verdict.verdict === "infected") {
    await storage.remove(storageKey, "private");
    return { destroyed: true, signature: verdict.signature };
  }
  if (verdict.verdict === "clean") {
    const stored = opts.private
      ? { storageKey, tier: "private" as const, url: null, checksum: "" }
      : await storage.release(storageKey);
    return { stored, scanStatus: "CLEAN", scanDetail: null, scannerVersion: verdict.version, scannedAt: now };
  }
  return {
    stored: { storageKey, tier: "private", url: null, checksum: "" },
    scanStatus: "SCAN_FAILED",
    scanDetail: `Scan ${verdict.reason}${verdict.detail ? `: ${verdict.detail}` : ""}`,
    scannerVersion: null,
    scannedAt: null,
  };
}

/**
 * Scans every file the scanner has not passed yet, and reports.
 *
 *   npm run media:rescan --workspace @polarsight/api
 *
 * Covers quarantined uploads (SCAN_FAILED), files released before
 * scanning existed (SCAN_SKIPPED) and anything left QUARANTINED by a
 * crash mid-upload. A file the scanner rejects is destroyed and its
 * row marked REJECTED; nothing here ever marks a file clean without a
 * verdict from the scanner. Safe to run on a schedule.
 */

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { isScannerConfigured, scanBuffer, scannerStatus } from "../lib/scan.js";
import { storage } from "../lib/storage.js";

async function main() {
  if (!isScannerConfigured()) {
    console.error("CLAMAV_HOST is not set; nothing can be scanned.");
    process.exit(2);
  }
  const status = await scannerStatus();
  if (!status.ok) {
    console.error(`Scanner unreachable: ${status.error}`);
    process.exit(2);
  }
  console.log(`Scanner: ${status.version}`);

  const pending = await prisma.mediaAsset.findMany({
    where: { scanStatus: { in: ["QUARANTINED", "SCAN_FAILED", "SCAN_SKIPPED"] } },
    select: { id: true, storageKey: true, isPrivate: true, scanStatus: true, originalName: true },
  });
  console.log(`${pending.length} file(s) to scan`);

  const totals = { clean: 0, rejected: 0, failed: 0, missing: 0 };
  for (const asset of pending) {
    const tier = asset.scanStatus === "SCAN_SKIPPED" ? "public" : "private";
    let buffer: Buffer;
    try {
      buffer = await storage.get(asset.storageKey, tier);
    } catch {
      totals.missing += 1;
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { scanDetail: "File missing from storage", scanStatus: "SCAN_FAILED" },
      });
      continue;
    }

    const verdict = await scanBuffer(buffer);
    if (verdict.verdict === "infected") {
      totals.rejected += 1;
      await storage.remove(asset.storageKey, tier);
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { scanStatus: "REJECTED", scanDetail: `Malware detected: ${verdict.signature}`, scannedAt: new Date(), url: "" },
      });
      logger.warn({ id: asset.id, signature: verdict.signature }, "rescan: file rejected and destroyed");
      continue;
    }
    if (verdict.verdict === "clean") {
      totals.clean += 1;
      let url: string | undefined;
      if (!asset.isPrivate && tier === "private") url = (await storage.release(asset.storageKey)).url ?? "";
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          scanStatus: "CLEAN",
          scanDetail: null,
          scannerVersion: verdict.version,
          scannedAt: new Date(),
          ...(url !== undefined ? { url } : {}),
        },
      });
      continue;
    }
    totals.failed += 1;
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { scanStatus: "SCAN_FAILED", scanDetail: `Scan ${verdict.reason}` },
    });
  }

  console.log("Done:", totals);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

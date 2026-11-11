/**
 * Storage hygiene: orphaned and expired files.
 *
 *   npm run media:cleanup --workspace @polarsight/api
 *
 * Reports, then removes:
 *  - files on disk in either tier with no media_assets row (orphans
 *    left by a crash between write and insert);
 *  - rows marked REJECTED whose file somehow still exists;
 *  - quarantined files older than QUARANTINE_MAX_AGE_DAYS that still
 *    have no verdict, together with their rows — an upload nobody
 *    could scan in that time is not going to be used.
 *
 * Never touches a CLEAN file, and never a file referenced by an
 * application. Run with --dry-run to only report.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { privateUploadDir, publicUploadDir, storage } from "../lib/storage.js";

const QUARANTINE_MAX_AGE_DAYS = Number(process.env.QUARANTINE_MAX_AGE_DAYS ?? 30);
const dryRun = process.argv.includes("--dry-run");

async function listDir(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(f));
  } catch {
    return [];
  }
}

async function main() {
  const rows = await prisma.mediaAsset.findMany({
    select: { id: true, storageKey: true, scanStatus: true, isPrivate: true, createdAt: true, applicationResumes: { select: { id: true } } },
  });
  const known = new Map(rows.map((r) => [r.storageKey, r]));

  const report = { orphanFiles: 0, rejectedFiles: 0, expiredQuarantine: 0 };

  for (const [tier, dir] of [["public", publicUploadDir], ["private", privateUploadDir]] as const) {
    for (const file of await listDir(dir)) {
      const row = known.get(file);
      if (!row) {
        report.orphanFiles += 1;
        console.log(`${dryRun ? "[dry] " : ""}orphan ${tier}/${file}`);
        if (!dryRun) await fs.rm(path.join(dir, file), { force: true });
        continue;
      }
      if (row.scanStatus === "REJECTED") {
        report.rejectedFiles += 1;
        console.log(`${dryRun ? "[dry] " : ""}rejected file still present ${tier}/${file}`);
        if (!dryRun) await fs.rm(path.join(dir, file), { force: true });
      }
    }
  }

  const cutoff = new Date(Date.now() - QUARANTINE_MAX_AGE_DAYS * 86_400_000);
  for (const row of rows) {
    const stuck = row.scanStatus === "QUARANTINED" || row.scanStatus === "SCAN_FAILED";
    if (!stuck || row.createdAt > cutoff || row.applicationResumes.length > 0) continue;
    report.expiredQuarantine += 1;
    console.log(`${dryRun ? "[dry] " : ""}expired quarantine ${row.storageKey} (${row.scanStatus}, ${row.createdAt.toISOString()})`);
    if (!dryRun) {
      await storage.remove(row.storageKey, "private").catch(() => undefined);
      await prisma.mediaAsset.delete({ where: { id: row.id } });
    }
  }

  console.log(dryRun ? "Dry run:" : "Done:", report);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

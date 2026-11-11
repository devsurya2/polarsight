-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED', 'SCAN_FAILED', 'SCAN_SKIPPED');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "mfa_enabled_at" TIMESTAMP(3),
ADD COLUMN     "mfa_pending_secret" TEXT,
ADD COLUMN     "mfa_recovery_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfa_secret" TEXT;

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "scan_detail" TEXT,
ADD COLUMN     "scan_status" "ScanStatus" NOT NULL DEFAULT 'QUARANTINED',
ADD COLUMN     "scanned_at" TIMESTAMP(3),
ADD COLUMN     "scanner_version" TEXT;

-- CreateIndex
CREATE INDEX "media_assets_scan_status_idx" ON "media_assets"("scan_status");

-- Files that existed before scanning was introduced were never
-- scanned. They are marked as such rather than left QUARANTINED (which
-- would take every published image off the website) and can be
-- rescanned with `npm run media:rescan`.
UPDATE "media_assets"
SET "scan_status" = 'SCAN_SKIPPED',
    "scan_detail" = 'Uploaded before malware scanning was introduced; not yet scanned.'
WHERE "scan_status" = 'QUARANTINED';

/*
  Warnings:

  - You are about to drop the `audiences` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `career_content` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `faqs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `statistics` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "audiences" DROP CONSTRAINT "audiences_image_id_fkey";

-- DropForeignKey
ALTER TABLE "faqs" DROP CONSTRAINT "faqs_programme_id_fkey";

-- DropForeignKey
ALTER TABLE "statistics" DROP CONSTRAINT "statistics_verified_by_id_fkey";

-- DropTable
DROP TABLE "audiences";

-- DropTable
DROP TABLE "career_content";

-- DropTable
DROP TABLE "faqs";

-- DropTable
DROP TABLE "statistics";

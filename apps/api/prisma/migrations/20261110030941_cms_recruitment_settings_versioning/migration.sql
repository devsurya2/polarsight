-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'GUEST_TRAINER', 'INDUSTRY_EXPERT');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ON_CAMPUS', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'TECHNICAL_ASSESSMENT', 'DEMO_SESSION', 'SELECTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationNoteKind" AS ENUM ('NOTE', 'INTERVIEW_FEEDBACK', 'DEMO_FEEDBACK');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('TEXT', 'LONG_TEXT', 'URL', 'EMAIL', 'NUMBER', 'BOOLEAN', 'MEDIA', 'JSON');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EnquiryStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "EnquiryStatus" ADD VALUE 'FOLLOW_UP_REQUIRED';
ALTER TYPE "EnquiryStatus" ADD VALUE 'CONVERTED';

-- AlterEnum
ALTER TYPE "PublishStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_label" TEXT;

-- AlterTable
ALTER TABLE "enquiries" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "assigned_to_id" TEXT,
ADD COLUMN     "follow_up_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "faqs" ADD COLUMN     "page_key" TEXT,
ADD COLUMN     "programme_id" TEXT;

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "programmes" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "career_pathways" TEXT[],
ADD COLUMN     "eligibility" TEXT[],
ADD COLUMN     "exercises" TEXT[],
ADD COLUMN     "learning_outcomes" TEXT[],
ADD COLUMN     "objectives" TEXT[],
ADD COLUMN     "prerequisites" TEXT[],
ADD COLUMN     "projects" TEXT[],
ADD COLUMN     "seo_description" TEXT,
ADD COLUMN     "seo_title" TEXT,
ADD COLUMN     "target_audience" TEXT[],
ADD COLUMN     "tools" TEXT[];

-- AlterTable
ALTER TABLE "statistics" ADD COLUMN     "description" TEXT,
ADD COLUMN     "source_note" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by_id" TEXT;

-- AlterTable
ALTER TABLE "website_content" ADD COLUMN     "draft_value" TEXT,
ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "programme_images" (
    "programme_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_images_pkey" PRIMARY KEY ("programme_id","media_id")
);

-- CreateTable
CREATE TABLE "curriculum_modules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "programme_id" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_topics" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "module_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_pages" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "seo_image_id" TEXT,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "payload" JSONB NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_openings" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "location" TEXT NOT NULL,
    "work_mode" "WorkMode" NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT[],
    "required_skills" TEXT[],
    "preferred_qualifications" TEXT[],
    "certifications" TEXT[],
    "experience_min_years" INTEGER,
    "experience_note" TEXT,
    "application_instructions" TEXT,
    "application_deadline" TIMESTAMP(3),
    "seo_title" TEXT,
    "seo_description" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_applications" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "education" TEXT,
    "current_organisation" TEXT,
    "experience_years" INTEGER,
    "experience_summary" TEXT,
    "expertise" TEXT[],
    "technical_skills" TEXT[],
    "certifications" TEXT[],
    "job_opening_id" TEXT,
    "applied_position" TEXT NOT NULL,
    "employment_preference" "EmploymentType",
    "linkedin_url" TEXT,
    "portfolio_url" TEXT,
    "resume_id" TEXT,
    "additional_info" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "assigned_to_id" TEXT,
    "interview_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "source_ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_notes" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "ApplicationNoteKind" NOT NULL DEFAULT 'NOTE',
    "application_id" TEXT NOT NULL,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "note" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SettingType" NOT NULL DEFAULT 'TEXT',
    "value" TEXT NOT NULL,
    "hint" TEXT,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programme_images_media_id_idx" ON "programme_images"("media_id");

-- CreateIndex
CREATE INDEX "curriculum_modules_programme_id_sort_order_idx" ON "curriculum_modules"("programme_id", "sort_order");

-- CreateIndex
CREATE INDEX "curriculum_modules_status_idx" ON "curriculum_modules"("status");

-- CreateIndex
CREATE INDEX "curriculum_topics_module_id_sort_order_idx" ON "curriculum_topics"("module_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "site_pages_key_key" ON "site_pages"("key");

-- CreateIndex
CREATE INDEX "site_pages_status_idx" ON "site_pages"("status");

-- CreateIndex
CREATE INDEX "site_pages_seo_image_id_idx" ON "site_pages"("seo_image_id");

-- CreateIndex
CREATE INDEX "content_versions_entity_entity_id_idx" ON "content_versions"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "content_versions_actor_id_idx" ON "content_versions"("actor_id");

-- CreateIndex
CREATE INDEX "content_versions_created_at_idx" ON "content_versions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_entity_entity_id_version_key" ON "content_versions"("entity", "entity_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "job_openings_slug_key" ON "job_openings"("slug");

-- CreateIndex
CREATE INDEX "job_openings_status_sort_order_idx" ON "job_openings"("status", "sort_order");

-- CreateIndex
CREATE INDEX "job_openings_department_idx" ON "job_openings"("department");

-- CreateIndex
CREATE INDEX "trainer_applications_status_created_at_idx" ON "trainer_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "trainer_applications_job_opening_id_idx" ON "trainer_applications"("job_opening_id");

-- CreateIndex
CREATE INDEX "trainer_applications_assigned_to_id_idx" ON "trainer_applications"("assigned_to_id");

-- CreateIndex
CREATE INDEX "trainer_applications_email_idx" ON "trainer_applications"("email");

-- CreateIndex
CREATE INDEX "trainer_applications_created_at_idx" ON "trainer_applications"("created_at");

-- CreateIndex
CREATE INDEX "application_notes_application_id_idx" ON "application_notes"("application_id");

-- CreateIndex
CREATE INDEX "application_notes_author_id_idx" ON "application_notes"("author_id");

-- CreateIndex
CREATE INDEX "application_events_application_id_created_at_idx" ON "application_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "application_events_actor_id_idx" ON "application_events"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_key_key" ON "site_settings"("key");

-- CreateIndex
CREATE INDEX "site_settings_group_idx" ON "site_settings"("group");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "enquiries_assigned_to_id_idx" ON "enquiries"("assigned_to_id");

-- CreateIndex
CREATE INDEX "enquiries_follow_up_at_idx" ON "enquiries"("follow_up_at");

-- CreateIndex
CREATE INDEX "faqs_programme_id_idx" ON "faqs"("programme_id");

-- CreateIndex
CREATE INDEX "faqs_page_key_idx" ON "faqs"("page_key");

-- CreateIndex
CREATE INDEX "media_assets_is_private_idx" ON "media_assets"("is_private");

-- CreateIndex
CREATE INDEX "statistics_verified_by_id_idx" ON "statistics"("verified_by_id");

-- AddForeignKey
ALTER TABLE "programme_images" ADD CONSTRAINT "programme_images_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_images" ADD CONSTRAINT "programme_images_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_modules" ADD CONSTRAINT "curriculum_modules_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "curriculum_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_seo_image_id_fkey" FOREIGN KEY ("seo_image_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statistics" ADD CONSTRAINT "statistics_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_applications" ADD CONSTRAINT "trainer_applications_job_opening_id_fkey" FOREIGN KEY ("job_opening_id") REFERENCES "job_openings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_applications" ADD CONSTRAINT "trainer_applications_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_applications" ADD CONSTRAINT "trainer_applications_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "trainer_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "trainer_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

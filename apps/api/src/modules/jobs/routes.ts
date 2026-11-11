import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";
import { requiredSafeText, safeText, safeTextList } from "../../lib/sanitize.js";

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "GUEST_TRAINER",
  "INDUSTRY_EXPERT",
] as const;

export const WORK_MODES = ["ON_CAMPUS", "REMOTE", "HYBRID"] as const;

const base = {
  slug: z
    .string()
    .trim()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only"),
  title: requiredSafeText(160, "Job title"),
  department: requiredSafeText(100, "Department"),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  location: requiredSafeText(160, "Location"),
  workMode: z.enum(WORK_MODES),

  description: requiredSafeText(20_000, "Job description"),
  responsibilities: safeTextList(40, 400, "Responsibility").default([]),
  requiredSkills: safeTextList(40, 200, "Required skill").default([]),
  preferredQualifications: safeTextList(40, 300, "Preferred qualification").default([]),
  certifications: safeTextList(30, 200, "Certification").default([]),

  experienceMinYears: z.coerce.number().int().min(0).max(60).nullish(),
  experienceNote: safeText(500, "Experience note").nullish(),

  applicationInstructions: safeText(4_000, "Application instructions").nullish(),
  applicationDeadline: z.coerce.date().nullish(),

  seoTitle: safeText(200, "SEO title").nullish(),
  seoDescription: safeText(400, "SEO description").nullish(),

  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};

export const jobsRouter = createCrudRouter({
  name: "JobOpening",
  delegate: prisma.jobOpening,
  permissions: {
    read: "job:read",
    write: "job:write",
    remove: "job:delete",
    publish: "job:publish",
  },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["title", "department", "location", "description"],
  defaultOrderBy: { sortOrder: "asc" },
  sortableFields: ["sortOrder", "title", "department", "createdAt", "applicationDeadline"],
  publishable: true,
  reorderable: true,
  include: { _count: { select: { applications: true } } },
});

import { z } from "zod";
import { externalUrl, requiredSafeText, safeText, safeTextList, singleLineText } from "../../lib/sanitize.js";
import { EMPLOYMENT_TYPES } from "../jobs/routes.js";

export const APPLICATION_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "SHORTLISTED",
  "INTERVIEW_SCHEDULED",
  "TECHNICAL_ASSESSMENT",
  "DEMO_SESSION",
  "SELECTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const NOTE_KINDS = ["NOTE", "INTERVIEW_FEEDBACK", "DEMO_FEEDBACK"] as const;

/**
 * A list arriving as multipart/form-data is a repeated field or a
 * comma/newline separated string, depending on the client. Accept
 * both and normalise.
 */
const listField = (maxItems: number, maxLength: number, field: string) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return [];
      const parts = Array.isArray(v) ? v : v.split(/[\n,]/);
      return parts.map((s) => s.trim()).filter(Boolean);
    })
    .pipe(safeTextList(maxItems, maxLength, field));

/** Optional free text from a public form: "" means "not supplied". */
const optionalText = (max: number, field: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? undefined : v))
    .pipe(safeText(max, field).optional());

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()))
  .pipe(externalUrl.optional());

const optionalInt = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? undefined : Number(v)))
    .pipe(z.number().int().min(0).max(max).optional());

/**
 * The public application form. Posted as multipart/form-data because
 * it carries a resume, so every field arrives as a string.
 */
export const publicApplicationSchema = z
  .object({
    fullName: singleLineText(140, "Full name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
    phone: optionalText(40, "Phone"),
    location: optionalText(160, "Location"),

    education: optionalText(500, "Education"),
    currentOrganisation: optionalText(200, "Current organisation"),

    experienceYears: optionalInt(60),
    experienceSummary: optionalText(5_000, "Professional experience"),

    expertise: listField(30, 200, "Area of expertise"),
    technicalSkills: listField(50, 120, "Technical skill"),
    certifications: listField(30, 200, "Certification"),

    // Either an opening's id, or a free-text position when the
    // candidate applies speculatively.
    jobOpeningId: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim())),
    appliedPosition: singleLineText(200, "Applied position"),

    employmentPreference: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()))
      .pipe(z.enum(EMPLOYMENT_TYPES).optional()),

    linkedinUrl: optionalUrl,
    portfolioUrl: optionalUrl,

    additionalInfo: optionalText(5_000, "Additional information"),

    // Honeypot. Permissive on purpose: rejecting a filled value would
    // tell a bot which field to leave alone.
    website: z.string().max(200).optional(),
  })
  .strict();

export const listApplicationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  jobOpeningId: z.string().trim().max(60).optional(),
  assignedToId: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  archived: z
    .enum(["true", "false", "only"])
    .default("false"),
  sort: z.enum(["createdAt", "fullName", "status", "experienceYears"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export const updateApplicationStatusSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES),
    note: safeText(2_000, "Note").optional(),
    /** Required when moving to INTERVIEW_SCHEDULED. */
    scheduledAt: z.coerce.date().optional(),
    /** Attempt an email to the candidate about this transition. */
    notifyCandidate: z.boolean().default(false),
    /** Extra text appended to the notification, written by the admin. */
    notifyMessage: safeText(2_000, "Message").optional(),
  })
  .strict();

export const assignApplicationSchema = z
  .object({ assignedToId: z.string().min(1).nullable() })
  .strict();

export const addApplicationNoteSchema = z
  .object({
    body: requiredSafeText(5_000, "Note"),
    kind: z.enum(NOTE_KINDS).default("NOTE"),
  })
  .strict();

export const updateApplicationSchema = z
  .object({
    fullName: singleLineText(140, "Full name").optional(),
    phone: safeText(40, "Phone").nullish(),
    location: safeText(160, "Location").nullish(),
    education: safeText(500, "Education").nullish(),
    currentOrganisation: safeText(200, "Current organisation").nullish(),
    experienceYears: z.coerce.number().int().min(0).max(60).nullish(),
    experienceSummary: safeText(5_000, "Experience summary").nullish(),
    expertise: safeTextList(30, 200, "Expertise").optional(),
    technicalSkills: safeTextList(50, 120, "Technical skill").optional(),
    certifications: safeTextList(30, 200, "Certification").optional(),
    linkedinUrl: externalUrl.nullish(),
    portfolioUrl: externalUrl.nullish(),
    additionalInfo: safeText(5_000, "Additional information").nullish(),
    interviewAt: z.coerce.date().nullish(),
  })
  .strict();

export const exportApplicationsSchema = listApplicationsSchema
  .omit({ page: true, perPage: true, sort: true, dir: true })
  .extend({ format: z.enum(["csv", "json"]).default("csv") });

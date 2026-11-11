import { z } from "zod";
import { requiredSafeText, safeText, singleLineText } from "../../lib/sanitize.js";

/**
 * Enquiry statuses.
 *
 * IN_PROGRESS is retained because rows created before the workflow
 * was expanded use it; UNDER_REVIEW is its replacement and is what
 * the admin portal offers for new transitions.
 */
export const ENQUIRY_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "UNDER_REVIEW",
  "CONTACTED",
  "FOLLOW_UP_REQUIRED",
  "CONVERTED",
  "CLOSED",
  "SPAM",
] as const;

/**
 * Enquiry categories offered by the contact form. Kept as a bounded
 * string rather than a database enum so the list can change without a
 * migration and an older cached client still posts successfully.
 */
export const ENQUIRY_SUBJECTS = [
  "Institutional Training",
  "College Partnership",
  "SOC Analyst Programme",
  "AI Security Programme",
  "Corporate Training",
  "Trainer Collaboration",
  "General Enquiry",
  "Other",
] as const;

export const createEnquirySchema = z
  .object({
    name: singleLineText(120, "Name").refine((v) => v.length >= 2, "Please give your name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
    phone: safeText(40, "Phone").optional(),
    organisation: safeText(160, "Organisation").optional(),
    designation: safeText(120, "Designation").optional(),
    subject: safeText(200, "Enquiry type").optional(),
    programme: safeText(160, "Programme").optional(),
    message: requiredSafeText(5_000, "Message").refine(
      (v) => v.length >= 10,
      "Please tell us a little more"
    ),
    // Honeypot. Deliberately permissive: if the schema rejected a
    // filled-in value, the 400 would tell a bot which field to omit.
    // The handler accepts it and silently discards instead.
    website: z.string().max(200).optional(),
  })
  .strict();

export const listEnquiriesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(ENQUIRY_STATUSES).optional(),
  subject: z.string().trim().max(200).optional(),
  assignedToId: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Enquiries whose follow-up date has arrived. */
  dueOnly: z.coerce.boolean().default(false),
  archived: z.enum(["true", "false", "only"]).default("false"),
  sort: z.enum(["createdAt", "name", "status", "followUpAt"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export const updateStatusSchema = z
  .object({
    status: z.enum(ENQUIRY_STATUSES),
    /** Recorded as a note alongside the transition. */
    note: safeText(2_000, "Note").optional(),
  })
  .strict();

export const assignEnquirySchema = z
  .object({ assignedToId: z.string().min(1).nullable() })
  .strict();

export const followUpSchema = z
  .object({ followUpAt: z.coerce.date().nullable() })
  .strict();

export const addNoteSchema = z
  .object({ body: requiredSafeText(5_000, "Note") })
  .strict();

export const exportQuerySchema = listEnquiriesSchema
  .omit({ page: true, perPage: true, sort: true, dir: true })
  .extend({ format: z.enum(["csv", "json"]).default("csv") });

import { z } from "zod";

export const createEnquirySchema = z
  .object({
    name: z.string().trim().min(2, "Please give your name").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
    phone: z.string().trim().max(40).optional(),
    organisation: z.string().trim().max(160).optional(),
    subject: z.string().trim().max(200).optional(),
    message: z.string().trim().min(10, "Please tell us a little more").max(5000),
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
  status: z.enum(["NEW", "IN_PROGRESS", "CONTACTED", "CLOSED", "SPAM"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const updateStatusSchema = z
  .object({ status: z.enum(["NEW", "IN_PROGRESS", "CONTACTED", "CLOSED", "SPAM"]) })
  .strict();

export const addNoteSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();

export const exportQuerySchema = listEnquiriesSchema
  .omit({ page: true, perPage: true })
  .extend({ format: z.enum(["csv", "json"]).default("csv") });

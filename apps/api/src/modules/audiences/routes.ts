import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";

const base = {
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  heading: z.string().trim().min(1).max(300),
  blurb: z.string().trim().min(1).max(1200),
  outcome: z.string().trim().max(300).nullish(),
  bullets: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  imageId: z.string().min(1).nullish(),
};

export const audiencesRouter = createCrudRouter({
  name: "Audience",
  delegate: prisma.audience,
  permissions: { read: "audience:read", write: "audience:write" },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["name", "heading", "blurb"],
  defaultOrderBy: { sortOrder: "asc" },
  publishable: true,
  include: { image: true },
});

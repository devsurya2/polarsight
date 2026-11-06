import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";

const base = {
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only"),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(160),
  tag: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(600),
  body: z.string().trim().max(20_000).nullish(),
  durationWeeks: z.coerce.number().int().min(1).max(260).nullish(),
  level: z.string().trim().max(60).nullish(),
  points: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  imageId: z.string().min(1).nullish(),
};

export const programmesRouter = createCrudRouter({
  name: "Programme",
  delegate: prisma.programme,
  permissions: {
    read: "programme:read",
    write: "programme:write",
    remove: "programme:delete",
    publish: "programme:publish",
  },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["name", "code", "tag", "summary"],
  defaultOrderBy: { sortOrder: "asc" },
  publishable: true,
  include: { image: true },
});

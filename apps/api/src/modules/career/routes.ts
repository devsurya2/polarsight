import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";

const base = {
  key: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};

export const careerRouter = createCrudRouter({
  name: "CareerContent",
  delegate: prisma.careerContent,
  permissions: { read: "career:read", write: "career:write" },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["title", "body"],
  defaultOrderBy: { sortOrder: "asc" },
  publishable: true,
});

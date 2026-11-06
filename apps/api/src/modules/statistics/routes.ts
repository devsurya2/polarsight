import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";

const base = {
  key: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(60),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};

export const statisticsRouter = createCrudRouter({
  name: "Statistic",
  delegate: prisma.statistic,
  permissions: { read: "statistic:read", write: "statistic:write" },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["label", "key"],
  defaultOrderBy: { sortOrder: "asc" },
  publishable: true,
});

import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";

const base = {
  key: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, "Letters, digits, dot, dash and underscore only"),
  section: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["TEXT", "RICH_TEXT", "JSON"]).default("TEXT"),
  value: z.string().max(50_000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};

export const contentRouter = createCrudRouter({
  name: "WebsiteContent",
  delegate: prisma.websiteContent,
  permissions: { read: "content:read", write: "content:write" },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["key", "label", "value"],
  defaultOrderBy: { key: "asc" },
  publishable: true,
});

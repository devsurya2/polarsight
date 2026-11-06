import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createCrudRouter } from "../../lib/crud.js";

const base = {
  question: z.string().trim().min(1).max(400),
  answer: z.string().trim().min(1).max(20_000),
  category: z.string().trim().max(80).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};

export const faqsRouter = createCrudRouter({
  name: "FAQ",
  delegate: prisma.fAQ,
  permissions: { read: "faq:read", write: "faq:write" },
  createSchema: z.object(base).strict(),
  updateSchema: z.object(base).partial().strict(),
  searchFields: ["question", "answer"],
  defaultOrderBy: { sortOrder: "asc" },
  publishable: true,
});

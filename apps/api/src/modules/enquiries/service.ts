import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import { paginated, skipTake } from "../../lib/pagination.js";

interface Filters {
  search?: string | undefined;
  status?: Prisma.EnquiryWhereInput["status"];
  from?: Date | undefined;
  to?: Date | undefined;
}

export function buildWhere(f: Filters): Prisma.EnquiryWhereInput {
  const where: Prisma.EnquiryWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to ? { lte: f.to } : {}),
    };
  }
  if (f.search) {
    where.OR = [
      { name: { contains: f.search, mode: "insensitive" } },
      { email: { contains: f.search, mode: "insensitive" } },
      { organisation: { contains: f.search, mode: "insensitive" } },
      { subject: { contains: f.search, mode: "insensitive" } },
      { message: { contains: f.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function list(f: Filters, page: number, perPage: number) {
  const where = buildWhere(f);
  const [items, total] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...skipTake({ page, perPage }),
      select: {
        id: true,
        name: true,
        email: true,
        organisation: true,
        subject: true,
        status: true,
        createdAt: true,
        _count: { select: { notes: true } },
      },
    }),
    prisma.enquiry.count({ where }),
  ]);
  return paginated(items, total, { page, perPage });
}

export async function detail(id: string) {
  const found = await prisma.enquiry.findUnique({
    where: { id },
    include: {
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!found) throw new NotFoundError("Enquiry");
  return found;
}

export async function exportRows(f: Filters) {
  return prisma.enquiry.findMany({
    where: buildWhere(f),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      name: true,
      email: true,
      phone: true,
      organisation: true,
      subject: true,
      message: true,
    },
  });
}

/** RFC 4180 quoting, and a guard against spreadsheet formula injection. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);

  const cell = (v: unknown): string => {
    let s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
    // A leading =, +, - or @ makes Excel treat the cell as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\r\n");
}

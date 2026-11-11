import type { EnquiryStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import { paginated, skipTake } from "../../lib/pagination.js";

export interface Filters {
  search?: string | undefined;
  status?: EnquiryStatus | undefined;
  subject?: string | undefined;
  assignedToId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  dueOnly?: boolean;
  archived?: "true" | "false" | "only";
}

export function buildWhere(f: Filters): Prisma.EnquiryWhereInput {
  const where: Prisma.EnquiryWhereInput = {};

  if (f.status) where.status = f.status;
  if (f.subject) where.subject = f.subject;
  if (f.assignedToId) where.assignedToId = f.assignedToId;

  // Archived enquiries are out of the working list unless asked for.
  if (f.archived === "only") where.archivedAt = { not: null };
  else if (f.archived !== "true") where.archivedAt = null;

  // Follow-ups that are due now or overdue.
  if (f.dueOnly) where.followUpAt = { not: null, lte: new Date() };

  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to ? { lte: f.to } : {}),
    };
  }

  if (f.search) {
    const contains = { contains: f.search, mode: "insensitive" as const };
    where.OR = [
      { name: contains },
      { email: contains },
      { organisation: contains },
      { designation: contains },
      { subject: contains },
      { programme: contains },
      { message: contains },
    ];
  }

  return where;
}

export async function list(
  f: Filters,
  page: number,
  perPage: number,
  sort: "createdAt" | "name" | "status" | "followUpAt" = "createdAt",
  dir: "asc" | "desc" = "desc"
) {
  const where = buildWhere(f);
  const [items, total] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      // Nulls last on followUpAt, so undated enquiries do not crowd
      // out the ones that actually need chasing.
      orderBy: sort === "followUpAt" ? [{ followUpAt: { sort: dir, nulls: "last" } }] : [{ [sort]: dir }],
      ...skipTake({ page, perPage }),
      select: {
        id: true,
        name: true,
        email: true,
        organisation: true,
        designation: true,
        subject: true,
        programme: true,
        status: true,
        followUpAt: true,
        archivedAt: true,
        createdAt: true,
        assignedTo: { select: { id: true, name: true } },
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
      assignedTo: { select: { id: true, name: true, email: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!found) throw new NotFoundError("Enquiry");

  // Captured for abuse investigation, not part of the triage view.
  const { sourceIp: _ip, userAgent: _ua, ...safe } = found;
  return safe;
}

/**
 * The administrative history of one enquiry: its status changes, its
 * notes and its assignments, in one timeline.
 *
 * Status changes come from the audit log, which is append-only, so
 * the history cannot be edited through the admin interface.
 */
export async function history(id: string) {
  const [notes, audit] = await Promise.all([
    prisma.enquiryNote.findMany({
      where: { enquiryId: id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entity: "Enquiry", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
    }),
  ]);

  const events = [
    ...notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      at: n.createdAt,
      actor: n.author,
      body: n.body,
    })),
    ...audit.map((a) => ({
      kind: "action" as const,
      id: a.id,
      at: a.createdAt,
      actor: a.actor,
      action: a.action,
      before: a.before,
      after: a.after,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return events;
}

export async function exportRows(f: Filters) {
  const rows = await prisma.enquiry.findMany({
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
      designation: true,
      subject: true,
      programme: true,
      message: true,
      followUpAt: true,
      assignedTo: { select: { name: true } },
    },
  });

  // Internal notes are deliberately excluded from the export.
  return rows.map((r) => ({ ...r, assignedTo: r.assignedTo?.name ?? "" }));
}

export const EXPORT_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "createdAt", header: "Received" },
  { key: "status", header: "Status" },
  { key: "name", header: "Name" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "organisation", header: "Organisation" },
  { key: "designation", header: "Designation" },
  { key: "subject", header: "Enquiry type" },
  { key: "programme", header: "Programme of interest" },
  { key: "message", header: "Message" },
  { key: "followUpAt", header: "Follow up on" },
  { key: "assignedTo", header: "Assigned to" },
];

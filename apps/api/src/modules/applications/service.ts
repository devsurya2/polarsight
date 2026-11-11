import type { ApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { paginated, skipTake } from "../../lib/pagination.js";
import {
  applicationTemplates,
  sendMail,
  type ApplicationTemplateKey,
  type MailResult,
} from "../../lib/email.js";

export interface ApplicationFilters {
  search?: string | undefined;
  status?: ApplicationStatus | undefined;
  jobOpeningId?: string | undefined;
  assignedToId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  archived?: "true" | "false" | "only";
}

export function buildWhere(f: ApplicationFilters): Prisma.TrainerApplicationWhereInput {
  const where: Prisma.TrainerApplicationWhereInput = {};

  if (f.status) where.status = f.status;
  if (f.jobOpeningId) where.jobOpeningId = f.jobOpeningId;
  if (f.assignedToId) where.assignedToId = f.assignedToId;

  // Archived applications are hidden unless asked for, so the working
  // list stays the live pipeline.
  if (f.archived === "only") where.archivedAt = { not: null };
  else if (f.archived !== "true") where.archivedAt = null;

  if (f.from || f.to) {
    where.createdAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  }

  if (f.search) {
    const contains = { contains: f.search, mode: "insensitive" as const };
    where.OR = [
      { fullName: contains },
      { email: contains },
      { appliedPosition: contains },
      { currentOrganisation: contains },
      { location: contains },
      { expertise: { has: f.search } },
      { technicalSkills: { has: f.search } },
    ];
  }

  return where;
}

/** Columns the pipeline table needs. Notes and feedback are excluded. */
const listSelect = {
  id: true,
  fullName: true,
  email: true,
  appliedPosition: true,
  experienceYears: true,
  expertise: true,
  status: true,
  interviewAt: true,
  archivedAt: true,
  createdAt: true,
  jobOpening: { select: { id: true, title: true } },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { notes: true } },
} satisfies Prisma.TrainerApplicationSelect;

export async function list(
  f: ApplicationFilters,
  page: number,
  perPage: number,
  sort: "createdAt" | "fullName" | "status" | "experienceYears" = "createdAt",
  dir: "asc" | "desc" = "desc"
) {
  const where = buildWhere(f);
  const [items, total] = await Promise.all([
    prisma.trainerApplication.findMany({
      where,
      orderBy: { [sort]: dir },
      ...skipTake({ page, perPage }),
      select: listSelect,
    }),
    prisma.trainerApplication.count({ where }),
  ]);
  return paginated(items, total, { page, perPage });
}

export async function detail(id: string) {
  const found = await prisma.trainerApplication.findUnique({
    where: { id },
    include: {
      jobOpening: { select: { id: true, title: true, department: true, slug: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      resume: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          scanStatus: true,
          scanDetail: true,
          scannedAt: true,
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
      events: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!found) throw new NotFoundError("Application");

  // sourceIp and userAgent are held for abuse investigation and are
  // not part of the reviewer's view of a candidate.
  const { sourceIp: _ip, userAgent: _ua, ...safe } = found;
  return safe;
}

/** Transitions that make sense. Anything else needs a reason stated. */
const TERMINAL: ApplicationStatus[] = ["SELECTED", "REJECTED", "WITHDRAWN"];

/**
 * Moves an application to a new status, recording the transition in
 * its history. Returns what happened to the optional notification, so
 * the caller can report honestly whether an email actually went out.
 */
export async function changeStatus(opts: {
  id: string;
  status: ApplicationStatus;
  note?: string | undefined;
  scheduledAt?: Date | undefined;
  actorId: string;
  notifyCandidate: boolean;
  notifyMessage?: string | undefined;
}): Promise<{ item: Awaited<ReturnType<typeof detail>>; mail: MailResult | null }> {
  const before = await prisma.trainerApplication.findUnique({
    where: { id: opts.id },
    select: { id: true, status: true, fullName: true, email: true, appliedPosition: true },
  });
  if (!before) throw new NotFoundError("Application");

  if (before.status === opts.status) {
    throw new BadRequestError(`This application is already ${label(opts.status)}`);
  }
  if (TERMINAL.includes(before.status) && !TERMINAL.includes(opts.status)) {
    throw new BadRequestError(
      `This application is ${label(before.status)}. Reopening it is not supported; create a new application instead.`
    );
  }
  if (opts.status === "INTERVIEW_SCHEDULED" && !opts.scheduledAt) {
    throw new BadRequestError("Set the interview date and time to schedule an interview");
  }
  if (opts.scheduledAt && opts.scheduledAt.getTime() < Date.now() - 60_000) {
    throw new BadRequestError("The interview time is in the past");
  }

  // The status change and its history entry are one unit: a pipeline
  // with gaps in its history is not auditable.
  await prisma.$transaction([
    prisma.trainerApplication.update({
      where: { id: opts.id },
      data: {
        status: opts.status,
        ...(opts.scheduledAt ? { interviewAt: opts.scheduledAt } : {}),
      },
    }),
    prisma.applicationEvent.create({
      data: {
        applicationId: opts.id,
        fromStatus: before.status,
        toStatus: opts.status,
        note: opts.note ?? null,
        scheduledAt: opts.scheduledAt ?? null,
        actorId: opts.actorId,
      },
    }),
  ]);

  let mail: MailResult | null = null;
  if (opts.notifyCandidate) {
    const key = templateFor(opts.status);
    if (!key) {
      throw new BadRequestError(`There is no candidate notification for ${label(opts.status)}`);
    }
    const body = applicationTemplates[key]({
      name: before.fullName,
      position: before.appliedPosition,
      extra: opts.notifyMessage,
    });
    mail = await sendMail({ to: before.email, ...body });

    await prisma.applicationEvent.create({
      data: {
        applicationId: opts.id,
        fromStatus: opts.status,
        toStatus: opts.status,
        note: mail.sent
          ? `Notification email sent to the candidate (${key}).`
          : mail.reason === "not_configured"
            ? `Notification NOT sent: email is not configured on this server.`
            : `Notification FAILED: ${mail.detail ?? "unknown error"}.`,
        actorId: opts.actorId,
      },
    });
  }

  return { item: await detail(opts.id), mail };
}

/** Which candidate-facing template, if any, suits a status. */
function templateFor(status: ApplicationStatus): ApplicationTemplateKey | null {
  switch (status) {
    case "SHORTLISTED":
      return "shortlisted";
    case "INTERVIEW_SCHEDULED":
      return "interview";
    case "SELECTED":
      return "selected";
    case "REJECTED":
      return "rejected";
    default:
      return null;
  }
}

export const label = (status: string) => status.replace(/_/g, " ").toLowerCase();

export async function exportRows(f: ApplicationFilters) {
  const rows = await prisma.trainerApplication.findMany({
    where: buildWhere(f),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      fullName: true,
      email: true,
      phone: true,
      location: true,
      appliedPosition: true,
      employmentPreference: true,
      currentOrganisation: true,
      education: true,
      experienceYears: true,
      expertise: true,
      technicalSkills: true,
      certifications: true,
      linkedinUrl: true,
      portfolioUrl: true,
      interviewAt: true,
      assignedTo: { select: { name: true } },
    },
  });

  // Internal notes and interview feedback are deliberately absent
  // from the export: an exported spreadsheet is the easiest thing in
  // the world to forward outside the organisation.
  return rows.map((r) => ({ ...r, assignedTo: r.assignedTo?.name ?? "" }));
}

export const EXPORT_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "createdAt", header: "Applied on" },
  { key: "status", header: "Status" },
  { key: "fullName", header: "Name" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "location", header: "Location" },
  { key: "appliedPosition", header: "Position" },
  { key: "employmentPreference", header: "Employment preference" },
  { key: "currentOrganisation", header: "Current organisation" },
  { key: "education", header: "Education" },
  { key: "experienceYears", header: "Years of experience" },
  { key: "expertise", header: "Expertise" },
  { key: "technicalSkills", header: "Technical skills" },
  { key: "certifications", header: "Certifications" },
  { key: "linkedinUrl", header: "LinkedIn" },
  { key: "portfolioUrl", header: "Portfolio" },
  { key: "interviewAt", header: "Interview at" },
  { key: "assignedTo", header: "Assigned to" },
];

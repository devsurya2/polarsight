/**
 * Resources that are a straightforward audited CRUD screen.
 *
 * A thin configuration over <ResourcePage>, so behaviour stays
 * identical with the rest of the portal. Anything with real workflow of
 * its own — pages, programmes, applications, enquiries, media — has a
 * purpose-built screen instead.
 */

import { Link } from "react-router-dom";
import { ResourcePage, type ResourceConfig } from "@/components/ResourcePage";
import { Badge, LinkButton, Notice, humanise } from "@/components/ui";
import { formatDate } from "@/lib/format";

type Row = Record<string, unknown> & { id: string; status?: string };

const sortOrderField = {
  name: "sortOrder",
  label: "Display order",
  kind: "number" as const,
  hint: "Lower numbers appear first on the website.",
  half: true,
};

/* ── Job openings ─────────────────────────────────────────── */

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "GUEST_TRAINER", label: "Guest Trainer" },
  { value: "INDUSTRY_EXPERT", label: "Industry Expert" },
];

const WORK_MODES = [
  { value: "ON_CAMPUS", label: "On-campus" },
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
];

const jobs: ResourceConfig<Row> = {
  path: "/jobs",
  title: "Job openings",
  description:
    "Trainer, mentor and content roles. Only published openings appear on the public careers page, and an opening past its deadline is treated as closed.",
  singular: "Job opening",
  permissions: {
    read: "job:read",
    write: "job:write",
    remove: "job:delete",
    publish: "job:publish",
  },
  publishable: true,
  archivable: true,
  breadcrumbs: [{ label: "Recruitment" }, { label: "Job openings" }],
  emptyHint: "Create an opening to start accepting trainer applications through the website.",
  notice: (
    <Notice tone="caution" icon="info">
      Nothing here states a salary, a start date or a headcount. Keep it that way unless the business
      has agreed those terms.
    </Notice>
  ),
  columns: [
    {
      header: "Title",
      sortKey: "title",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{String(r.title)}</p>
          <p className="mono truncate text-faint">{String(r.slug)}</p>
        </div>
      ),
    },
    { header: "Department", sortKey: "department", render: (r) => <Badge>{String(r.department)}</Badge> },
    {
      header: "Arrangement",
      render: (r) => (
        <span className="text-xs text-body">
          {humanise(String(r.employmentType))} · {humanise(String(r.workMode))}
        </span>
      ),
    },
    {
      header: "Deadline",
      sortKey: "applicationDeadline",
      render: (r) => {
        if (!r.applicationDeadline) return <span className="text-xs text-faint">Open-ended</span>;
        const date = new Date(String(r.applicationDeadline));
        const past = date.getTime() < Date.now();
        return (
          <span className={`text-xs ${past ? "text-danger" : "text-body"}`}>
            {formatDate(date)}
            {past && " (passed)"}
          </span>
        );
      },
    },
    {
      header: "Applications",
      render: (r) => {
        const count = (r._count as { applications?: number } | undefined)?.applications ?? 0;
        return count > 0 ? (
          <Link
            to={`/applications?jobOpeningId=${r.id}`}
            className="tabular text-sm text-accent-ice underline-offset-2 hover:underline"
          >
            {count}
          </Link>
        ) : (
          <span className="text-xs text-faint">0</span>
        );
      },
    },
  ],
  rowActions: (row) => {
    const count = (row._count as { applications?: number } | undefined)?.applications ?? 0;
    if (count === 0) return null;
    return (
      <LinkButton to={`/applications?jobOpeningId=${row.id}`} size="sm" variant="ghost" icon="users">
        <span className="sr-only">View applications</span>
      </LinkButton>
    );
  },
  fields: [
    { name: "title", label: "Job title", kind: "text", required: true, half: true },
    {
      name: "slug",
      label: "Slug",
      kind: "slug",
      required: true,
      half: true,
      hint: "Used in the public URL.",
      placeholder: "soc-analyst-trainer",
    },
    { name: "department", label: "Department", kind: "text", required: true, half: true },
    { name: "location", label: "Location", kind: "text", required: true, half: true },
    {
      name: "employmentType",
      label: "Employment type",
      kind: "select",
      required: true,
      half: true,
      options: EMPLOYMENT_TYPES,
    },
    {
      name: "workMode",
      label: "Work mode",
      kind: "select",
      required: true,
      half: true,
      options: WORK_MODES,
    },
    {
      name: "description",
      label: "Job description",
      kind: "textarea",
      required: true,
      rows: 6,
      group: "The role",
    },
    { name: "responsibilities", label: "Responsibilities", kind: "stringList", group: "The role" },
    {
      name: "requiredSkills",
      label: "Required skills",
      kind: "stringList",
      group: "Requirements",
    },
    {
      name: "preferredQualifications",
      label: "Preferred qualifications",
      kind: "stringList",
      group: "Requirements",
    },
    { name: "certifications", label: "Certifications", kind: "stringList", group: "Requirements" },
    {
      name: "experienceMinYears",
      label: "Minimum years of experience",
      kind: "number",
      half: true,
      group: "Requirements",
      hint: "Leave blank if there is no minimum.",
    },
    {
      name: "experienceNote",
      label: "Experience note",
      kind: "text",
      half: true,
      group: "Requirements",
      hint: "Any nuance the minimum alone does not capture.",
    },
    {
      name: "applicationInstructions",
      label: "Application instructions",
      kind: "textarea",
      rows: 3,
      group: "Applying",
    },
    {
      name: "applicationDeadline",
      label: "Application deadline",
      kind: "date",
      half: true,
      group: "Applying",
      hint: "After this date the opening stops accepting applications.",
    },
    { ...sortOrderField, group: "Applying" },
    { name: "seoTitle", label: "SEO title", kind: "text", group: "Search listing" },
    {
      name: "seoDescription",
      label: "SEO description",
      kind: "textarea",
      rows: 2,
      group: "Search listing",
    },
  ],
};

export const JobsPage = () => <ResourcePage config={jobs} />;

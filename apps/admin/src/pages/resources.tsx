import { ResourcePage, type ResourceConfig } from "@/components/ResourcePage";
import { Badge } from "@/components/ui";

/* Each resource is a thin configuration over one audited CRUD screen,
   so behaviour stays identical across the website content types. */

type Row = Record<string, unknown> & { id: string; status?: string };

const truncate = (v: unknown, n = 70) => {
  const s = v === null || v === undefined ? "" : String(v);
  return s.length > n ? `${s.slice(0, n)}…` : s || "—";
};

const programmes: ResourceConfig<Row> = {
  path: "/programmes",
  title: "Programmes",
  description: "Training tracks shown on the website. Only published tracks are public.",
  singular: "Programme",
  permissions: {
    read: "programme:read",
    write: "programme:write",
    remove: "programme:delete",
    publish: "programme:publish",
  },
  publishable: true,
  columns: [
    { header: "Code", render: (r) => <span className="font-mono text-xs text-faint">{String(r.code)}</span> },
    { header: "Name", render: (r) => <span className="font-medium">{String(r.name)}</span> },
    { header: "Tag", render: (r) => <Badge>{String(r.tag)}</Badge> },
    { header: "Duration", render: (r) => (r.durationWeeks ? `${r.durationWeeks} weeks` : "—") },
    { header: "Level", render: (r) => String(r.level ?? "—") },
  ],
  fields: [
    { name: "code", label: "Code", kind: "text", required: true, placeholder: "TRK-05" },
    { name: "slug", label: "Slug", kind: "text", required: true, hint: "Lowercase letters, digits and hyphens. Used in the URL.", placeholder: "threat-hunting" },
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "tag", label: "Category", kind: "text", required: true, placeholder: "Security Operations" },
    { name: "summary", label: "Summary", kind: "textarea", required: true, rows: 3 },
    { name: "body", label: "Full description", kind: "textarea", rows: 6 },
    { name: "points", label: "Bullet points", kind: "stringList", rows: 5 },
    { name: "durationWeeks", label: "Duration in weeks", kind: "number" },
    { name: "level", label: "Level", kind: "select", options: [
      { value: "Entry", label: "Entry" },
      { value: "Intermediate", label: "Intermediate" },
      { value: "Advanced", label: "Advanced" },
    ] },
    { name: "sortOrder", label: "Sort order", kind: "number", hint: "Lower numbers appear first." },
  ],
};

const content: ResourceConfig<Row> = {
  path: "/content",
  title: "Page content",
  description: "Individual blocks of copy on the public website, addressed by key.",
  singular: "Content block",
  permissions: { read: "content:read", write: "content:write" },
  publishable: true,
  columns: [
    { header: "Key", render: (r) => <span className="font-mono text-xs text-accent-ice">{String(r.key)}</span> },
    { header: "Section", render: (r) => <Badge>{String(r.section)}</Badge> },
    { header: "Label", render: (r) => String(r.label) },
    { header: "Value", render: (r) => <span className="text-body">{truncate(r.value)}</span> },
  ],
  fields: [
    { name: "key", label: "Key", kind: "text", required: true, createOnly: true, hint: "Cannot be changed later; the website reads this key.", placeholder: "hero.headline" },
    { name: "section", label: "Section", kind: "text", required: true, placeholder: "hero" },
    { name: "label", label: "Label", kind: "text", required: true, hint: "Shown to editors, not on the website." },
    { name: "type", label: "Type", kind: "select", options: [
      { value: "TEXT", label: "Plain text" },
      { value: "RICH_TEXT", label: "Rich text" },
      { value: "JSON", label: "JSON" },
    ] },
    { name: "value", label: "Value", kind: "textarea", required: true, rows: 6 },
    { name: "sortOrder", label: "Sort order", kind: "number" },
  ],
};

const faqs: ResourceConfig<Row> = {
  path: "/faqs",
  title: "FAQs",
  description: "Questions and answers shown on the website.",
  singular: "FAQ",
  permissions: { read: "faq:read", write: "faq:write" },
  publishable: true,
  columns: [
    { header: "Question", render: (r) => <span className="font-medium">{truncate(r.question, 80)}</span> },
    { header: "Answer", render: (r) => <span className="text-body">{truncate(r.answer, 60)}</span> },
    { header: "Order", render: (r) => String(r.sortOrder ?? 0) },
  ],
  fields: [
    { name: "question", label: "Question", kind: "textarea", required: true, rows: 2 },
    { name: "answer", label: "Answer", kind: "textarea", required: true, rows: 6 },
    { name: "category", label: "Category", kind: "text" },
    { name: "sortOrder", label: "Sort order", kind: "number" },
  ],
};

const statistics: ResourceConfig<Row> = {
  path: "/statistics",
  title: "Statistics",
  description:
    "Figures shown on the website. Publish only numbers you can evidence.",
  singular: "Statistic",
  permissions: { read: "statistic:read", write: "statistic:write" },
  publishable: true,
  columns: [
    { header: "Key", render: (r) => <span className="font-mono text-xs text-faint">{String(r.key)}</span> },
    { header: "Value", render: (r) => <span className="text-lg font-semibold">{String(r.value)}</span> },
    { header: "Label", render: (r) => String(r.label) },
  ],
  fields: [
    { name: "key", label: "Key", kind: "text", required: true, createOnly: true },
    { name: "value", label: "Value", kind: "text", required: true, placeholder: "120" },
    { name: "label", label: "Label", kind: "text", required: true, placeholder: "Students trained" },
    { name: "sortOrder", label: "Sort order", kind: "number" },
  ],
};

const audiences: ResourceConfig<Row> = {
  path: "/audiences",
  title: "Who we serve",
  description: "Audience groups. Not currently shown on the public site.",
  singular: "Audience",
  permissions: { read: "audience:read", write: "audience:write" },
  publishable: true,
  columns: [
    { header: "Name", render: (r) => <span className="font-medium">{String(r.name)}</span> },
    { header: "Heading", render: (r) => <span className="text-body">{truncate(r.heading)}</span> },
  ],
  fields: [
    { name: "slug", label: "Slug", kind: "text", required: true, createOnly: true },
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "heading", label: "Heading", kind: "textarea", required: true, rows: 2 },
    { name: "blurb", label: "Blurb", kind: "textarea", required: true, rows: 4 },
    { name: "outcome", label: "Outcome line", kind: "text" },
    { name: "bullets", label: "Bullet points", kind: "stringList" },
    { name: "sortOrder", label: "Sort order", kind: "number" },
  ],
};

const career: ResourceConfig<Row> = {
  path: "/career",
  title: "Careers and placement",
  description: "Copy describing how the programme runs and how placement works.",
  singular: "Career block",
  permissions: { read: "career:read", write: "career:write" },
  publishable: true,
  columns: [
    { header: "Key", render: (r) => <span className="font-mono text-xs text-faint">{String(r.key)}</span> },
    { header: "Title", render: (r) => <span className="font-medium">{String(r.title)}</span> },
    { header: "Body", render: (r) => <span className="text-body">{truncate(r.body)}</span> },
  ],
  fields: [
    { name: "key", label: "Key", kind: "text", required: true, createOnly: true },
    { name: "title", label: "Title", kind: "text", required: true },
    { name: "body", label: "Body", kind: "textarea", required: true, rows: 6 },
    { name: "sortOrder", label: "Sort order", kind: "number" },
  ],
};

export const ProgrammesPage = () => <ResourcePage config={programmes} />;
export const ContentPage = () => <ResourcePage config={content} />;
export const FaqsPage = () => <ResourcePage config={faqs} />;
export const StatisticsPage = () => <ResourcePage config={statistics} />;
export const AudiencesPage = () => <ResourcePage config={audiences} />;
export const CareerPage = () => <ResourcePage config={career} />;

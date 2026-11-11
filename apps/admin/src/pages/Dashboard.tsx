/**
 * Dashboard.
 *
 * Every figure comes from GET /api/dashboard, which counts rows at
 * request time. A card whose data the viewer lacks permission to read
 * is absent from the response, and absent from this screen — it is
 * never rendered as a zero, because zero is a claim.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@/lib/hooks";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";
import { qs } from "@/lib/api";
import { Icon, type IconName } from "@/components/Icon";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  LinkButton,
  PageHeader,
  SectionHeading,
  StatCard,
  StatusBadge,
  humanise,
} from "@/components/ui";

interface Dashboard {
  range: { from: string; to: string };
  cards: {
    enquiries: {
      total: number;
      new: number;
      pending: number;
      inPeriod: number;
      followUpDue: number;
      unassigned: number;
      converted: number;
    } | null;
    applications: {
      total: number;
      new: number;
      pending: number;
      inPeriod: number;
      shortlisted: number;
      upcomingInterviews: number;
      selected: number;
    } | null;
    programmes: {
      total: number;
      published: number;
      draft: number;
      archived: number;
      curriculumModules: number;
    } | null;
    jobs: { total: number; open: number; draft: number; archived: number; closingSoon: number } | null;
    pages: { total: number; published: number; draft: number; withUnpublishedChanges: number } | null;
    content: { total: number; published: number; draft: number; pendingDrafts: number } | null;
    media: { total: number; totalBytes: number } | null;
    admins: { total: number; active: number; inactive: number; roles: number; lockedOut: number } | null;
  };
  recentEnquiries:
    | Array<{
        id: string;
        name: string;
        email: string;
        organisation: string | null;
        subject: string | null;
        status: string;
        createdAt: string;
      }>
    | null;
  recentApplications:
    | Array<{
        id: string;
        fullName: string;
        appliedPosition: string;
        experienceYears: number | null;
        status: string;
        createdAt: string;
      }>
    | null;
  recentActivity:
    | Array<{
        id: string;
        action: string;
        entity: string;
        entityId: string | null;
        createdAt: string;
        actorLabel: string | null;
        actor: { id: string; name: string } | null;
      }>
    | null;
  recentContent:
    | Array<{ type: string; id: string; name: string; status: string; updatedAt: string }>
    | null;
}

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

export function Dashboard() {
  const { user, can, canAny } = useAuth();
  const [days, setDays] = useState(30);

  const { data, error, initial, reload } = useQuery<Dashboard>(`/dashboard${qs({ days })}`);
  const c = data?.cards;

  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? `${days} days`;

  return (
    <>
      <PageHeader
        title={`Good ${partOfDay()}, ${firstName(user?.name)}`}
        description="Live figures from the PolarSight database. Nothing here is cached or estimated."
        actions={
          <div className="flex items-center gap-1 rounded-inner border border-line bg-panel p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={`rounded-[0.4rem] px-2.5 py-1.5 text-xs transition-colors ${
                  r.days === days ? "bg-raised text-ink" : "text-faint hover:text-body"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      {/* ── Overview cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {c?.enquiries && (
          <>
            <StatCard
              label="Total enquiries"
              value={c.enquiries.total}
              icon="inbox"
              tone="neutral"
              to="/enquiries"
              loading={initial}
              sub={`${c.enquiries.inPeriod.toLocaleString()} in the last ${rangeLabel}`}
            />
            <StatCard
              label="New enquiries"
              value={c.enquiries.new}
              icon="mail"
              tone="info"
              to="/enquiries?status=NEW"
              loading={initial}
              sub={c.enquiries.unassigned > 0 ? `${c.enquiries.unassigned} unassigned` : "All assigned"}
            />
            <StatCard
              label="Pending enquiries"
              value={c.enquiries.pending}
              icon="clock"
              tone={c.enquiries.followUpDue > 0 ? "caution" : "neutral"}
              to="/enquiries"
              loading={initial}
              sub={
                c.enquiries.followUpDue > 0
                  ? `${c.enquiries.followUpDue} follow-up${c.enquiries.followUpDue === 1 ? "" : "s"} due`
                  : "No follow-ups due"
              }
            />
          </>
        )}

        {c?.applications && (
          <>
            <StatCard
              label="Trainer applications"
              value={c.applications.total}
              icon="users"
              to="/applications"
              loading={initial}
              sub={`${c.applications.inPeriod.toLocaleString()} in the last ${rangeLabel}`}
            />
            <StatCard
              label="Pending applications"
              value={c.applications.pending}
              icon="clock"
              tone={c.applications.new > 0 ? "caution" : "neutral"}
              to="/applications?status=NEW"
              loading={initial}
              sub={`${c.applications.new} not yet reviewed`}
            />
            {c.applications.upcomingInterviews > 0 && (
              <StatCard
                label="Upcoming interviews"
                value={c.applications.upcomingInterviews}
                icon="calendar"
                tone="accent"
                to="/applications?status=INTERVIEW_SCHEDULED"
                loading={initial}
                sub="Scheduled from today onward"
              />
            )}
          </>
        )}

        {c?.programmes && (
          <StatCard
            label="Active programmes"
            value={c.programmes.published}
            icon="programme"
            tone="positive"
            to="/programmes"
            loading={initial}
            sub={`${c.programmes.draft} draft · ${c.programmes.curriculumModules} modules`}
          />
        )}

        {c?.pages && (
          <StatCard
            label="Published pages"
            value={c.pages.published}
            icon="pages"
            tone={c.pages.withUnpublishedChanges > 0 ? "caution" : "positive"}
            to="/pages"
            loading={initial}
            sub={
              c.pages.withUnpublishedChanges > 0
                ? `${c.pages.withUnpublishedChanges} with unpublished changes`
                : "All changes published"
            }
          />
        )}

        {c?.jobs && (
          <StatCard
            label="Open positions"
            value={c.jobs.open}
            icon="briefcase"
            tone="accent"
            to="/jobs"
            loading={initial}
            sub={
              c.jobs.closingSoon > 0
                ? `${c.jobs.closingSoon} closing within a week`
                : `${c.jobs.draft} draft`
            }
          />
        )}

        {c?.media && (
          <StatCard
            label="Media files"
            value={c.media.total}
            icon="media"
            to="/media"
            loading={initial}
            sub={`${formatBytes(c.media.totalBytes)} stored`}
          />
        )}


        {c?.admins && (
          <StatCard
            label="Active administrators"
            value={c.admins.active}
            icon="shield"
            tone={c.admins.lockedOut > 0 ? "caution" : "neutral"}
            to="/admin-users"
            loading={initial}
            sub={
              c.admins.lockedOut > 0
                ? `${c.admins.lockedOut} locked out`
                : `${c.admins.roles} roles · ${c.admins.inactive} disabled`
            }
          />
        )}

        {c?.content && c.content.pendingDrafts > 0 && (
          <StatCard
            label="Unpublished drafts"
            value={c.content.pendingDrafts}
            icon="text"
            tone="caution"
            to="/content"
            loading={initial}
            sub="Content blocks with pending edits"
          />
        )}

      </div>

      {/* ── Quick actions ───────────────────────────────── */}
      <QuickActions />

      {/* ── Activity panels ─────────────────────────────── */}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {data?.recentEnquiries && (
          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading
                title="Recent enquiries"
                icon="inbox"
                actions={
                  <LinkButton to="/enquiries" size="sm" variant="ghost">
                    View all
                  </LinkButton>
                }
              />
            </div>
            {data.recentEnquiries.length === 0 ? (
              <EmptyState
                icon="inbox"
                title="No enquiries yet"
                hint="Submissions from the website contact form appear here."
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {data.recentEnquiries.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/enquiries/${e.id}`}
                      className="flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-raised/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.name}</p>
                        <p className="truncate text-xs text-faint">
                          {[e.organisation, e.email].filter(Boolean).join(" · ")}
                        </p>
                        {e.subject && (
                          <span className="mt-1.5 inline-block">
                            <Badge>{e.subject}</Badge>
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge status={e.status} />
                        <p
                          className="mt-1.5 text-[0.6875rem] text-faint"
                          title={formatDateTime(e.createdAt)}
                        >
                          {relativeTime(e.createdAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {data?.recentApplications && (
          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading
                title="Recent trainer applications"
                icon="users"
                actions={
                  <LinkButton to="/applications" size="sm" variant="ghost">
                    View all
                  </LinkButton>
                }
              />
            </div>
            {data.recentApplications.length === 0 ? (
              <EmptyState
                icon="users"
                title="No applications yet"
                hint="Submissions from the careers page appear here."
                action={
                  can("job:read") ? (
                    <LinkButton to="/jobs" size="sm" icon="briefcase">
                      Review job openings
                    </LinkButton>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {data.recentApplications.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/applications/${a.id}`}
                      className="flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-raised/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.fullName}</p>
                        <p className="truncate text-xs text-faint">{a.appliedPosition}</p>
                        {a.experienceYears !== null && (
                          <p className="mt-1 text-[0.6875rem] text-faint">
                            {a.experienceYears} year{a.experienceYears === 1 ? "" : "s"} experience
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge status={a.status} />
                        <p
                          className="mt-1.5 text-[0.6875rem] text-faint"
                          title={formatDateTime(a.createdAt)}
                        >
                          {relativeTime(a.createdAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {data?.recentContent && data.recentContent.length > 0 && (
          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading
                title="Website content overview"
                icon="pages"
                description="Most recently updated content, across pages, blocks and programmes."
              />
            </div>
            <ul className="divide-y divide-line-soft">
              {data.recentContent.map((item) => (
                <li
                  key={`${item.type}-${item.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.name}</p>
                    <p className="text-[0.6875rem] text-faint">{item.type}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <StatusBadge status={item.status} />
                    <span
                      className="w-20 text-right text-[0.6875rem] text-faint"
                      title={formatDateTime(item.updatedAt)}
                    >
                      {relativeTime(item.updatedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data?.recentActivity && (
          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading
                title="Recent administrative activity"
                icon="history"
                description="From the audit trail, which cannot be edited through this portal."
                actions={
                  canAny("audit:read") ? (
                    <LinkButton to="/audit" size="sm" variant="ghost">
                      Full log
                    </LinkButton>
                  ) : undefined
                }
              />
            </div>
            {data.recentActivity.length === 0 ? (
              <EmptyState icon="history" title="Nothing recorded yet" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
                    <span className="mt-0.5 rounded border border-line bg-raised p-1 text-faint">
                      <Icon name={actionIcon(a.action)} size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="text-body">{a.actor?.name ?? a.actorLabel ?? "System"}</span>
                        <span className="text-faint"> · </span>
                        <span>{describeAction(a.action)}</span>
                      </p>
                      <p className="truncate text-[0.6875rem] text-faint">
                        {a.entity}
                        {a.entityId ? ` · ${a.entityId.slice(0, 10)}…` : ""}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[0.6875rem] text-faint"
                      title={formatDateTime(a.createdAt)}
                    >
                      {relativeTime(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

/* ── Quick actions ────────────────────────────────────────── */

function QuickActions() {
  const { can } = useAuth();

  const actions: Array<{ to: string; label: string; icon: IconName; permission: string }> = [
    { to: "/programmes?new=1", label: "Create programme", icon: "programme", permission: "programme:write" },
    { to: "/jobs?new=1", label: "Add job opening", icon: "briefcase", permission: "job:write" },
    { to: "/enquiries?status=NEW", label: "View new enquiries", icon: "inbox", permission: "enquiry:read" },
    { to: "/media?upload=1", label: "Upload media", icon: "upload", permission: "media:write" },
    { to: "/pages/home", label: "Edit homepage content", icon: "pages", permission: "page:write" },
  ];

  const available = useMemo(() => actions.filter((a) => can(a.permission)), [can]);
  if (available.length === 0) return null;

  return (
    <Card className="mt-4">
      <SectionHeading title="Quick actions" icon="plus" />
      <div className="flex flex-wrap gap-2">
        {available.map((a) => (
          <LinkButton key={a.to} to={a.to} size="sm" icon={a.icon}>
            {a.label}
          </LinkButton>
        ))}
      </div>
    </Card>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */

function partOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const firstName = (name?: string) => (name ? name.split(/\s+/)[0] : "there");

/** `programme.publish` → "published a programme" */
function describeAction(action: string): string {
  const [, verb = action] = action.split(".");
  const map: Record<string, string> = {
    create: "created a record",
    update: "updated a record",
    delete: "deleted a record",
    publish: "published",
    unpublish: "unpublished",
    archive: "archived",
    login: "signed in",
    logout: "signed out",
    login_failed: "failed to sign in",
    status: "changed a status",
    assign: "reassigned",
    export: "exported data",
    upload: "uploaded a file",
    verify: "verified a figure",
    restore: "restored a version",
    received: "received a submission",
    draft_saved: "saved a draft",
    publish_draft: "published a draft",
    note_added: "added a note",
    revoke_sessions: "revoked sessions",
    reset_password: "reset a password",
    permissions_updated: "changed role permissions",
  };
  return map[verb] ?? humanise(verb);
}

function actionIcon(action: string): IconName {
  const [, verb = ""] = action.split(".");
  if (verb.includes("login") || verb.includes("logout")) return "lock";
  if (verb.includes("publish")) return "globe";
  if (verb.includes("delete")) return "trash";
  if (verb.includes("upload")) return "upload";
  if (verb.includes("export")) return "download";
  if (verb.includes("archive")) return "archive";
  if (verb.includes("note")) return "note";
  if (verb.includes("verify")) return "verified";
  if (verb.includes("create")) return "plus";
  return "edit";
}

/**
 * Trainer application pipeline.
 *
 * Internal notes, interview feedback and assignments are deliberately
 * absent from this table — they live on the application's own screen,
 * because a list is the easiest thing to screenshot or export.
 */

import { Link, useSearchParams } from "react-router-dom";
import { qs } from "@/lib/api";
import { useAction, useList, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Button,
  Card,
  ChipList,
  DateRangeFilter,
  EmptyState,
  ErrorNote,
  FilterSelect,
  LinkButton,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toolbar,
  Tr,
  humanise,
} from "@/components/ui";

export const APPLICATION_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "SHORTLISTED",
  "INTERVIEW_SCHEDULED",
  "TECHNICAL_ASSESSMENT",
  "DEMO_SESSION",
  "SELECTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

interface ApplicationRow {
  id: string;
  fullName: string;
  email: string;
  appliedPosition: string;
  experienceYears: number | null;
  expertise: string[];
  status: string;
  interviewAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  jobOpening: { id: string; title: string } | null;
  assignedTo: { id: string; name: string } | null;
  _count: { notes: number };
}

interface Stats {
  byStatus: Record<string, number>;
  total: number;
  archived: number;
}

export function ApplicationsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [params] = useSearchParams();

  const list = useList<ApplicationRow>("/applications", {
    status: params.get("status") ?? "",
    jobOpeningId: params.get("jobOpeningId") ?? "",
    assignedToId: "",
    archived: "false",
    from: "",
    to: "",
    sort: "createdAt",
    dir: "desc",
  });

  const stats = useQuery<Stats>("/applications/stats");
  const jobs = useQuery<{ items: Array<{ id: string; title: string }> }>(
    can("job:read") ? "/jobs?perPage=100" : null
  );
  const admins = useQuery<{ items: Array<{ id: string; name: string }> }>(
    can("admin:read") ? "/admin-users?perPage=100" : null
  );

  const exportCsv = async () => {
    const { page: _page, sort: _sort, dir: _dir, ...filters } = list.filters;
    const result = await run("export", async () => {
      const res = await fetch(`/api/applications/export${qs({ ...filters, format: "csv" })}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trainer-applications-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    if (result.ok) notify("Export downloaded", "info", "Internal notes are excluded.");
    else notify(result.error, "error");
  };

  const byStatus = stats.data?.byStatus ?? {};

  return (
    <>
      <PageHeader
        title="Trainer applications"
        description="Applications submitted through the public careers page. Internal notes and feedback are on each application's own screen."
        breadcrumbs={[{ label: "Recruitment" }, { label: "Applications" }]}
        meta={
          stats.data ? (
            <Badge tone="neutral">{stats.data.total.toLocaleString()} in the pipeline</Badge>
          ) : null
        }
        actions={
          can("application:export") ? (
            <Button icon="download" loading={isBusy("export")} onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          ) : null
        }
      />

      {/* Pipeline summary, doubling as a status filter. */}
      {stats.data && stats.data.total > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => list.setFilter({ status: "" })}
            className={`rounded-inner border px-3 py-1.5 text-xs transition-colors ${
              !list.filters.status
                ? "border-accent bg-accent-soft text-accent-ice"
                : "border-line bg-panel text-body hover:border-line-strong"
            }`}
          >
            All <span className="tabular ml-1 text-faint">{stats.data.total}</span>
          </button>
          {APPLICATION_STATUSES.filter((s) => byStatus[s]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => list.setFilter({ status: s })}
              className={`rounded-inner border px-3 py-1.5 text-xs transition-colors ${
                list.filters.status === s
                  ? "border-accent bg-accent-soft text-accent-ice"
                  : "border-line bg-panel text-body hover:border-line-strong"
              }`}
            >
              {humanise(s)} <span className="tabular ml-1 text-faint">{byStatus[s]}</span>
            </button>
          ))}
        </div>
      )}

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Name, email, position, skill…"
        />
        {jobs.data && jobs.data.items.length > 0 && (
          <FilterSelect
            label="Position"
            value={String(list.filters.jobOpeningId ?? "")}
            onChange={(v) => list.setFilter({ jobOpeningId: v })}
            allLabel="All positions"
            options={jobs.data.items.map((j) => ({ value: j.id, label: j.title }))}
          />
        )}
        {admins.data && (
          <FilterSelect
            label="Recruiter"
            value={String(list.filters.assignedToId ?? "")}
            onChange={(v) => list.setFilter({ assignedToId: v })}
            allLabel="Anyone"
            options={admins.data.items.map((a) => ({ value: a.id, label: a.name }))}
          />
        )}
        <FilterSelect
          label="Archived"
          value={String(list.filters.archived ?? "false")}
          onChange={(v) => list.setFilter({ archived: v || "false" })}
          allLabel="Active only"
          options={[
            { value: "only", label: "Archived only" },
            { value: "true", label: "Include archived" },
          ]}
        />
        <DateRangeFilter
          from={String(list.filters.from ?? "")}
          to={String(list.filters.to ?? "")}
          onChange={({ from, to }) => list.setFilter({ from, to })}
        />
        {list.filtered && (
          <Button size="sm" icon="close" onClick={list.clearFilters} className="mb-px">
            Clear
          </Button>
        )}
      </Toolbar>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      {list.initial ? (
        <TableSkeleton cols={6} />
      ) : list.items.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="users"
            title={list.filtered ? "Nothing matches those filters" : "No applications yet"}
            hint={
              list.filtered
                ? "Try clearing the filters."
                : "Applications submitted through the careers page appear here."
            }
            action={
              list.filtered ? (
                <Button size="sm" onClick={list.clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th
                  sortable
                  active={list.filters.sort === "fullName"}
                  dir={String(list.filters.dir) as "asc" | "desc"}
                  onSort={() =>
                    list.setFilter({
                      sort: "fullName",
                      dir: list.filters.dir === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  Applicant
                </Th>
                <Th>Position</Th>
                <Th
                  sortable
                  active={list.filters.sort === "experienceYears"}
                  dir={String(list.filters.dir) as "asc" | "desc"}
                  onSort={() =>
                    list.setFilter({
                      sort: "experienceYears",
                      dir: list.filters.dir === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  Experience
                </Th>
                <Th>Expertise</Th>
                <Th
                  sortable
                  active={list.filters.sort === "createdAt"}
                  dir={String(list.filters.dir) as "asc" | "desc"}
                  onSort={() =>
                    list.setFilter({
                      sort: "createdAt",
                      dir: list.filters.dir === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  Applied
                </Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link
                      to={`/applications/${a.id}`}
                      className="block font-medium transition-colors hover:text-accent-ice"
                    >
                      {a.fullName}
                    </Link>
                    <p className="truncate text-xs text-faint">{a.email}</p>
                    {a.assignedTo && (
                      <p className="mt-1 text-[0.6875rem] text-faint">
                        Recruiter: {a.assignedTo.name}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <p className="text-sm">{a.appliedPosition}</p>
                    {a.jobOpening && (
                      <Link
                        to={`/jobs?search=${encodeURIComponent(a.jobOpening.title)}`}
                        className="text-[0.6875rem] text-faint underline-offset-2 hover:underline"
                      >
                        Linked opening
                      </Link>
                    )}
                  </Td>
                  <Td>
                    {a.experienceYears !== null ? (
                      <span className="tabular text-sm">
                        {a.experienceYears} yr{a.experienceYears === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-xs text-faint">Not stated</span>
                    )}
                  </Td>
                  <Td className="max-w-[14rem]">
                    <ChipList items={a.expertise.slice(0, 3)} />
                    {a.expertise.length > 3 && (
                      <span className="mt-1 block text-[0.6875rem] text-faint">
                        +{a.expertise.length - 3} more
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-xs text-body" title={formatDateTime(a.createdAt)}>
                      {relativeTime(a.createdAt)}
                    </span>
                    {a.interviewAt && (
                      <span className="mt-1 block text-[0.6875rem] text-accent-ice">
                        Interview {relativeTime(a.interviewAt)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={a.status} />
                    {a.archivedAt && (
                      <span className="mt-1 block">
                        <Badge tone="neutral" icon="archive">
                          Archived
                        </Badge>
                      </span>
                    )}
                    {a._count.notes > 0 && (
                      <span className="mt-1 block text-[0.6875rem] text-faint">
                        {a._count.notes} note{a._count.notes === 1 ? "" : "s"}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <LinkButton to={`/applications/${a.id}`} size="sm">
                      Review
                    </LinkButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          {list.pagination && (
            <Pagination
              page={list.pagination.page}
              totalPages={list.pagination.totalPages}
              total={list.pagination.total}
              perPage={list.pagination.perPage}
              onPage={list.setPage}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * Contact enquiries.
 *
 * The list is the working queue: archived enquiries are out of it
 * unless asked for, and the follow-up filter surfaces what is actually
 * due. Internal notes live on the detail screen and never appear in
 * the export.
 */

import { Link, useSearchParams } from "react-router-dom";
import { qs } from "@/lib/api";
import { useAction, useList, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Button,
  Card,
  DateRangeFilter,
  EmptyState,
  ErrorNote,
  FilterSelect,
  LinkButton,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
  StatusBadge,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toolbar,
  Tr,
  humanise,
} from "@/components/ui";

export const ENQUIRY_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "CONTACTED",
  "FOLLOW_UP_REQUIRED",
  "CONVERTED",
  "CLOSED",
  "SPAM",
] as const;

export const ENQUIRY_SUBJECTS = [
  "Institutional Training",
  "College Partnership",
  "SOC Analyst Programme",
  "AI Security Programme",
  "Corporate Training",
  "Trainer Collaboration",
  "General Enquiry",
  "Other",
] as const;

interface EnquiryRow {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  designation: string | null;
  subject: string | null;
  programme: string | null;
  status: string;
  followUpAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
  _count: { notes: number };
}

interface Stats {
  byStatus: Record<string, number>;
  bySubject: Record<string, number>;
  total: number;
  followUpDue: number;
  unassigned: number;
  archived: number;
}

export function EnquiriesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [params] = useSearchParams();

  const list = useList<EnquiryRow>("/enquiries", {
    status: params.get("status") ?? "",
    subject: "",
    assignedToId: "",
    archived: "false",
    dueOnly: "",
    from: "",
    to: "",
    sort: "createdAt",
    dir: "desc",
  });

  const stats = useQuery<Stats>("/enquiries/stats");
  const admins = useQuery<{ items: Array<{ id: string; name: string }> }>(
    can("admin:read") ? "/admin-users?perPage=100&active=true" : null
  );

  const exportCsv = async (format: "csv" | "json") => {
    const { page: _p, sort: _s, dir: _d, ...filters } = list.filters;
    const result = await run("export", async () => {
      const res = await fetch(`/api/enquiries/export${qs({ ...filters, format })}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `enquiries-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    if (result.ok) {
      notify(
        `Export downloaded (${format.toUpperCase()})`,
        "info",
        "Reflects the filters you have applied. Internal notes are excluded."
      );
    } else {
      notify(result.error, "error");
    }
  };

  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Contact enquiries"
        description="Submissions from the website contact form. Internal notes and the administrative history are on each enquiry's own screen."
        breadcrumbs={[{ label: "Enquiries" }]}
        actions={
          can("enquiry:export") ? (
            <>
              <Button icon="download" loading={isBusy("export")} onClick={() => void exportCsv("csv")}>
                Export CSV
              </Button>
              <Button icon="download" loading={isBusy("export")} onClick={() => void exportCsv("json")}>
                JSON
              </Button>
            </>
          ) : null
        }
      />

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="In the queue" value={s.total} icon="inbox" />
          <StatCard
            label="New"
            value={s.byStatus.NEW ?? 0}
            icon="mail"
            tone="info"
            to="/enquiries?status=NEW"
          />
          <StatCard
            label="Follow-ups due"
            value={s.followUpDue}
            icon="clock"
            tone={s.followUpDue > 0 ? "caution" : "neutral"}
          />
          <StatCard
            label="Unassigned"
            value={s.unassigned}
            icon="users"
            tone={s.unassigned > 0 ? "caution" : "neutral"}
          />
        </div>
      )}

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Name, email, organisation, message…"
        />
        <FilterSelect
          label="Status"
          value={String(list.filters.status ?? "")}
          onChange={(v) => list.setFilter({ status: v })}
          allLabel="All statuses"
          options={ENQUIRY_STATUSES.map((st) => ({
            value: st,
            label: humanise(st),
            count: s?.byStatus[st],
          }))}
        />
        <FilterSelect
          label="Type"
          value={String(list.filters.subject ?? "")}
          onChange={(v) => list.setFilter({ subject: v })}
          allLabel="All types"
          options={ENQUIRY_SUBJECTS.map((sub) => ({
            value: sub,
            label: sub,
            count: s?.bySubject[sub],
          }))}
        />
        {admins.data && (
          <FilterSelect
            label="Assigned to"
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
        <Button
          size="sm"
          icon="clock"
          variant={list.filters.dueOnly ? "primary" : "secondary"}
          className="mb-px"
          onClick={() => list.setFilter({ dueOnly: list.filters.dueOnly ? "" : "true" })}
        >
          Due only
        </Button>
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
            icon="inbox"
            title={list.filtered ? "Nothing matches those filters" : "No enquiries yet"}
            hint={
              list.filtered
                ? "Try clearing the filters."
                : "Submissions from the website contact form appear here."
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
                  active={list.filters.sort === "name"}
                  dir={String(list.filters.dir) as "asc" | "desc"}
                  onSort={() =>
                    list.setFilter({ sort: "name", dir: list.filters.dir === "asc" ? "desc" : "asc" })
                  }
                >
                  From
                </Th>
                <Th>Organisation</Th>
                <Th>Enquiry type</Th>
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
                  Received
                </Th>
                <Th
                  sortable
                  active={list.filters.sort === "followUpAt"}
                  dir={String(list.filters.dir) as "asc" | "desc"}
                  onSort={() =>
                    list.setFilter({
                      sort: "followUpAt",
                      dir: list.filters.dir === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  Follow-up
                </Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((e) => {
                const due = e.followUpAt && new Date(e.followUpAt).getTime() <= Date.now();
                return (
                  <Tr key={e.id}>
                    <Td>
                      <Link
                        to={`/enquiries/${e.id}`}
                        className="block font-medium transition-colors hover:text-accent-ice"
                      >
                        {e.name}
                      </Link>
                      <p className="truncate text-xs text-faint">{e.email}</p>
                      {e.assignedTo && (
                        <p className="mt-1 text-[0.6875rem] text-faint">{e.assignedTo.name}</p>
                      )}
                    </Td>
                    <Td>
                      <p className="text-sm">{e.organisation ?? <span className="text-faint">—</span>}</p>
                      {e.designation && <p className="text-xs text-faint">{e.designation}</p>}
                    </Td>
                    <Td>
                      {e.subject ? <Badge>{e.subject}</Badge> : <span className="text-xs text-faint">Unspecified</span>}
                      {e.programme && (
                        <p className="mt-1 text-[0.6875rem] text-faint">{e.programme}</p>
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs text-body" title={formatDateTime(e.createdAt)}>
                        {relativeTime(e.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      {e.followUpAt ? (
                        <Badge tone={due ? "caution" : "neutral"} icon="clock">
                          {formatDate(e.followUpAt)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={e.status} />
                      {e.archivedAt && (
                        <span className="mt-1 block">
                          <Badge tone="neutral" icon="archive">
                            Archived
                          </Badge>
                        </span>
                      )}
                      {e._count.notes > 0 && (
                        <span className="mt-1 block text-[0.6875rem] text-faint">
                          {e._count.notes} note{e._count.notes === 1 ? "" : "s"}
                        </span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <LinkButton to={`/enquiries/${e.id}`} size="sm">
                        Open
                      </LinkButton>
                    </Td>
                  </Tr>
                );
              })}
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

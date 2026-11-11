/**
 * Audit trail.
 *
 * Read-only by design. There is no endpoint that edits or deletes an
 * entry, so this screen offers no such action — the trail is written
 * as a side effect of the action it records, and the only way to
 * remove one is direct database access.
 */

import { useState } from "react";
import { qs } from "@/lib/api";
import { useAction, useList, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { Icon, type IconName } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  DateRangeFilter,
  EmptyState,
  ErrorNote,
  FilterSelect,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toolbar,
  Tr,
  humanise,
} from "@/components/ui";

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  actorLabel: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

interface Facets {
  entities: Array<{ value: string; count: number }>;
  actions: Array<{ value: string; count: number }>;
  actors: Array<{ id: string; name: string; email: string }>;
}

export function AuditPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const list = useList<Entry>("/audit", { entity: "", action: "", actorId: "", from: "", to: "" }, 50);
  const facets = useQuery<Facets>("/audit/facets");
  const [viewing, setViewing] = useState<Entry | null>(null);

  const exportCsv = async () => {
    const { page: _p, ...filters } = list.filters;
    const result = await run("export", async () => {
      const res = await fetch(`/api/audit/export${qs(filters)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    if (result.ok) {
      notify("Export downloaded", "info", "Exporting the trail is itself recorded in it.");
    } else {
      notify(result.error, "error");
    }
  };

  const failedLogins = facets.data?.actions.find((a) => a.value === "auth.login_failed")?.count ?? 0;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative action, who took it and when. Append-only: nothing in this portal can change or remove an entry."
        breadcrumbs={[{ label: "Administration" }, { label: "Audit log" }]}
        meta={
          failedLogins > 0 ? (
            <Badge tone="caution" icon="lock">
              {failedLogins} failed sign-in{failedLogins === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
        actions={
          can("audit:read") ? (
            <Button icon="download" loading={isBusy("export")} onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          ) : null
        }
      />

      <Notice tone="info" icon="shield">
        Passwords, password hashes and session tokens are stripped before an entry is written, so
        they never appear here even in a before-and-after snapshot.
      </Notice>

      <div className="mt-4">
        <Toolbar>
          <SearchInput
            value={list.searchInput}
            onChange={list.setSearchInput}
            placeholder="Action, resource, administrator, IP…"
          />
          {facets.data && (
            <>
              <FilterSelect
                label="Resource"
                value={String(list.filters.entity ?? "")}
                onChange={(v) => list.setFilter({ entity: v })}
                allLabel="All resources"
                options={facets.data.entities.map((e) => ({
                  value: e.value,
                  label: e.value,
                  count: e.count,
                }))}
              />
              <FilterSelect
                label="Action"
                value={String(list.filters.action ?? "")}
                onChange={(v) => list.setFilter({ action: v })}
                allLabel="All actions"
                options={facets.data.actions.map((a) => ({
                  value: a.value,
                  label: a.value,
                  count: a.count,
                }))}
              />
              <FilterSelect
                label="Administrator"
                value={String(list.filters.actorId ?? "")}
                onChange={(v) => list.setFilter({ actorId: v })}
                allLabel="Anyone"
                options={facets.data.actors.map((a) => ({ value: a.id, label: a.name }))}
              />
            </>
          )}
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
      </div>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      {list.initial ? (
        <TableSkeleton rows={10} cols={5} />
      ) : list.items.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="history"
            title={list.filtered ? "Nothing matches those filters" : "Nothing recorded yet"}
            hint={list.filtered ? "Try widening the date range." : undefined}
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
                <Th>When</Th>
                <Th>Administrator</Th>
                <Th>Action</Th>
                <Th>Resource</Th>
                <Th>Address</Th>
                <Th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {list.items.map((e) => {
                const failed = e.action === "auth.login_failed";
                return (
                  <Tr key={e.id} onClick={() => setViewing(e)}>
                    <Td>
                      <span className="text-xs text-body" title={formatDateTime(e.createdAt)}>
                        {relativeTime(e.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      {e.actor ? (
                        <>
                          <p className="text-sm">{e.actor.name}</p>
                          <p className="truncate text-[0.6875rem] text-faint">{e.actor.email}</p>
                        </>
                      ) : (
                        <span className="text-xs text-faint">{e.actorLabel ?? "System"}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <Icon
                          name={actionIcon(e.action)}
                          size={13}
                          className={failed ? "text-danger" : "text-faint"}
                        />
                        <span className={`mono ${failed ? "text-danger" : ""}`}>{e.action}</span>
                      </span>
                    </Td>
                    <Td>
                      <Badge>{e.entity}</Badge>
                      {e.entityId && (
                        <span className="mono mt-1 block truncate text-faint" title={e.entityId}>
                          {e.entityId.slice(0, 14)}…
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="mono text-faint">{e.ip ?? "—"}</span>
                    </Td>
                    <Td className="text-right">
                      <Icon name="chevronRight" size={14} className="text-faint" />
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

      {viewing && <EntryDetail entry={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function EntryDetail({ entry, onClose }: { entry: Entry; onClose(): void }) {
  const hasDiff = entry.before !== null || entry.after !== null;

  return (
    <Modal
      open
      title={entry.action}
      description={`${entry.entity}${entry.entityId ? ` · ${entry.entityId}` : ""}`}
      onClose={onClose}
      width="lg"
    >
      <div className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label="When" value={formatDateTime(entry.createdAt)} />
          <Row
            label="Administrator"
            value={entry.actor ? `${entry.actor.name} (${entry.actor.email})` : (entry.actorLabel ?? "System")}
          />
          <Row label="IP address" value={entry.ip ?? "Not recorded"} />
          <Row label="Action" value={humanise(entry.action.split(".").pop() ?? entry.action)} />
        </dl>

        {entry.userAgent && (
          <div>
            <p className="label mb-1">Device</p>
            <p className="mono break-all text-faint">{entry.userAgent}</p>
          </div>
        )}

        {hasDiff && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Snapshot label="Before" value={entry.before} />
            <Snapshot label="After" value={entry.after} />
          </div>
        )}

        <Notice tone="info" icon="lock">
          This entry cannot be edited or removed through the portal.
        </Notice>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label mb-1">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      {value === null || value === undefined ? (
        <p className="text-sm text-faint">Not recorded</p>
      ) : (
        <pre className="panel-sunken max-h-64 overflow-auto p-3 text-[0.6875rem] leading-relaxed text-body">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function actionIcon(action: string): IconName {
  const [, verb = ""] = action.split(".");
  if (verb === "login_failed") return "alert";
  if (verb.includes("login") || verb.includes("logout")) return "lock";
  if (verb.includes("publish")) return "globe";
  if (verb.includes("delete")) return "trash";
  if (verb.includes("upload")) return "upload";
  if (verb.includes("export") || verb.includes("download")) return "download";
  if (verb.includes("archive")) return "archive";
  if (verb.includes("note")) return "note";
  if (verb.includes("verify")) return "verified";
  if (verb.includes("create")) return "plus";
  if (verb.includes("restore")) return "history";
  if (verb.includes("permission") || verb.includes("role")) return "shield";
  return "edit";
}

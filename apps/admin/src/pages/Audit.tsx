import { useCallback, useEffect, useState } from "react";
import { api, qs, type Paged } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { Badge, EmptyState, ErrorNote, Loading, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export function AuditPage() {
  const [data, setData] = useState<Paged<Entry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [input, setInput] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setAction(input);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setError(null);
        setData(await api.get<Paged<Entry>>(`/audit${qs({ page, perPage: 50, action: action || undefined })}`, signal));
      } catch (e) {
        if (!signal?.aborted) setError(e instanceof Error ? e.message : "Failed to load");
      }
    },
    [page, action]
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative change, with who made it. Read-only: entries cannot be edited or deleted."
      />

      <div className="mb-4">
        <input
          className="field max-w-xs"
          placeholder="Filter by action, e.g. programme"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Filter audit entries"
        />
      </div>

      {error && <ErrorNote message={error} />}

      {!data && !error ? (
        <Loading />
      ) : data && data.items.length === 0 ? (
        <div className="panel"><EmptyState title="No entries match" /></div>
      ) : data ? (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Actor</Th>
                <Th>Address</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-raised/50">
                  <Td><span className="font-mono text-xs text-accent-ice">{e.action}</span></Td>
                  <Td><Badge>{e.entity}</Badge></Td>
                  <Td>
                    {e.actor ? (
                      <>
                        <span className="text-sm">{e.actor.name}</span>
                        <span className="block text-xs text-faint">{e.actor.email}</span>
                      </>
                    ) : (
                      <span className="text-xs text-faint">system</span>
                    )}
                  </Td>
                  <Td><span className="font-mono text-xs text-faint">{e.ip ?? "—"}</span></Td>
                  <Td className="whitespace-nowrap text-xs text-faint" title={formatDateTime(e.createdAt)}>
                    {relativeTime(e.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            onPage={setPage}
          />
        </>
      ) : null}
    </>
  );
}

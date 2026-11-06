import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, download, qs, type Paged } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm } from "@/components/Modal";
import {
  Button, EmptyState, ErrorNote, Loading, PageHeader, Pagination,
  StatusBadge, Table, Td, Th,
} from "@/components/ui";

const STATUSES = ["NEW", "IN_PROGRESS", "CONTACTED", "CLOSED", "SPAM"] as const;

interface EnquiryRow {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  subject: string | null;
  status: string;
  createdAt: string;
  _count: { notes: number };
}

export function EnquiriesPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [data, setData] = useState<Paged<EnquiryRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setError(null);
        const q = qs({ page, perPage: 20, search: search || undefined, status: status || undefined });
        setData(await api.get<Paged<EnquiryRow>>(`/enquiries${q}`, signal));
      } catch (e) {
        if (!signal?.aborted) setError(e instanceof Error ? e.message : "Failed to load");
      }
    },
    [page, search, status]
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const q = qs({ search: search || undefined, status: status || undefined, format: "csv" });
      await download(`/enquiries/export${q}`, `enquiries-${new Date().toISOString().slice(0, 10)}.csv`);
      notify("Export downloaded");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Contact enquiries"
        description="Submissions from the website contact form."
        actions={
          can("enquiry:export") ? (
            <Button onClick={() => void exportCsv()} loading={exporting}>
              Export CSV
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="field max-w-xs"
          placeholder="Search name, email, message…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search enquiries"
        />
        <select
          className="field max-w-[12rem]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>
          ))}
        </select>
      </div>

      {error && <ErrorNote message={error} />}

      {!data && !error ? (
        <Loading />
      ) : data && data.items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={search || status ? "Nothing matches those filters" : "No enquiries yet"}
            hint={
              search || status
                ? "Try clearing the search or status filter."
                : "Submissions from the website will appear here."
            }
          />
        </div>
      ) : data ? (
        <>
          <Table>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Organisation</Th>
                <Th>Subject</Th>
                <Th>Notes</Th>
                <Th>Status</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-raised/50">
                  <Td>
                    <Link to={`/enquiries/${e.id}`} className="font-medium hover:text-accent-ice">
                      {e.name}
                    </Link>
                    <span className="block text-xs text-faint">{e.email}</span>
                  </Td>
                  <Td className="text-body">{e.organisation ?? "—"}</Td>
                  <Td className="text-body">{e.subject ?? "—"}</Td>
                  <Td className="text-xs text-faint">{e._count.notes || "—"}</Td>
                  <Td><StatusBadge status={e.status} /></Td>
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

/* ── Detail ───────────────────────────────────────────────── */

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; email: string } | null;
}

interface EnquiryDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  subject: string | null;
  message: string;
  status: string;
  createdAt: string;
  notes: Note[];
}

export function EnquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { notify } = useToast();

  const [item, setItem] = useState<EnquiryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const { item } = await api.get<{ item: EnquiryDetail }>(`/enquiries/${id}`);
      setItem(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (status: string) => {
    if (!id) return;
    setBusy(true);
    try {
      await api.patch(`/enquiries/${id}/status`, { status });
      notify("Status updated");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!id || !note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/enquiries/${id}/notes`, { body: note.trim() });
      setNote("");
      notify("Note added");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await api.del(`/enquiries/${id}`);
      notify("Enquiry deleted");
      navigate("/enquiries", { replace: true });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed", "error");
      setBusy(false);
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (!item) return <Loading />;

  const canWrite = can("enquiry:write");

  return (
    <>
      <Link to="/enquiries" className="mb-4 inline-block text-xs text-faint hover:text-ink">
        ← Back to enquiries
      </Link>

      <PageHeader
        title={item.name}
        description={`Received ${formatDateTime(item.createdAt)}`}
        actions={
          canWrite ? (
            <>
              <select
                className="field max-w-[12rem]"
                value={item.status}
                disabled={busy}
                onChange={(e) => void setStatus(e.target.value)}
                aria-label="Change status"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>
                ))}
              </select>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
            </>
          ) : (
            <StatusBadge status={item.status} />
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel p-5">
          <h2 className="label mb-3">Message</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.message}</p>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
            <div>
              <dt className="label mb-1">Email</dt>
              <dd><a href={`mailto:${item.email}`} className="text-accent-ice hover:underline">{item.email}</a></dd>
            </div>
            <div>
              <dt className="label mb-1">Phone</dt>
              <dd>{item.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="label mb-1">Organisation</dt>
              <dd>{item.organisation ?? "—"}</dd>
            </div>
            <div>
              <dt className="label mb-1">Subject</dt>
              <dd>{item.subject ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="panel p-5">
          <h2 className="label mb-3">Internal notes</h2>

          {canWrite && (
            <div className="mb-5">
              <textarea
                className="field resize-y"
                rows={3}
                placeholder="Add a note for the team…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="New note"
              />
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                loading={busy}
                disabled={!note.trim()}
                onClick={() => void addNote()}
              >
                Add note
              </Button>
            </div>
          )}

          {item.notes.length === 0 ? (
            <p className="text-sm text-faint">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {item.notes.map((n) => (
                <li key={n.id} className="rounded-inner border border-line-soft bg-canvas/60 p-3">
                  <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  <p className="mt-2 text-[0.6875rem] text-faint">
                    {n.author?.name ?? "Unknown"} · {relativeTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Confirm
        open={confirmDelete}
        title="Delete this enquiry?"
        message="The enquiry and its notes are removed permanently."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

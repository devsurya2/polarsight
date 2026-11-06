import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError, qs, type Paged } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "./Toast";
import { Confirm, Modal } from "./Modal";
import {
  Button, EmptyState, ErrorNote, Input, Loading, PageHeader, Pagination,
  Select, StatusBadge, Table, Td, Textarea, Th,
} from "./ui";

export type FieldKind = "text" | "textarea" | "number" | "select" | "stringList";

export interface FieldDef {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
  /** Hidden when editing, e.g. an immutable key. */
  createOnly?: boolean;
}

export interface ColumnDef<T> {
  header: string;
  render(row: T): React.ReactNode;
  className?: string;
}

export interface ResourceConfig<T> {
  path: string;
  title: string;
  description: string;
  singular: string;
  permissions: { read: string; write: string; remove?: string; publish?: string };
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  publishable?: boolean;
  searchable?: boolean;
  /** Defaults applied when opening the create form. */
  defaults?: Record<string, unknown>;
}

type Row = Record<string, unknown> & { id: string; status?: string };

function initialValues(fields: FieldDef[], defaults: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const d = defaults[f.name];
    out[f.name] = f.kind === "stringList"
      ? Array.isArray(d) ? (d as string[]).join("\n") : ""
      : d === undefined || d === null ? "" : String(d);
  }
  return out;
}

function toPayload(fields: FieldDef[], values: Record<string, string>, editing: boolean) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    const raw = (values[f.name] ?? "").trim();

    if (f.kind === "stringList") {
      out[f.name] = raw ? raw.split("\n").map((s) => s.trim()).filter(Boolean) : [];
      continue;
    }
    if (f.kind === "number") {
      // Empty optional number means "clear it", not "zero".
      out[f.name] = raw === "" ? null : Number(raw);
      continue;
    }
    if (raw === "" && !f.required) {
      out[f.name] = null;
      continue;
    }
    out[f.name] = raw;
  }
  return out;
}

export function ResourcePage<T extends Row>({ config }: { config: ResourceConfig<T> }) {
  const { can } = useAuth();
  const { notify } = useToast();

  const [data, setData] = useState<Paged<T> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [confirming, setConfirming] = useState<T | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canWrite = can(config.permissions.write);
  const canRemove = can(config.permissions.remove ?? config.permissions.write);
  const canPublish = can(config.permissions.publish ?? config.permissions.write);

  const query = useMemo(
    () => qs({ page, perPage: 20, search: search || undefined, status: status || undefined }),
    [page, search, status]
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoadError(null);
        setData(await api.get<Paged<T>>(`${config.path}${query}`, signal));
      } catch (e) {
        if (!signal?.aborted) setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    },
    [config.path, query]
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  // Debounce the search box so typing does not fire a request per key.
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openCreate = () => {
    setValues(initialValues(config.fields, config.defaults));
    setFormError(null);
    setFieldErrors({});
    setCreating(true);
  };

  const openEdit = (row: T) => {
    setValues(initialValues(config.fields, row));
    setFormError(null);
    setFieldErrors({});
    setEditing(row);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    const isEdit = editing !== null;
    const payload = toPayload(config.fields, values, isEdit);

    try {
      if (isEdit) {
        await api.patch(`${config.path}/${editing.id}`, payload);
        notify(`${config.singular} updated`);
      } else {
        await api.post(config.path, payload);
        notify(`${config.singular} created as draft`);
      }
      closeForm();
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setFormError("Something went wrong");
      }
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (row: T) => {
    const next = row.status === "PUBLISHED" ? "unpublish" : "publish";
    setBusyId(row.id);
    try {
      await api.post(`${config.path}/${row.id}/${next}`);
      notify(next === "publish" ? `${config.singular} published` : `${config.singular} unpublished`);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setSaving(true);
    try {
      await api.del(`${config.path}/${confirming.id}`);
      notify(`${config.singular} deleted`);
      setConfirming(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete", "error");
    } finally {
      setSaving(false);
    }
  };

  const formFields = config.fields.filter((f) => !(editing && f.createOnly));

  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={openCreate}>
              New {config.singular.toLowerCase()}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        {config.searchable !== false && (
          <input
            className="field max-w-xs"
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search ${config.title.toLowerCase()}`}
          />
        )}
        {config.publishable && (
          <select
            className="field max-w-[11rem]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
          </select>
        )}
      </div>

      {loadError && <ErrorNote message={loadError} />}

      {!data && !loadError ? (
        <Loading />
      ) : data && data.items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={search || status ? "Nothing matches those filters" : `No ${config.title.toLowerCase()} yet`}
            hint={search || status ? "Try clearing the search or status filter." : undefined}
            action={
              canWrite && !search && !status ? (
                <Button variant="primary" onClick={openCreate}>
                  Create the first one
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : data ? (
        <>
          <Table>
            <thead>
              <tr>
                {config.columns.map((c) => (
                  <Th key={c.header} className={c.className}>{c.header}</Th>
                ))}
                {config.publishable && <Th>Status</Th>}
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-raised/50">
                  {config.columns.map((c) => (
                    <Td key={c.header} className={c.className}>{c.render(row)}</Td>
                  ))}
                  {config.publishable && (
                    <Td><StatusBadge status={String(row.status ?? "DRAFT")} /></Td>
                  )}
                  <Td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {config.publishable && canPublish && (
                        <Button
                          size="sm"
                          loading={busyId === row.id}
                          onClick={() => void togglePublish(row)}
                        >
                          {row.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                        </Button>
                      )}
                      {canWrite && (
                        <Button size="sm" onClick={() => openEdit(row)}>Edit</Button>
                      )}
                      {canRemove && (
                        <Button size="sm" variant="danger" onClick={() => setConfirming(row)}>
                          Delete
                        </Button>
                      )}
                    </div>
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

      <Modal
        open={creating || editing !== null}
        title={editing ? `Edit ${config.singular.toLowerCase()}` : `New ${config.singular.toLowerCase()}`}
        description={editing ? undefined : "New records are created as drafts."}
        onClose={closeForm}
        wide
        footer={
          <>
            <Button onClick={closeForm} disabled={saving}>Cancel</Button>
            <Button variant="primary" form="resource-form" type="submit" loading={saving}>
              {editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <form id="resource-form" onSubmit={submit} className="space-y-4" noValidate>
          {formError && <ErrorNote message={formError} />}

          {formFields.map((f) => {
            const common = {
              label: f.label,
              required: f.required,
              hint: f.hint,
              error: fieldErrors[f.name],
              value: values[f.name] ?? "",
              placeholder: f.placeholder,
              onChange: (e: { target: { value: string } }) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value })),
            };

            if (f.kind === "textarea") return <Textarea key={f.name} {...common} rows={f.rows ?? 4} />;
            if (f.kind === "stringList")
              return (
                <Textarea
                  key={f.name}
                  {...common}
                  rows={f.rows ?? 4}
                  hint={f.hint ?? "One per line."}
                />
              );
            if (f.kind === "select")
              return (
                <Select key={f.name} {...common}>
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              );
            return (
              <Input
                key={f.name}
                {...common}
                type={f.kind === "number" ? "number" : "text"}
              />
            );
          })}
        </form>
      </Modal>

      <Confirm
        open={confirming !== null}
        title={`Delete this ${config.singular.toLowerCase()}?`}
        message="This cannot be undone. The record is removed permanently."
        confirmLabel="Delete"
        destructive
        busy={saving}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

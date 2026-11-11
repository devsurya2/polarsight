/**
 * One audited CRUD screen, configured per resource.
 *
 * The simpler website-content types differ only in their fields and
 * columns, so they share this screen rather than each re-implementing
 * loading, empty, error, search, filter, publish and delete states.
 * Anything with real workflow of its own — programmes, applications,
 * enquiries, pages — has a purpose-built screen instead.
 */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api, qs } from "@/lib/api";
import { useAction, useList } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useToast } from "./Toast";
import { Confirm, Modal } from "./Modal";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  FilterSelect,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  StringList,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
  Toolbar,
  Tr,
  type Crumb,
} from "./ui";

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "stringList"
  | "date"
  | "slug";

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
  /** Lays the field out beside its neighbour on wide screens. */
  half?: boolean;
  /** Groups fields under a heading inside the form. */
  group?: string;
}

export interface ColumnDef<T> {
  header: string;
  render(row: T): ReactNode;
  className?: string;
  /** Column name the API accepts for `sort`. */
  sortKey?: string;
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
  /** Shows an archive action alongside publish. */
  archivable?: boolean;
  defaults?: Record<string, unknown>;
  breadcrumbs?: Crumb[];
  /** Rendered above the table, e.g. a policy note. */
  notice?: ReactNode;
  /** Extra row actions, before edit and delete. */
  rowActions?: (row: T, helpers: { reload(): void }) => ReactNode;
  emptyHint?: string;
}

type Row = Record<string, unknown> & { id: string; status?: string };

/* ── Form value plumbing ──────────────────────────────────── */

function initialValues(
  fields: FieldDef[],
  source: Record<string, unknown> = {}
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    const v = source[f.name];
    if (f.kind === "stringList") {
      out[f.name] = Array.isArray(v) ? (v as string[]) : [];
    } else if (f.kind === "date") {
      // <input type="date"> needs yyyy-mm-dd, not an ISO timestamp.
      out[f.name] = typeof v === "string" && v ? v.slice(0, 10) : "";
    } else {
      out[f.name] = v === undefined || v === null ? "" : String(v);
    }
  }
  return out;
}

function toPayload(
  fields: FieldDef[],
  values: Record<string, string | string[]>,
  editing: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    const raw = values[f.name];

    if (f.kind === "stringList") {
      out[f.name] = Array.isArray(raw) ? raw : [];
      continue;
    }

    const text = typeof raw === "string" ? raw.trim() : "";

    if (f.kind === "number") {
      // An empty optional number means "clear it", not "zero".
      out[f.name] = text === "" ? null : Number(text);
      continue;
    }
    if (f.kind === "date") {
      out[f.name] = text === "" ? null : new Date(`${text}T00:00:00`).toISOString();
      continue;
    }
    if (text === "" && !f.required) {
      out[f.name] = null;
      continue;
    }
    out[f.name] = text;
  }
  return out;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/* ── Screen ───────────────────────────────────────────────── */

export function ResourcePage<T extends Row>({ config }: { config: ResourceConfig<T> }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [params, setParams] = useSearchParams();

  const list = useList<T>(config.path, {
    status: params.get("status") ?? "",
    sort: "",
    dir: "asc",
  });

  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<T | null>(null);

  const canWrite = can(config.permissions.write);
  const canRemove = can(config.permissions.remove ?? config.permissions.write);
  const canPublish = can(config.permissions.publish ?? config.permissions.write);

  const openCreate = () => {
    setValues(initialValues(config.fields, config.defaults));
    setFormError(null);
    setFieldErrors({});
    setCreating(true);
  };

  // A ?new=1 link from the dashboard opens the create form directly.
  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      openCreate();
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, canWrite]);

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
    setFormError(null);
    setFieldErrors({});

    const isEdit = editing !== null;
    const payload = toPayload(config.fields, values, isEdit);

    const result = await run("save", () =>
      isEdit ? api.patch(`${config.path}/${editing.id}`, payload) : api.post(config.path, payload)
    );

    if (result.ok) {
      notify(
        isEdit
          ? `${config.singular} updated`
          : config.publishable
            ? `${config.singular} created as a draft`
            : `${config.singular} created`
      );
      closeForm();
      await list.reload();
    } else {
      setFormError(result.error);
      setFieldErrors(result.fields);
    }
  };

  const transition = async (row: T, action: "publish" | "unpublish" | "archive" | "unarchive") => {
    const result = await run(row.id, () => api.post(`${config.path}/${row.id}/${action}`));
    if (result.ok) {
      notify(`${config.singular} ${action === "unarchive" ? "restored to draft" : `${action}ed`}`);
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const remove = async () => {
    if (!confirming) return;
    const result = await run("delete", () => api.del(`${config.path}/${confirming.id}`));
    if (result.ok) {
      notify(`${config.singular} deleted`);
      setConfirming(null);
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const toggleSort = (key: string) => {
    const current = String(list.filters.sort ?? "");
    const dir = String(list.filters.dir ?? "asc");
    list.setFilter({
      sort: key,
      dir: current === key && dir === "asc" ? "desc" : "asc",
    });
  };

  const formFields = config.fields.filter((f) => !(editing && f.createOnly));
  const grouped = useMemo(() => groupFields(formFields), [formFields]);

  const showing = list.items;
  const statusValue = String(list.filters.status ?? "");

  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        breadcrumbs={config.breadcrumbs}
        actions={
          canWrite ? (
            <Button variant="primary" icon="plus" onClick={openCreate}>
              New {config.singular.toLowerCase()}
            </Button>
          ) : null
        }
      />

      {config.notice && <div className="mb-4">{config.notice}</div>}

      <Toolbar>
        {config.searchable !== false && (
          <SearchInput
            value={list.searchInput}
            onChange={list.setSearchInput}
            placeholder={`Search ${config.title.toLowerCase()}…`}
          />
        )}
        {config.publishable && (
          <FilterSelect
            label="Status"
            value={statusValue}
            onChange={(v) => list.setFilter({ status: v })}
            allLabel="All statuses"
            options={[
              { value: "PUBLISHED", label: "Published" },
              { value: "DRAFT", label: "Draft" },
              ...(config.archivable ? [{ value: "ARCHIVED", label: "Archived" }] : []),
            ]}
          />
        )}
        {list.filtered && (
          <Button size="sm" icon="close" onClick={list.clearFilters} className="mb-px">
            Clear filters
          </Button>
        )}
        <span className="mb-2 ml-auto text-xs text-faint">
          {list.pagination ? `${list.pagination.total.toLocaleString()} total` : ""}
        </span>
      </Toolbar>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      {list.initial ? (
        <TableSkeleton cols={config.columns.length + 2} />
      ) : showing.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="info"
            title={
              list.filtered
                ? "Nothing matches those filters"
                : `No ${config.title.toLowerCase()} yet`
            }
            hint={
              list.filtered
                ? "Try clearing the search or status filter."
                : (config.emptyHint ?? undefined)
            }
            action={
              canWrite && !list.filtered ? (
                <Button variant="primary" icon="plus" onClick={openCreate}>
                  Create the first one
                </Button>
              ) : list.filtered ? (
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
                {config.columns.map((c) => (
                  <Th
                    key={c.header}
                    className={c.className}
                    sortable={Boolean(c.sortKey)}
                    active={c.sortKey === list.filters.sort}
                    dir={String(list.filters.dir ?? "asc") as "asc" | "desc"}
                    onSort={c.sortKey ? () => toggleSort(c.sortKey!) : undefined}
                  >
                    {c.header}
                  </Th>
                ))}
                {config.publishable && <Th>Status</Th>}
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {showing.map((row) => (
                <Tr key={row.id} busy={isBusy(row.id)}>
                  {config.columns.map((c) => (
                    <Td key={c.header} className={c.className}>
                      {c.render(row)}
                    </Td>
                  ))}
                  {config.publishable && (
                    <Td>
                      <StatusBadge status={String(row.status ?? "DRAFT")} />
                    </Td>
                  )}
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {config.rowActions?.(row, { reload: list.reload })}

                      {config.publishable && canPublish && row.status !== "ARCHIVED" && (
                        <Button
                          size="sm"
                          variant={row.status === "PUBLISHED" ? "subtle" : "primary"}
                          onClick={() =>
                            void transition(row, row.status === "PUBLISHED" ? "unpublish" : "publish")
                          }
                        >
                          {row.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                        </Button>
                      )}
                      {config.archivable && canPublish && row.status === "ARCHIVED" && (
                        <Button size="sm" onClick={() => void transition(row, "unarchive")}>
                          Restore
                        </Button>
                      )}
                      {config.archivable && canPublish && row.status !== "ARCHIVED" && (
                        <IconButton
                          icon="archive"
                          label="Archive"
                          onClick={() => void transition(row, "archive")}
                        />
                      )}
                      {canWrite && (
                        <IconButton icon="edit" label="Edit" onClick={() => openEdit(row)} />
                      )}
                      {canRemove && (
                        <IconButton
                          icon="trash"
                          label="Delete"
                          variant="ghost"
                          className="hover:text-danger"
                          onClick={() => setConfirming(row)}
                        />
                      )}
                    </div>
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

      {/* ── Create / edit form ──────────────────────────── */}
      <Modal
        open={creating || editing !== null}
        title={
          editing
            ? `Edit ${config.singular.toLowerCase()}`
            : `New ${config.singular.toLowerCase()}`
        }
        description={
          editing
            ? undefined
            : config.publishable
              ? "Created as a draft. It will not appear on the website until you publish it."
              : undefined
        }
        onClose={closeForm}
        width="lg"
        footer={
          <>
            <Button onClick={closeForm} disabled={isBusy("save")}>
              Cancel
            </Button>
            <Button
              variant="primary"
              form="resource-form"
              type="submit"
              icon="check"
              loading={isBusy("save")}
            >
              {editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <form id="resource-form" onSubmit={submit} className="space-y-5" noValidate>
          {formError && <ErrorNote message={formError} />}

          {grouped.map(({ heading, fields }) => (
            <div key={heading ?? "_"} className="space-y-4">
              {heading && (
                <p className="label border-b border-line-soft pb-2">{heading}</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.name} className={f.half ? "" : "sm:col-span-2"}>
                    {renderField(f, values, setValues, fieldErrors, config.fields)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </form>
      </Modal>

      <Confirm
        open={confirming !== null}
        title={`Delete this ${config.singular.toLowerCase()}?`}
        message={`"${describe(confirming, config.columns)}" will be removed permanently.`}
        warning={
          config.publishable
            ? "If it is published, unpublish or archive it first — deleting published content removes it from the website immediately."
            : "This cannot be undone."
        }
        confirmLabel="Delete"
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

/* ── Field rendering ──────────────────────────────────────── */

function renderField(
  f: FieldDef,
  values: Record<string, string | string[]>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>,
  errors: Record<string, string>,
  allFields: FieldDef[]
) {
  const error = errors[f.name];
  const stringValue = typeof values[f.name] === "string" ? (values[f.name] as string) : "";

  const set = (next: string | string[]) => setValues((v) => ({ ...v, [f.name]: next }));

  if (f.kind === "stringList") {
    return (
      <StringList
        label={f.label}
        hint={f.hint}
        error={error}
        rows={f.rows ?? 5}
        placeholder={f.placeholder}
        value={Array.isArray(values[f.name]) ? (values[f.name] as string[]) : []}
        onChange={set}
      />
    );
  }

  if (f.kind === "textarea") {
    return (
      <Textarea
        label={f.label}
        hint={f.hint}
        error={error}
        required={f.required}
        rows={f.rows ?? 4}
        placeholder={f.placeholder}
        value={stringValue}
        aside={stringValue ? `${stringValue.length} characters` : undefined}
        onChange={(e) => set(e.target.value)}
      />
    );
  }

  if (f.kind === "select") {
    return (
      <Select
        label={f.label}
        hint={f.hint}
        error={error}
        required={f.required}
        value={stringValue}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">Select…</option>
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  if (f.kind === "slug") {
    // Offers to derive the slug from the name, rather than silently
    // overwriting something an editor may have set on purpose.
    const nameField = allFields.find((x) => x.name === "name" || x.name === "title");
    const source = nameField
      ? typeof values[nameField.name] === "string"
        ? (values[nameField.name] as string)
        : ""
      : "";
    const suggestion = slugify(source);
    return (
      <div>
        <Input
          label={f.label}
          hint={f.hint}
          error={error}
          required={f.required}
          placeholder={f.placeholder}
          value={stringValue}
          onChange={(e) => set(slugify(e.target.value))}
        />
        {suggestion && suggestion !== stringValue && (
          <button
            type="button"
            onClick={() => set(suggestion)}
            className="mt-1.5 text-xs text-accent-ice underline-offset-2 hover:underline"
          >
            Use “{suggestion}”
          </button>
        )}
      </div>
    );
  }

  return (
    <Input
      label={f.label}
      hint={f.hint}
      error={error}
      required={f.required}
      placeholder={f.placeholder}
      type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
      value={stringValue}
      onChange={(e) => set(e.target.value)}
    />
  );
}

function groupFields(fields: FieldDef[]) {
  const out: Array<{ heading: string | null; fields: FieldDef[] }> = [];
  for (const f of fields) {
    const heading = f.group ?? null;
    const last = out[out.length - 1];
    if (last && last.heading === heading) last.fields.push(f);
    else out.push({ heading, fields: [f] });
  }
  return out;
}

/** A readable label for a row, used in the delete confirmation. */
function describe<T extends Row>(row: T | null, columns: ColumnDef<T>[]): string {
  if (!row) return "";
  for (const key of ["name", "title", "question", "label", "key", "slug"]) {
    const v = row[key];
    if (typeof v === "string" && v) return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  }
  void columns;
  return row.id;
}

export { qs };

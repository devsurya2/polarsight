/**
 * Programmes.
 *
 * The list owns status and ordering; everything else is edited on the
 * programme's own screen, because a programme has far more structure
 * than fits a dialog.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useList } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  FilterSelect,
  IconButton,
  Input,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
  Toolbar,
  Tr,
} from "@/components/ui";

interface Programme {
  id: string;
  slug: string;
  code: string;
  name: string;
  tag: string;
  summary: string;
  status: string;
  sortOrder: number;
  updatedAt: string;
  image: { url: string; alt: string | null } | null;
  _count?: { modules: number; faqs: number };
}

export function ProgrammesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const { run, isBusy } = useAction();
  const list = useList<Programme>("/programmes", { status: "" });

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Programme | null>(null);

  const canWrite = can("programme:write");
  const canPublish = can("programme:publish");
  const canDelete = can("programme:delete");

  const transition = async (
    row: Programme,
    action: "publish" | "unpublish" | "archive" | "unarchive"
  ) => {
    const result = await run(row.id, () => api.post(`/programmes/${row.id}/${action}`));
    if (result.ok) {
      notify(
        action === "publish"
          ? `"${row.name}" is now live on the website`
          : action === "unarchive"
            ? `"${row.name}" restored to draft`
            : `"${row.name}" ${action}d`
      );
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const duplicate = async (row: Programme) => {
    const result = await run(row.id, () =>
      api.post<{ item: Programme }>(`/programmes/${row.id}/duplicate`)
    );
    if (result.ok) {
      notify("Duplicated as a draft");
      navigate(`/programmes/${result.value.item.id}`);
    } else {
      notify(result.error, "error");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const result = await run("delete", () => api.del(`/programmes/${deleting.id}`));
    if (result.ok) {
      notify("Programme deleted");
      setDeleting(null);
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  return (
    <>
      <PageHeader
        title="Programmes"
        description="Training programmes on the website. Only published programmes are visible to visitors; a draft or archived programme is unreachable, not merely hidden."
        breadcrumbs={[{ label: "Website" }, { label: "Programmes" }]}
        actions={
          canWrite ? (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              New programme
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="Search programmes…" />
        <FilterSelect
          label="Status"
          value={String(list.filters.status ?? "")}
          onChange={(v) => list.setFilter({ status: v })}
          allLabel="All statuses"
          options={[
            { value: "PUBLISHED", label: "Published" },
            { value: "DRAFT", label: "Draft" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
        />
        {list.filtered && (
          <Button size="sm" icon="close" onClick={list.clearFilters} className="mb-px">
            Clear filters
          </Button>
        )}
        <span className="mb-2 ml-auto text-xs text-faint">
          {list.pagination ? `${list.pagination.total} total` : ""}
        </span>
      </Toolbar>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      {list.initial ? (
        <TableSkeleton cols={5} />
      ) : list.items.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="programme"
            title={list.filtered ? "Nothing matches those filters" : "No programmes yet"}
            hint={
              list.filtered
                ? "Try clearing the filters."
                : "Create a programme, build its curriculum, then publish it."
            }
            action={
              canWrite && !list.filtered ? (
                <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                  Create the first one
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
                <Th sortable active={list.filters.sort === "sortOrder"} onSort={() => list.setFilter({ sort: "sortOrder" })}>
                  Order
                </Th>
                <Th sortable active={list.filters.sort === "name"} onSort={() => list.setFilter({ sort: "name" })}>
                  Programme
                </Th>
                <Th>Category</Th>
                <Th>Curriculum</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((p) => (
                <Tr key={p.id} busy={isBusy(p.id)}>
                  <Td className="w-14">
                    <span className="tabular text-faint">{p.sortOrder}</span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      {p.image ? (
                        <img
                          src={p.image.url}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded border border-line object-cover"
                        />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded border border-line bg-raised" />
                      )}
                      <div className="min-w-0">
                        <Link
                          to={`/programmes/${p.id}`}
                          className="block truncate font-medium transition-colors hover:text-accent-ice"
                        >
                          {p.name}
                        </Link>
                        <p className="mono truncate text-faint">
                          {p.code} · /{p.slug}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge>{p.tag}</Badge>
                  </Td>
                  <Td>
                    <span className="text-xs text-body">
                      {p._count?.modules ?? 0} module{(p._count?.modules ?? 0) === 1 ? "" : "s"}
                    </span>
                    {(p._count?.faqs ?? 0) > 0 && (
                      <span className="block text-[0.6875rem] text-faint">
                        {p._count!.faqs} FAQ{p._count!.faqs === 1 ? "" : "s"}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={p.status} />
                    <p className="mt-1 text-[0.6875rem] text-faint">{relativeTime(p.updatedAt)}</p>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {canPublish && p.status !== "ARCHIVED" && (
                        <Button
                          size="sm"
                          variant={p.status === "PUBLISHED" ? "subtle" : "primary"}
                          onClick={() =>
                            void transition(p, p.status === "PUBLISHED" ? "unpublish" : "publish")
                          }
                        >
                          {p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                        </Button>
                      )}
                      {canPublish && p.status === "ARCHIVED" && (
                        <Button size="sm" onClick={() => void transition(p, "unarchive")}>
                          Restore
                        </Button>
                      )}
                      {canPublish && p.status !== "ARCHIVED" && (
                        <IconButton
                          icon="archive"
                          label="Archive"
                          onClick={() => void transition(p, "archive")}
                        />
                      )}
                      {canWrite && (
                        <IconButton icon="copy" label="Duplicate" onClick={() => void duplicate(p)} />
                      )}
                      <IconButton
                        icon="edit"
                        label="Open"
                        onClick={() => navigate(`/programmes/${p.id}`)}
                      />
                      {canDelete && (
                        <IconButton
                          icon="trash"
                          label="Delete"
                          className="hover:text-danger"
                          onClick={() => setDeleting(p)}
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

      <CreateProgramme
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/programmes/${id}`)}
      />

      <Confirm
        open={deleting !== null}
        title="Delete this programme?"
        message={`"${deleting?.name}" and its entire curriculum will be removed permanently.`}
        warning={
          deleting?.status === "PUBLISHED"
            ? "This programme is published. Unpublish or archive it first — the API will refuse to delete it while it is live."
            : "Its modules, topics and attached FAQs go with it. This cannot be undone. Archiving keeps the record instead."
        }
        confirmLabel="Delete permanently"
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/* ── Create ───────────────────────────────────────────────── */

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function CreateProgramme({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose(): void;
  onCreated(id: string): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [form, setForm] = useState({ name: "", slug: "", code: "", tag: "", summary: "" });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  if (!open) return null;

  const submit = async () => {
    setError(null);
    setFields({});
    const result = await run("create", () =>
      api.post<{ item: { id: string } }>("/programmes", {
        ...form,
        slug: form.slug || slugify(form.name),
      })
    );
    if (result.ok) {
      notify("Programme created as a draft");
      onCreated(result.value.item.id);
    } else {
      setError(result.error);
      setFields(result.fields);
    }
  };

  return (
    <Modal
      open
      title="New programme"
      description="Created as a draft. Add its detail and curriculum next, then publish when it is ready."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={isBusy("create")}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" loading={isBusy("create")} onClick={() => void submit()}>
            Create and open
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}

        <Notice tone="info">
          Nothing here asserts a duration, a fee, a certification or a placement outcome. Add those
          only if the business has agreed them.
        </Notice>

        <Input
          label="Name"
          required
          placeholder="Cloud Security"
          value={form.name}
          error={fields.name}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              name: e.target.value,
              // Follow the name until the slug is edited by hand.
              slug: f.slug === slugify(f.name) || f.slug === "" ? slugify(e.target.value) : f.slug,
            }))
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Slug"
            required
            hint="Used in the public URL."
            placeholder="cloud-security"
            value={form.slug}
            error={fields.slug}
            onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
          />
          <Input
            label="Code"
            required
            placeholder="TRK-03"
            value={form.code}
            error={fields.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
        </div>

        <Input
          label="Category"
          required
          placeholder="Cloud Security"
          value={form.tag}
          error={fields.tag}
          onChange={(e) => setForm({ ...form, tag: e.target.value })}
        />

        <Textarea
          label="Summary"
          required
          rows={3}
          hint="One or two sentences, shown on the programme card."
          value={form.summary}
          error={fields.summary}
          aside={`${form.summary.length}/600`}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />
      </div>
    </Modal>
  );
}

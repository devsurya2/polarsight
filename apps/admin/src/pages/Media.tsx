/**
 * Media library.
 *
 * Applicant resumes are private assets and are excluded by the API, so
 * they never appear here. Deleting a file shows exactly what uses it
 * first, and the API refuses outright while a published page depends
 * on it.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useList, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { Icon, iconForKind } from "@/components/Icon";
import type { MediaAsset } from "@/components/MediaPicker";
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  ErrorNote,
  FilterSelect,
  Input,
  Loading,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  SectionHeading,
  StatCard,
  Textarea,
  Toolbar,
} from "@/components/ui";

interface Asset extends MediaAsset {
  usageCount: number;
  scanStatus?: string;
  scanDetail?: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { id: string; name: string } | null;
}

interface Usage {
  items: Array<{ type: string; name: string; status: string }>;
  total: number;
  publishedUsageCount: number;
}

export function MediaPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [params, setParams] = useSearchParams();

  const list = useList<Asset>("/media", { kind: "", sort: "createdAt", dir: "desc" }, 24);
  const stats = useQuery<{
    byKind: Record<string, { count: number; bytes: number }>;
    total: number;
    totalBytes: number;
    allowedTypes: string[];
  }>("/media/stats");

  const [selected, setSelected] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const canWrite = can("media:write");
  const canDelete = can("media:delete");

  // A ?upload=1 link from the dashboard opens the file chooser.
  useEffect(() => {
    if (params.get("upload") === "1" && canWrite) {
      fileInput.current?.click();
      const next = new URLSearchParams(params);
      next.delete("upload");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, canWrite]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("file", f);

    const result = await run("upload", () =>
      api.upload<{ items: Asset[]; rejected: Array<{ filename: string; reason: string }> }>(
        "/media",
        form
      )
    );

    if (!result.ok) {
      notify("Upload failed", "error", result.error);
      return;
    }

    const { items, rejected } = result.value;
    if (items.length) {
      notify(`${items.length} file${items.length === 1 ? "" : "s"} uploaded`);
    }
    if (rejected?.length) {
      notify(
        `${rejected.length} file${rejected.length === 1 ? "" : "s"} rejected`,
        "warning",
        rejected.map((r) => `${r.filename}: ${r.reason}`).join(" · ")
      );
    }
    await Promise.all([list.reload(), stats.reload()]);
  };

  /** Loads the usage report before offering to delete. */
  const askToDelete = async (asset: Asset) => {
    const result = await run(asset.id, () => api.get<Usage>(`/media/${asset.id}/usage`));
    setUsage(result.ok ? result.value : null);
    setDeleting(asset);
  };

  const remove = async (force: boolean) => {
    if (!deleting) return;
    const result = await run("delete", () =>
      api.del(`/media/${deleting.id}${force ? "?force=true" : ""}`)
    );
    if (result.ok) {
      notify("File deleted");
      setDeleting(null);
      setUsage(null);
      setSelected(null);
      await Promise.all([list.reload(), stats.reload()]);
    } else {
      notify(result.error, "error");
    }
  };

  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Media library"
        description="Images, video and documents used across the website. Applicant resumes are held privately against their application and never appear here."
        breadcrumbs={[{ label: "Website" }, { label: "Media library" }]}
        actions={
          canWrite ? (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                variant="primary"
                icon="upload"
                loading={isBusy("upload")}
                onClick={() => fileInput.current?.click()}
              >
                Upload files
              </Button>
            </>
          ) : null
        }
      />

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total files" value={s.total} icon="media" sub={formatBytes(s.totalBytes)} />
          <StatCard
            label="Images"
            value={s.byKind.image?.count ?? 0}
            icon="image"
            sub={formatBytes(s.byKind.image?.bytes ?? 0)}
          />
          <StatCard
            label="Video"
            value={s.byKind.video?.count ?? 0}
            icon="video"
            sub={formatBytes(s.byKind.video?.bytes ?? 0)}
          />
          <StatCard
            label="Documents"
            value={s.byKind.document?.count ?? 0}
            icon="file"
            sub={formatBytes(s.byKind.document?.bytes ?? 0)}
          />
        </div>
      )}

      <div className="mb-4">
        <Notice tone="info" icon="shield">
          Every upload is checked against its actual bytes, not its file name, and an SVG containing
          script is rejected. Allowed: {s?.allowedTypes.map(shortType).join(", ") ?? "images, video, PDF, DOCX"}.
        </Notice>
      </div>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Search by name, title or description…"
        />
        <FilterSelect
          label="Type"
          value={String(list.filters.kind ?? "")}
          onChange={(v) => list.setFilter({ kind: v })}
          allLabel="All types"
          options={[
            { value: "image", label: "Images", count: s?.byKind.image?.count },
            { value: "video", label: "Video", count: s?.byKind.video?.count },
            { value: "document", label: "Documents", count: s?.byKind.document?.count },
          ]}
        />
        <FilterSelect
          label="Sort by"
          value={String(list.filters.sort ?? "createdAt")}
          onChange={(v) => list.setFilter({ sort: v || "createdAt" })}
          allLabel="Newest first"
          options={[
            { value: "originalName", label: "Name" },
            { value: "sizeBytes", label: "Size" },
          ]}
        />
        {list.filtered && (
          <Button size="sm" icon="close" onClick={list.clearFilters} className="mb-px">
            Clear
          </Button>
        )}
      </Toolbar>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      {list.initial ? (
        <Loading label="Loading the library" />
      ) : list.items.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="media"
            title={list.filtered ? "Nothing matches those filters" : "The library is empty"}
            hint={
              list.filtered
                ? "Try clearing the filters."
                : "Upload images, video or documents to use across the website."
            }
            action={
              canWrite && !list.filtered ? (
                <Button variant="primary" icon="upload" onClick={() => fileInput.current?.click()}>
                  Upload the first file
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m)}
                className={`panel group overflow-hidden p-0 text-left transition-colors hover:border-line-strong ${
                  isBusy(m.id) ? "row-busy" : ""
                }`}
              >
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-sunken">
                  {m.kind === "image" ? (
                    <img
                      src={m.url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                    />
                  ) : (
                    <Icon name={iconForKind(m.kind)} size={28} className="text-faint" />
                  )}
                  {m.usageCount > 0 && (
                    <span className="absolute right-2 top-2">
                      <Badge tone="accent">
                        {m.usageCount} use{m.usageCount === 1 ? "" : "s"}
                      </Badge>
                    </span>
                  )}
                  {m.kind === "image" && !m.alt && (
                    <span className="absolute left-2 top-2">
                      <Badge tone="caution" icon="alert">
                        No alt
                      </Badge>
                    </span>
                  )}
                  {m.scanStatus && m.scanStatus !== "CLEAN" && (
                    <span className="absolute bottom-2 left-2" title={m.scanDetail ?? undefined}>
                      <Badge tone={m.scanStatus === "REJECTED" ? "danger" : "caution"} icon="alert">
                        {m.scanStatus === "SCAN_SKIPPED" ? "Not scanned" : m.scanStatus === "REJECTED" ? "Rejected" : "Awaiting scan"}
                      </Badge>
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-medium" title={m.originalName}>
                    {m.title || m.originalName}
                  </p>
                  <p className="mt-0.5 text-[0.625rem] text-faint">
                    {formatBytes(m.sizeBytes)}
                    {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>

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

      {selected && (
        <AssetDetail
          asset={selected}
          canWrite={canWrite}
          canDelete={canDelete}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await list.reload();
          }}
          onDelete={() => void askToDelete(selected)}
        />
      )}

      <Confirm
        open={deleting !== null}
        title="Delete this file?"
        message={`"${deleting?.title || deleting?.originalName}" will be removed from the library and from storage.`}
        warning={
          usage && usage.total > 0 ? (
            <>
              <p className="font-medium">
                {usage.total} record{usage.total === 1 ? "" : "s"} reference this file
                {usage.publishedUsageCount > 0 && `, ${usage.publishedUsageCount} of them published`}:
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {usage.items.slice(0, 6).map((u, i) => (
                  <li key={i}>
                    · {u.type}: {u.name}
                    {u.status === "PUBLISHED" && " (published)"}
                  </li>
                ))}
              </ul>
              {usage.publishedUsageCount > 0 && (
                <p className="mt-2">
                  The server will refuse this deletion while a published record uses the file.
                  Replace it there first.
                </p>
              )}
            </>
          ) : (
            "Nothing currently references this file. This cannot be undone."
          )
        }
        confirmLabel={usage && usage.total > 0 ? "Delete anyway" : "Delete"}
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void remove(Boolean(usage && usage.total > 0))}
        onCancel={() => {
          setDeleting(null);
          setUsage(null);
        }}
      />
    </>
  );
}

const shortType = (mime: string) => mime.split("/").pop()?.replace("+xml", "").toUpperCase() ?? mime;

/* ── Asset detail ─────────────────────────────────────────── */

function AssetDetail({
  asset,
  canWrite,
  canDelete,
  onClose,
  onSaved,
  onDelete,
}: {
  asset: Asset;
  canWrite: boolean;
  canDelete: boolean;
  onClose(): void;
  onSaved(): void;
  onDelete(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [form, setForm] = useState({
    title: asset.title ?? "",
    alt: asset.alt ?? "",
    description: asset.description ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const usage = useQuery<Usage>(`/media/${asset.id}/usage`);

  const save = async () => {
    setError(null);
    const result = await run("save", () =>
      api.patch(`/media/${asset.id}`, {
        title: form.title || null,
        alt: form.alt || null,
        description: form.description || null,
      })
    );
    if (result.ok) {
      notify("File details updated");
      onSaved();
    } else {
      setError(result.error);
    }
  };

  const dirty =
    form.title !== (asset.title ?? "") ||
    form.alt !== (asset.alt ?? "") ||
    form.description !== (asset.description ?? "");

  return (
    <Modal
      open
      title={asset.title || asset.originalName}
      onClose={onClose}
      width="lg"
      footer={
        <>
          {canDelete && (
            <Button variant="danger" icon="trash" className="mr-auto" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button onClick={onClose} disabled={isBusy("save")}>
            Close
          </Button>
          {canWrite && (
            <Button
              variant="primary"
              icon="check"
              loading={isBusy("save")}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Save details
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNote message={error} />}

        <div className="panel-sunken flex items-center justify-center overflow-hidden p-2">
          {asset.kind === "image" ? (
            <img src={asset.url} alt={asset.alt ?? ""} className="max-h-72 w-auto object-contain" />
          ) : asset.kind === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={asset.url} controls className="max-h-72 w-full" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-faint">
              <Icon name="file" size={32} />
              <p className="text-xs">{shortType(asset.mimeType)} document</p>
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent-ice underline-offset-2 hover:underline"
              >
                Open in a new tab
              </a>
            </div>
          )}
        </div>

        {canWrite ? (
          <div className="space-y-4">
            <Input
              label="Display title"
              hint="Shown in the library. The original file name is kept regardless."
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            {asset.kind === "image" && (
              <Input
                label="Alt text"
                hint="Describes the image for screen readers. Required for an image on a published page."
                error={!form.alt && asset.usageCount > 0 ? "This image is in use and has no alt text." : undefined}
                value={form.alt}
                onChange={(e) => setForm({ ...form, alt: e.target.value })}
              />
            )}
            <Textarea
              label="Description"
              rows={2}
              hint="Internal note about this file."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        ) : (
          <DescriptionList
            items={[
              { label: "Title", value: asset.title },
              { label: "Alt text", value: asset.alt },
              { label: "Description", value: asset.description },
            ]}
          />
        )}

        <div>
          <p className="label mb-2">File</p>
          <DescriptionList
            items={[
              { label: "Original name", value: <span className="mono break-all">{asset.originalName}</span> },
              { label: "Type", value: asset.mimeType },
              { label: "Size", value: formatBytes(asset.sizeBytes) },
              {
                label: "Dimensions",
                value: asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
              },
              { label: "Uploaded", value: formatDateTime(asset.createdAt) },
              { label: "Uploaded by", value: asset.uploadedBy?.name },
            ]}
          />
        </div>

        <div>
          <SectionHeading title="Where this is used" icon="pages" />
          {usage.initial ? (
            <Loading label="Checking" />
          ) : (usage.data?.total ?? 0) === 0 ? (
            <p className="text-sm text-faint">Nothing references this file.</p>
          ) : (
            <ul className="space-y-1.5">
              {usage.data!.items.map((u, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-faint">{u.type}:</span> {u.name}
                  </span>
                  <Badge tone={u.status === "PUBLISHED" ? "positive" : "caution"}>
                    {u.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[0.6875rem] text-faint" title={formatDateTime(asset.updatedAt)}>
          Last changed {relativeTime(asset.updatedAt)}
        </p>
      </div>
    </Modal>
  );
}

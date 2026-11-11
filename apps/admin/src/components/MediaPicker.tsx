/**
 * Media picker.
 *
 * Chooses an existing library asset, or uploads a new one in place.
 * Private assets (applicant resumes) are never listed — the API
 * excludes them — so there is no way to attach one to a public page
 * from here.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useList } from "@/lib/hooks";
import { formatBytes } from "@/lib/format";
import { useToast } from "./Toast";
import { Modal } from "./Modal";
import { Icon, iconForKind } from "./Icon";
import {
  Button,
  EmptyState,
  ErrorNote,
  FilterSelect,
  Loading,
  SearchInput,
  Toolbar,
} from "./ui";

export interface MediaAsset {
  id: string;
  url: string;
  originalName: string;
  title: string | null;
  alt: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  kind: string | null;
}

/* ── Inline field ─────────────────────────────────────────── */

export function MediaField({
  label,
  hint,
  mediaId,
  alt,
  onChange,
  onAltChange,
  kind = "image",
  disabled,
}: {
  label: string;
  hint?: string;
  mediaId: string | null;
  alt?: string | null;
  onChange(id: string | null): void;
  onAltChange?: (alt: string) => void;
  kind?: "image" | "video" | "document" | "any";
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const { data } = useQueryAsset(mediaId);

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-medium text-body">{label}</p>

      <div className="panel-sunken flex items-center gap-3 p-3">
        {data ? (
          <>
            {data.kind === "image" ? (
              <img
                src={data.url}
                alt=""
                className="h-14 w-14 shrink-0 rounded border border-line object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-line bg-raised text-faint">
                <Icon name={iconForKind(data.kind)} size={20} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{data.title || data.originalName}</p>
              <p className="text-xs text-faint">
                {formatBytes(data.sizeBytes)}
                {data.width && data.height ? ` · ${data.width}×${data.height}` : ""}
              </p>
            </div>
          </>
        ) : mediaId ? (
          <div className="flex-1 text-xs text-caution">
            <Icon name="alert" size={13} className="mr-1 inline" />
            That file is no longer in the library.
          </div>
        ) : (
          <div className="flex-1 text-xs text-faint">No file chosen.</div>
        )}

        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" icon="media" onClick={() => setPicking(true)} disabled={disabled}>
            {mediaId ? "Change" : "Choose"}
          </Button>
          {mediaId && (
            <Button size="sm" variant="ghost" icon="close" onClick={() => onChange(null)} disabled={disabled}>
              <span className="sr-only">Remove</span>
            </Button>
          )}
        </div>
      </div>

      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}

      {/* Alt text lives beside the picker, because an image published
          without it is an accessibility defect, not a nicety. */}
      {mediaId && onAltChange && (
        <div className="mt-2">
          <input
            className="field text-xs"
            placeholder="Describe this image for screen readers"
            value={alt ?? ""}
            onChange={(e) => onAltChange(e.target.value)}
            disabled={disabled}
            aria-label={`Alt text for ${label}`}
          />
          {!alt && (
            <p className="mt-1 flex items-center gap-1 text-xs text-caution">
              <Icon name="alert" size={12} />
              Add alt text before publishing.
            </p>
          )}
        </div>
      )}

      <MediaPickerDialog
        open={picking}
        kind={kind}
        onClose={() => setPicking(false)}
        onPick={(asset) => {
          onChange(asset.id);
          // Offer the library's alt text rather than leaving it blank.
          if (onAltChange && !alt && asset.alt) onAltChange(asset.alt);
          setPicking(false);
        }}
      />
    </div>
  );
}

/** Loads one asset's metadata, tolerating a reference that has gone. */
function useQueryAsset(id: string | null) {
  const [data, setData] = useState<MediaAsset | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }
    let live = true;
    void api
      .get<{ item: MediaAsset }>(`/media/${id}`)
      .then((r) => {
        if (live) setData(r.item);
      })
      .catch(() => {
        if (live) setData(null);
      });
    return () => {
      live = false;
    };
  }, [id]);

  return { data };
}

/* ── Picker dialog ────────────────────────────────────────── */

export function MediaPickerDialog({
  open,
  onClose,
  onPick,
  kind = "any",
}: {
  open: boolean;
  onClose(): void;
  onPick(asset: MediaAsset): void;
  kind?: "image" | "video" | "document" | "any";
}) {
  const list = useList<MediaAsset>("/media", { kind: kind === "any" ? "" : kind }, 24);
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
      for (const f of Array.from(files)) form.append("file", f);

    const result = await run("upload", () =>
      api.upload<{ items: MediaAsset[]; rejected: Array<{ filename: string; reason: string }> }>(
        "/media",
        form
      )
    );

    if (!result.ok) {
      notify(result.error, "error");
      return;
    }
    const { items, rejected } = result.value;
    if (rejected?.length) {
      notify(`${rejected.length} file(s) rejected`, "warning", rejected[0]?.reason);
    }
    if (items[0]) {
      notify("Uploaded");
      onPick(items[0]);
    }
    await list.reload();
  };

  return (
    <Modal open={open} title="Choose a file" onClose={onClose} width="xl">
      <Toolbar>
        <SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="Search the library…" />
        {kind === "any" && (
          <FilterSelect
            label="Type"
            value={String(list.filters.kind ?? "")}
            onChange={(v) => list.setFilter({ kind: v })}
            allLabel="All types"
            options={[
              { value: "image", label: "Images" },
              { value: "video", label: "Video" },
              { value: "document", label: "Documents" },
            ]}
          />
        )}
        <label className="mb-px ml-auto">
          <span className="sr-only">Upload a file</span>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => void upload(e.target.files)}
          />
          <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-inner bg-accent-strong px-3 text-xs font-medium text-white transition-colors hover:bg-accent">
            <Icon name="upload" size={14} />
            {isBusy("upload") ? "Uploading…" : "Upload"}
          </span>
        </label>
      </Toolbar>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      {list.initial ? (
        <Loading label="Loading the library" />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon="media"
          title={list.filtered ? "Nothing matches" : "The library is empty"}
          hint={list.filtered ? "Try a different search." : "Upload a file to get started."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {list.items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m)}
              className="panel group overflow-hidden p-0 text-left transition-colors hover:border-accent"
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-sunken">
                {m.kind === "image" ? (
                  <img
                    src={m.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                  />
                ) : (
                  <Icon name={iconForKind(m.kind)} size={26} className="text-faint" />
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-medium" title={m.originalName}>
                  {m.title || m.originalName}
                </p>
                <p className="text-[0.625rem] text-faint">{formatBytes(m.sizeBytes)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {list.pagination && list.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-faint">
          <Button
            size="sm"
            icon="chevronLeft"
            disabled={!list.pagination.hasPrev}
            onClick={() => list.setPage(list.pagination!.page - 1)}
          >
            Previous
          </Button>
          <span className="tabular px-1">
            {list.pagination.page} / {list.pagination.totalPages}
          </span>
          <Button
            size="sm"
            disabled={!list.pagination.hasNext}
            onClick={() => list.setPage(list.pagination!.page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </Modal>
  );
}

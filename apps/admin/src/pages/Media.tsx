import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, qs, type Paged } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatBytes, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { Button, EmptyState, ErrorNote, Input, Loading, PageHeader, Pagination } from "@/components/ui";

interface Asset {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  alt: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/svg+xml,application/pdf";

export function MediaPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<Paged<Asset> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  const [editing, setEditing] = useState<Asset | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Asset | null>(null);

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
        setData(await api.get<Paged<Asset>>(`/media${qs({ page, perPage: 24, search: search || undefined })}`, signal));
      } catch (e) {
        if (!signal?.aborted) setError(e instanceof Error ? e.message : "Failed to load");
      }
    },
    [page, search]
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.upload("/media", form);
      notify("File uploaded");
      await load();
    } catch (e) {
      // The API checks the real bytes, so a renamed file is rejected
      // here with a specific reason worth surfacing.
      notify(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveAlt = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/media/${editing.id}`, { alt: alt.trim() || null });
      notify("Description saved");
      setEditing(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await api.del(`/media/${confirming.id}`);
      notify("File deleted");
      setConfirming(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not delete", "error");
    } finally {
      setBusy(false);
    }
  };

  const canWrite = can("media:write");

  return (
    <>
      <PageHeader
        title="Media"
        description="Images and documents used on the website. Files are stored outside the database."
        actions={
          canWrite ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <Button variant="primary" loading={uploading} onClick={() => fileRef.current?.click()}>
                Upload file
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4">
        <input
          className="field max-w-xs"
          placeholder="Search files…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search media"
        />
      </div>

      {error && <ErrorNote message={error} />}

      {!data && !error ? (
        <Loading />
      ) : data && data.items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={search ? "Nothing matches that search" : "No files yet"}
            hint={
              search
                ? undefined
                : "PNG, JPEG, WebP, AVIF, SVG and PDF up to 8 MB. File contents are checked, not just the name."
            }
          />
        </div>
      ) : data ? (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((a) => (
              <li key={a.id} className="panel overflow-hidden">
                <div className="flex h-36 items-center justify-center border-b border-line bg-canvas">
                  {a.mimeType.startsWith("image/") ? (
                    <img src={a.url} alt={a.alt ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
                  ) : (
                    <span className="font-mono text-xs text-faint">{a.mimeType}</span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-medium" title={a.originalName}>{a.originalName}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-faint">
                    {formatBytes(a.sizeBytes)} · {relativeTime(a.createdAt)}
                  </p>
                  <p className="mt-1 truncate text-[0.6875rem] text-faint" title={a.alt ?? ""}>
                    {a.alt ? `“${a.alt}”` : "No description"}
                  </p>
                  {canWrite && (
                    <div className="mt-2.5 flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditing(a);
                          setAlt(a.alt ?? "");
                        }}
                      >
                        Describe
                      </Button>
                      {can("media:delete") && (
                        <Button size="sm" variant="danger" onClick={() => setConfirming(a)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            onPage={setPage}
          />
        </>
      ) : null}

      <Modal
        open={editing !== null}
        title="Describe this file"
        description="Alternative text is read aloud by screen readers."
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void saveAlt()}>Save</Button>
          </>
        }
      >
        <Input
          label="Alternative text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="A polar bear facing right, in outline"
          hint="Leave blank if the image is purely decorative."
        />
      </Modal>

      <Confirm
        open={confirming !== null}
        title="Delete this file?"
        message="If any programme or audience still uses it, the deletion will be refused."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

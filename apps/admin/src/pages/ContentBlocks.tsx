/**
 * Keyed content blocks.
 *
 * Each block has a live value the website reads, and an optional draft
 * the editor is working on. Saving a draft never touches the live
 * value; publishing promotes it and records the previous value as a
 * version, so every change is reversible.
 *
 * Structural blocks — navigation, footer link columns — are locked by
 * the API because they are routing rather than copy. They are shown
 * here read-only rather than hidden, so it is obvious they exist.
 */

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  Notice,
  PageHeader,
  SearchInput,
  SectionHeading,
  StatusBadge,
  Textarea,
  Toolbar,
  humanise,
} from "@/components/ui";

interface Block {
  id: string;
  key: string;
  section: string;
  label: string;
  type: "TEXT" | "RICH_TEXT" | "JSON";
  value: string;
  draftValue: string | null;
  status: string;
  isLocked: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

interface Version {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export function ContentBlocksPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const { data, error, initial, reload } = useQuery<{
    sections: Record<string, Block[]>;
    pendingDrafts: number;
  }>("/content/grouped/all");

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Block | null>(null);
  const [historyFor, setHistoryFor] = useState<Block | null>(null);

  const canWrite = can("content:write");
  const canPublish = can("content:publish");

  const sections = useMemo(() => {
    const all = data?.sections ?? {};
    const needle = search.trim().toLowerCase();
    if (!needle) return all;

    const filtered: Record<string, Block[]> = {};
    for (const [name, blocks] of Object.entries(all)) {
      const matches = blocks.filter((b) =>
        [b.key, b.label, b.value, b.section].some((f) => f?.toLowerCase().includes(needle))
      );
      if (matches.length) filtered[name] = matches;
    }
    return filtered;
  }, [data, search]);

  const publishDraft = async (block: Block) => {
    const result = await run(block.id, () => api.post(`/content/${block.id}/publish-draft`));
    if (result.ok) {
      notify(`"${block.label}" published`);
      await reload();
    } else {
      notify(result.error, "error");
    }
  };

  const discardDraft = async (block: Block) => {
    const result = await run(block.id, () => api.del(`/content/${block.id}/draft`));
    if (result.ok) {
      notify("Draft discarded", "info");
      await reload();
    } else {
      notify(result.error, "error");
    }
  };

  const names = Object.keys(sections).sort();
  const pending = data?.pendingDrafts ?? 0;

  return (
    <>
      <PageHeader
        title="Content blocks"
        description="Individual pieces of copy on the website, addressed by key. Edits are saved as drafts and only reach visitors when published."
        breadcrumbs={[{ label: "Website" }, { label: "Content blocks" }]}
        meta={
          pending > 0 ? (
            <Badge tone="caution" icon="edit">
              {pending} unpublished draft{pending === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by key, label or value…"
        />
      </Toolbar>

      {initial ? (
        <Loading label="Loading content" />
      ) : names.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="text"
            title={search ? "Nothing matches that search" : "No content blocks"}
            hint={search ? undefined : "Run the database seed to create them."}
            action={
              search ? (
                <Button size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {names.map((name) => (
            <Card key={name} padded={false}>
              <div className="px-5 pt-5">
                <SectionHeading
                  title={humanise(name)}
                  description={`${sections[name]!.length} block${sections[name]!.length === 1 ? "" : "s"}`}
                />
              </div>
              <ul className="divide-y divide-line-soft">
                {sections[name]!.map((b) => (
                  <li key={b.id} className={`px-5 py-3.5 ${isBusy(b.id) ? "row-busy" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{b.label}</p>
                          <span className="mono text-faint">{b.key}</span>
                          {b.type !== "TEXT" && <Badge>{b.type === "JSON" ? "JSON" : "Rich text"}</Badge>}
                          {b.isLocked && (
                            <Badge tone="neutral" icon="lock" title="Structural: managed in code">
                              Locked
                            </Badge>
                          )}
                          {b.draftValue !== null && (
                            <Badge tone="caution" icon="edit">
                              Draft pending
                            </Badge>
                          )}
                        </div>

                        <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-body clamp-2">
                          {preview(b.draftValue ?? b.value, b.type)}
                        </p>

                        {b.draftValue !== null && (
                          <p className="mt-1 text-[0.6875rem] text-caution">
                            Showing the draft. Visitors still see the published value.
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <StatusBadge status={b.status} />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="history"
                          onClick={() => setHistoryFor(b)}
                        >
                          <span className="sr-only">History</span>
                        </Button>
                        {b.draftValue !== null && canWrite && (
                          <Button size="sm" onClick={() => void discardDraft(b)}>
                            Discard draft
                          </Button>
                        )}
                        {b.draftValue !== null && canPublish && !b.isLocked && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon="globe"
                            onClick={() => void publishDraft(b)}
                          >
                            Publish
                          </Button>
                        )}
                        {canWrite && !b.isLocked && (
                          <Button size="sm" icon="edit" onClick={() => setEditing(b)}>
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <BlockEditor
        block={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await reload();
        }}
      />

      <BlockHistory
        block={historyFor}
        onClose={() => setHistoryFor(null)}
        onRestored={async () => {
          setHistoryFor(null);
          await reload();
        }}
      />
    </>
  );
}

/** A short, readable rendering of a stored value. */
function preview(value: string, type: Block["type"]): string {
  if (type !== "JSON") return value || "—";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((v) => (typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v)))
        .join(" · ");
    }
    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}

/* ── Draft editor ─────────────────────────────────────────── */

function BlockEditor({
  block,
  onClose,
  onSaved,
}: {
  block: Block | null;
  onClose(): void;
  onSaved(): void;
}) {
  // Keyed on the block id so the inner editor remounts with fresh
  // state for each block, rather than deriving state during render.
  if (!block) return null;
  return <BlockEditorForm key={block.id} block={block} onClose={onClose} onSaved={onSaved} />;
}

function BlockEditorForm({
  block,
  onClose,
  onSaved,
}: {
  block: Block;
  onClose(): void;
  onSaved(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [text, setText] = useState(block.draftValue ?? block.value);
  const [error, setError] = useState<string | null>(null);

  const isJson = block.type === "JSON";

  const jsonProblem = useMemo(() => {
    if (!isJson || !text.trim()) return null;
    try {
      JSON.parse(text);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [isJson, text]);

  const save = async (andPublish: boolean) => {
    setError(null);
    const result = await run("save", async () => {
      await api.put(`/content/${block.id}/draft`, { draftValue: text });
      if (andPublish) await api.post(`/content/${block.id}/publish-draft`);
    });
    if (result.ok) {
      notify(andPublish ? `"${block.label}" published` : "Draft saved");
      onSaved();
    } else {
      setError(result.error);
    }
  };

  const unchanged = text === (block.draftValue ?? block.value);

  return (
    <Modal
      open
      title={block.label}
      description={`Key: ${block.key}`}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={isBusy("save")}>
            Cancel
          </Button>
          <Button
            loading={isBusy("save")}
            disabled={Boolean(jsonProblem) || unchanged}
            onClick={() => void save(false)}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            icon="globe"
            loading={isBusy("save")}
            disabled={Boolean(jsonProblem)}
            onClick={() => void save(true)}
          >
            Save and publish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}

        <Notice tone="info">
          Plain text only. Markup and scripts are rejected, so a stray tag cannot break the page it
          appears on.
        </Notice>

        <Textarea
          label="Value"
          rows={isJson ? 12 : 6}
          value={text}
          error={jsonProblem ?? undefined}
          className={isJson ? "font-mono text-xs" : ""}
          aside={`${text.length} characters`}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="panel-sunken p-3">
          <p className="label mb-2">Currently published</p>
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-faint">
            {preview(block.value, block.type)}
          </p>
        </div>
      </div>
    </Modal>
  );
}

/* ── History ──────────────────────────────────────────────── */

function BlockHistory({
  block,
  onClose,
  onRestored,
}: {
  block: Block | null;
  onClose(): void;
  onRestored(): void;
}) {
  if (!block) return null;
  return <BlockHistoryList key={block.id} block={block} onClose={onClose} onRestored={onRestored} />;
}

function BlockHistoryList({
  block,
  onClose,
  onRestored,
}: {
  block: Block;
  onClose(): void;
  onRestored(): void;
}) {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const { data, error, initial } = useQuery<{ items: Version[] }>(`/content/${block.id}/versions`);
  const [confirming, setConfirming] = useState<Version | null>(null);

  const versions = data?.items ?? [];

  const restore = async () => {
    if (!confirming) return;
    const result = await run("restore", () =>
      api.post<{ note: string }>(`/content/${block.id}/restore`, { version: confirming.version })
    );
    setConfirming(null);
    if (result.ok) {
      notify(`Version ${confirming.version} restored`, "info", result.value.note);
      onRestored();
    } else {
      notify(result.error, "error");
    }
  };

  return (
    <>
      <Modal
        open
        title={`History — ${block.label}`}
        description="The previous value is recorded every time this block is published."
        onClose={onClose}
      >
        {error && <ErrorNote message={error} />}
        {initial ? (
          <Loading />
        ) : versions.length === 0 ? (
          <EmptyState
            icon="history"
            title="No earlier versions"
            hint="A version is recorded the first time this block is published."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="mono mr-2 text-faint">v{v.version}</span>
                    {v.label ?? "Snapshot"}
                  </p>
                  <p className="mt-0.5 text-xs text-faint" title={formatDateTime(v.createdAt)}>
                    {v.actor?.name ?? "System"} · {relativeTime(v.createdAt)}
                  </p>
                </div>
                {can("version:restore") && (
                  <Button size="sm" icon="history" onClick={() => setConfirming(v)}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Confirm
        open={confirming !== null}
        title={`Restore version ${confirming?.version}?`}
        message="That value is copied into the draft for this block."
        warning="The website keeps showing the published value until you publish the restored draft."
        confirmLabel="Restore into draft"
        busy={isBusy("restore")}
        onConfirm={() => void restore()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

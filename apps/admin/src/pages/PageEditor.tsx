/**
 * Page editor.
 *
 * Renders a form over the page's draft document. The document's shape
 * comes from the API, and this editor only ever changes values inside
 * it — it never adds or removes a region, because the API would refuse
 * the result and, more importantly, the public page expects the
 * regions it has.
 *
 * Saving writes the draft. The website still shows the published
 * version until someone publishes, so an unfinished edit cannot reach
 * a visitor.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useDraft, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { MediaField } from "@/components/MediaPicker";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  IconButton,
  Input,
  Loading,
  Notice,
  PageHeader,
  SaveBar,
  SectionHeading,
  StatusBadge,
  StringList,
  Switch,
  Textarea,
  humanise,
} from "@/components/ui";

type Doc = Record<string, unknown>;

interface PageDetail {
  id: string;
  key: string;
  title: string;
  label: string;
  route: string | null;
  description: string | null;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageId: string | null;
  draft: Doc;
  published: Doc | null;
  hasUnpublishedChanges: boolean;
}

interface Version {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  /** False when this version predates a change to the page's sections. */
  restorable: boolean;
}

export function PageEditor() {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const page = useQuery<{ item: PageDetail }>(`/pages/${key}`);
  const item = page.data?.item ?? null;

  const draft = useDraft<Doc>(item?.draft ?? null);
  const [meta, setMeta] = useState<{
    seoTitle: string;
    seoDescription: string;
    seoImageId: string | null;
  } | null>(null);
  const [metaDirty, setMetaDirty] = useState(false);

  const [showVersions, setShowVersions] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  // Adopt the SEO fields once the record arrives.
  const effectiveMeta = useMemo(
    () =>
      meta ?? {
        seoTitle: item?.seoTitle ?? "",
        seoDescription: item?.seoDescription ?? "",
        seoImageId: item?.seoImageId ?? null,
      },
    [meta, item]
  );

  const patchMeta = (patch: Partial<typeof effectiveMeta>) => {
    setMeta({ ...effectiveMeta, ...patch });
    setMetaDirty(true);
  };

  const canWrite = can("page:write");
  const canPublish = can("page:publish");
  const dirty = draft.dirty || metaDirty;

  const save = useCallback(async () => {
    if (!draft.value) return;

    if (metaDirty) {
      const metaResult = await run("save", () =>
        api.patch(`/pages/${key}`, {
          seoTitle: effectiveMeta.seoTitle || null,
          seoDescription: effectiveMeta.seoDescription || null,
          seoImageId: effectiveMeta.seoImageId,
        })
      );
      if (!metaResult.ok) {
        notify(metaResult.error, "error");
        return;
      }
      setMetaDirty(false);
    }

    if (draft.dirty) {
      const result = await run("save", () =>
        api.put<{ item: PageDetail }>(`/pages/${key}/draft`, { draft: draft.value })
      );
      if (!result.ok) {
        notify(result.error, "error");
        return;
      }
      draft.commit(result.value.item.draft);
    }

    notify("Draft saved. The website still shows the published version.");
    await page.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, metaDirty, effectiveMeta, key]);

  const publish = async () => {
    if (dirty) {
      notify("Save your changes first, then publish.", "warning");
      return;
    }
    const result = await run("publish", () => api.post(`/pages/${key}/publish`, {}));
    if (result.ok) {
      notify("Published. The change is live on the website.");
      await page.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const unpublish = async () => {
    const result = await run("publish", () =>
      api.post<{ note: string }>(`/pages/${key}/unpublish`)
    );
    setConfirmUnpublish(false);
    if (result.ok) {
      notify("Unpublished", "info", result.value.note);
      await page.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const preview = async () => {
    const result = await run("preview", () =>
      api.post<{ url: string; expiresAt: string }>(`/pages/${key}/preview`)
    );
    if (result.ok) {
      window.open(result.value.url, "_blank", "noopener");
    } else {
      notify(result.error, "error");
    }
  };

  if (page.initial) return <Loading label="Loading the page" />;

  if (page.error || !item) {
    return (
      <>
        <PageHeader title="Page" breadcrumbs={[{ label: "Website" }, { label: "Pages", to: "/pages" }]} />
        <ErrorNote message={page.error ?? "That page does not exist."} onRetry={page.reload} />
        <div className="mt-4">
          <Button icon="chevronLeft" onClick={() => navigate("/pages")}>
            Back to pages
          </Button>
        </div>
      </>
    );
  }

  const regions = orderRegions(draft.value);

  return (
    <>
      <PageHeader
        title={item.label}
        description={
          item.description ??
          (item.route
            ? `Editable regions of ${item.route}. Saving writes a draft; publishing makes it live.`
            : "Editable regions of this page.")
        }
        breadcrumbs={[
          { label: "Website" },
          { label: "Pages", to: "/pages" },
          { label: item.label },
        ]}
        meta={
          <>
            <StatusBadge status={item.status} />
            {item.hasUnpublishedChanges && (
              <Badge tone="caution" icon="edit">
                Unpublished changes
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <Button icon="history" onClick={() => setShowVersions(true)}>
              History
            </Button>
            <Button icon="eye" loading={isBusy("preview")} onClick={() => void preview()}>
              Preview draft
            </Button>
            {canPublish && item.status === "PUBLISHED" && (
              <Button icon="close" onClick={() => setConfirmUnpublish(true)}>
                Unpublish
              </Button>
            )}
            {canPublish && (
              <Button
                variant="primary"
                icon="globe"
                loading={isBusy("publish")}
                disabled={dirty}
                title={dirty ? "Save your changes before publishing" : undefined}
                onClick={() => void publish()}
              >
                Publish
              </Button>
            )}
          </>
        }
      />

      {!canWrite && (
        <div className="mb-4">
          <Notice tone="info" icon="lock">
            You have read-only access to page content.
          </Notice>
        </div>
      )}

      {item.key === "home" && (
        <div className="mb-4">
          <Notice tone="info">
            Only the sections below the homepage's first screen are editable. The hero, navigation
            and video are not content and cannot be changed from here.
          </Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Regions ─────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          {regions.length === 0 ? (
            <Card padded={false}>
              <EmptyState icon="pages" title="This page has no editable regions" />
            </Card>
          ) : (
            regions.map((name) => (
              <RegionEditor
                key={name}
                name={name}
                value={(draft.value as Doc)[name]}
                disabled={!canWrite}
                onChange={(next) =>
                  draft.update((current) => ({ ...(current as Doc), [name]: next }) as Doc)
                }
              />
            ))
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="space-y-4">
          <Card>
            <SectionHeading title="Search listing" icon="search" description="How this page appears in search results and when shared." />
            <div className="space-y-4">
              <Input
                label="SEO title"
                value={effectiveMeta.seoTitle}
                disabled={!canWrite}
                aside={`${effectiveMeta.seoTitle.length}/60`}
                hint="Around 60 characters reads best."
                onChange={(e) => patchMeta({ seoTitle: e.target.value })}
              />
              <Textarea
                label="SEO description"
                rows={3}
                value={effectiveMeta.seoDescription}
                disabled={!canWrite}
                aside={`${effectiveMeta.seoDescription.length}/160`}
                hint="Around 160 characters reads best."
                onChange={(e) => patchMeta({ seoDescription: e.target.value })}
              />
              <MediaField
                label="Social sharing image"
                mediaId={effectiveMeta.seoImageId}
                disabled={!canWrite}
                onChange={(id) => patchMeta({ seoImageId: id })}
              />
            </div>
          </Card>

          <Card>
            <SectionHeading title="Status" icon="info" />
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Published</dt>
                <dd className="text-right" title={formatDateTime(item.publishedAt)}>
                  {item.publishedAt ? relativeTime(item.publishedAt) : "Never"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Last edited</dt>
                <dd className="text-right" title={formatDateTime(item.updatedAt)}>
                  {relativeTime(item.updatedAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Regions</dt>
                <dd className="tabular text-right">{regions.length}</dd>
              </div>
            </dl>

            {item.status !== "PUBLISHED" && (
              <div className="mt-4">
                <Notice tone="caution">
                  Nothing is published for this page, so the website falls back to its built-in copy.
                </Notice>
              </div>
            )}
          </Card>
        </aside>
      </div>

      <SaveBar
        dirty={dirty && canWrite}
        saving={isBusy("save")}
        onSave={() => void save()}
        onDiscard={() => {
          draft.reset();
          setMeta(null);
          setMetaDirty(false);
        }}
        message="Unsaved changes. The website is unaffected until you save and publish."
      />

      <VersionHistory
        open={showVersions}
        pageKey={key}
        onClose={() => setShowVersions(false)}
        onRestored={async () => {
          setShowVersions(false);
          await page.reload();
        }}
      />

      <Confirm
        open={confirmUnpublish}
        title="Unpublish this page?"
        message="Its published content is removed and the website falls back to the copy built into the site."
        warning="Your draft is kept, so you can publish again at any time."
        confirmLabel="Unpublish"
        busy={isBusy("publish")}
        onConfirm={() => void unpublish()}
        onCancel={() => setConfirmUnpublish(false)}
      />
    </>
  );
}


/* ── Ordering ─────────────────────────────────────────────────
 *
 * Postgres stores these documents as JSONB, which does not keep the
 * key order they were written in — it sorts keys by length, then
 * bytewise. Left alone, the editor would show "Focus" before "Intro"
 * and a section's body above its heading.
 *
 * Each region carries its own `order`, so that is what decides the
 * sequence; within a region, fields follow a fixed, readable order.
 */

/** Regions, sorted by the `order` each one declares. */
function orderRegions(doc: Doc | null): string[] {
  if (!doc) return [];
  return Object.keys(doc).sort((a, b) => {
    const oa = orderOf(doc[a]);
    const ob = orderOf(doc[b]);
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });
}

function orderOf(region: unknown): number {
  if (region && typeof region === "object" && !Array.isArray(region)) {
    const order = (region as Doc).order;
    if (typeof order === "number") return order;
  }
  // A region with no declared order (e.g. the Outcomes section list)
  // sorts last rather than jumping to the front.
  return Number.MAX_SAFE_INTEGER;
}

/** Labels and headings first, then prose, then lists, then images. */
const FIELD_ORDER = [
  "id",
  "kicker",
  "heading",
  "title",
  "body",
  "support",
  "paragraphs",
  "note",
  "successMessage",
  "ctaLabel",
  "primaryLabel",
  "secondaryLabel",
  "slug",
  "programme",
  "items",
  "points",
  "steps",
  "groups",
  "roles",
  "examples",
  "image",
];

function orderFields(obj: Doc): Array<[string, unknown]> {
  return Object.entries(obj).sort(([a], [b]) => {
    const ia = FIELD_ORDER.indexOf(a);
    const ib = FIELD_ORDER.indexOf(b);
    // Anything unrecognised keeps a stable place after the known fields.
    const ra = ia === -1 ? FIELD_ORDER.length : ia;
    const rb = ib === -1 ? FIELD_ORDER.length : ib;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

/* ── Region editor ────────────────────────────────────────── */

/**
 * Renders one region of the document.
 *
 * Field names are matched by convention rather than by a parallel
 * schema, so adding a region to the API's page schema needs no change
 * here — it simply appears with the right control.
 */
function RegionEditor({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: unknown;
  onChange(next: unknown): void;
  disabled?: boolean;
}) {
  // `outcomes.sections` is a list of sections rather than one section.
  if (Array.isArray(value)) {
    return (
      <RepeatableSections
        name={name}
        items={value as Doc[]}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (!value || typeof value !== "object") return null;
  const region = value as Doc;

  const visible = region.visible !== false;

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-line-soft pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{humanise(name)}</h2>
          <p className="mono mt-0.5 text-faint">{name}</p>
        </div>
        {"visible" in region && (
          <div className="shrink-0">
            <Switch
              label=""
              checked={visible}
              disabled={disabled}
              onChange={(next) => onChange({ ...region, visible: next })}
            />
          </div>
        )}
      </div>

      {"visible" in region && !visible && (
        <div className="mb-4">
          <Notice tone="caution" icon="eye">
            Hidden. This section will not render on the website.
          </Notice>
        </div>
      )}

      <div className={`space-y-4 ${!visible ? "opacity-60" : ""}`}>
        {orderFields(region)
          .filter(([k]) => k !== "visible" && k !== "order")
          .map(([k, v]) => (
            <FieldFor
              key={k}
              name={k}
              value={v}
              disabled={disabled}
              onChange={(next) => onChange({ ...region, [k]: next })}
            />
          ))}
      </div>
    </Card>
  );
}

/**
 * How each field is labelled in the editor.
 *
 * A humanised key reads badly for the ones that are not plain nouns —
 * "Ctalabel", "Primarylabel" — and says nothing about where the value
 * ends up on the page.
 */
const FIELD_LABELS: Record<string, string> = {
  kicker: "Eyebrow label",
  heading: "Heading",
  title: "Title",
  body: "Body",
  support: "Supporting paragraph",
  ctaLabel: "Button label",
  primaryLabel: "Primary button label",
  secondaryLabel: "Secondary button label",
  successMessage: "Message shown after sending",
  note: "Qualifying note",
  paragraphs: "Paragraphs",
  points: "Points",
  roles: "Roles",
  items: "Items",
  steps: "Steps",
  groups: "Groups",
  examples: "Examples",
  image: "Image",
  slug: "Programme slug",
  programme: "Programme",
  id: "Anchor id",
};

/** Picks a control from a field's name and the shape of its value. */
function FieldFor({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: unknown;
  onChange(next: unknown): void;
  disabled?: boolean;
}) {
  const label = FIELD_LABELS[name] ?? humanise(name);

  // An image reference: { mediaId, alt }
  if (name === "image") {
    const img = (value ?? {}) as { mediaId?: string | null; alt?: string | null };
    return (
      <MediaField
        label={label}
        mediaId={img.mediaId ?? null}
        alt={img.alt ?? ""}
        disabled={disabled}
        onChange={(id) => onChange(id ? { mediaId: id, alt: img.alt ?? "" } : null)}
        onAltChange={(alt) => onChange({ mediaId: img.mediaId ?? null, alt })}
      />
    );
  }

  if (typeof value === "boolean") {
    return (
      <Switch label={label} checked={value} disabled={disabled} onChange={(n) => onChange(n)} />
    );
  }

  if (Array.isArray(value)) {
    // A list of strings, e.g. paragraphs or examples.
    if (value.length === 0 || typeof value[0] === "string") {
      return (
        <StringList
          label={label}
          value={value as string[]}
          onChange={(next) => onChange(next)}
          rows={name === "paragraphs" ? 8 : 5}
          hint={
            name === "paragraphs"
              ? "One paragraph per line."
              : undefined
          }
        />
      );
    }
    // A list of objects — titled items, process steps, pathway groups.
    return (
      <RepeatableItems
        label={label}
        items={value as Doc[]}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  const text = typeof value === "string" ? value : "";
  const isLong =
    name === "body" ||
    name === "support" ||
    name === "note" ||
    name === "successMessage" ||
    text.length > 110;

  const hint = name.endsWith("Label")
    ? "The button's words. Where it goes is fixed in the site."
    : undefined;

  if (isLong) {
    return (
      <Textarea
        label={label}
        rows={name === "body" ? 4 : 3}
        value={text}
        disabled={disabled}
        aside={text ? `${text.length} characters` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Input
      label={label}
      hint={hint}
      value={text}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ── Repeatable lists ─────────────────────────────────────── */

/** A list of small objects: { title, body }, { programme, roles }, … */
function RepeatableItems({
  label,
  items,
  onChange,
  disabled,
}: {
  label: string;
  items: Doc[];
  onChange(next: Doc[]): void;
  disabled?: boolean;
}) {
  const template = useMemo<Doc>(() => {
    const first = items[0];
    if (!first) return { title: "", body: "" };
    return Object.fromEntries(
      Object.entries(first).map(([k, v]) => [k, Array.isArray(v) ? [] : ""])
    );
  }, [items]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-body">{label}</p>
        <span className="text-[0.6875rem] text-faint">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2.5">
        {items.map((entry, i) => (
          <div key={i} className="panel-sunken p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="label">#{i + 1}</span>
              <div className="flex gap-0.5">
                <IconButton
                  icon="chevronUp"
                  label="Move up"
                  size="xs"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, i - 1)}
                />
                <IconButton
                  icon="chevronDown"
                  label="Move down"
                  size="xs"
                  disabled={disabled || i === items.length - 1}
                  onClick={() => move(i, i + 1)}
                />
                <IconButton
                  icon="trash"
                  label="Remove"
                  size="xs"
                  className="hover:text-danger"
                  disabled={disabled}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                />
              </div>
            </div>

            <div className="space-y-3">
              {orderFields(entry).map(([k, v]) => (
                <FieldFor
                  key={k}
                  name={k}
                  value={v}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange(items.map((row, j) => (j === i ? { ...row, [k]: next } : row)))
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        icon="plus"
        className="mt-2.5"
        disabled={disabled}
        onClick={() => onChange([...items, { ...template }])}
      >
        Add {label.toLowerCase().replace(/s$/, "")}
      </Button>
    </div>
  );
}

/** The Outcomes page's list of full sections, each with its own fields. */
function RepeatableSections({
  name,
  items,
  onChange,
  disabled,
}: {
  name: string;
  items: Doc[];
  onChange(next: Doc[]): void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(0);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };

  return (
    <Card>
      <SectionHeading
        title={humanise(name)}
        description={`${items.length} section${items.length === 1 ? "" : "s"} on this page.`}
        actions={
          <Button
            size="sm"
            icon="plus"
            disabled={disabled}
            onClick={() =>
              onChange([
                ...items,
                {
                  id: `section-${items.length + 1}`,
                  heading: "",
                  body: "",
                  points: [],
                  examples: [],
                  visible: true,
                },
              ])
            }
          >
            Add section
          </Button>
        }
      />

      <div className="space-y-2">
        {items.map((section, i) => {
          const expanded = open === i;
          const heading = String(section.heading ?? "") || `Section ${i + 1}`;
          const hidden = section.visible === false;

          return (
            <div key={String(section.id ?? i)} className="panel-sunken overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : i)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Icon
                    name={expanded ? "chevronDown" : "chevronRight"}
                    size={14}
                    className="shrink-0 text-faint"
                  />
                  <span className="truncate text-sm">{heading}</span>
                  {hidden && <Badge tone="caution">Hidden</Badge>}
                </button>
                <div className="flex shrink-0 gap-0.5">
                  <IconButton
                    icon="chevronUp"
                    label="Move up"
                    size="xs"
                    disabled={disabled || i === 0}
                    onClick={() => move(i, i - 1)}
                  />
                  <IconButton
                    icon="chevronDown"
                    label="Move down"
                    size="xs"
                    disabled={disabled || i === items.length - 1}
                    onClick={() => move(i, i + 1)}
                  />
                  <IconButton
                    icon="trash"
                    label="Remove section"
                    size="xs"
                    className="hover:text-danger"
                    disabled={disabled}
                    onClick={() => onChange(items.filter((_, j) => j !== i))}
                  />
                </div>
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-line-soft px-3 py-4">
                  {orderFields(section)
                    .filter(([k]) => k !== "order")
                    .map(([k, v]) => (
                      <FieldFor
                        key={k}
                        name={k}
                        value={v}
                        disabled={disabled}
                        onChange={(next) =>
                          onChange(items.map((row, j) => (j === i ? { ...row, [k]: next } : row)))
                        }
                      />
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Version history ──────────────────────────────────────── */

function VersionHistory({
  open,
  pageKey,
  onClose,
  onRestored,
}: {
  open: boolean;
  pageKey: string;
  onClose(): void;
  onRestored(): void;
}) {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const { data, error, initial, reload } = useQuery<{ items: Version[] }>(
    open ? `/pages/${pageKey}/versions` : null
  );
  const [confirming, setConfirming] = useState<Version | null>(null);

  const restore = async () => {
    if (!confirming) return;
    const result = await run("restore", () =>
      api.post<{ note: string }>(`/pages/${pageKey}/restore`, { version: confirming.version })
    );
    setConfirming(null);
    if (result.ok) {
      notify(`Version ${confirming.version} restored`, "info", result.value.note);
      onRestored();
    } else {
      notify(result.error, "error");
    }
  };

  const versions = data?.items ?? [];

  return (
    <>
      <Modal
        open={open}
        title="Version history"
        description="A snapshot is recorded every time this page is published."
        onClose={onClose}
        width="lg"
      >
        {error && <ErrorNote message={error} onRetry={reload} />}
        {initial ? (
          <Loading />
        ) : versions.length === 0 ? (
          <EmptyState
            icon="history"
            title="No versions yet"
            hint="Publish the page to record its first snapshot."
          />
        ) : (
          <>
            <Notice tone="info">
              Restoring copies a version into the draft. The website keeps showing the published
              version until you publish again, so a rollback is reviewable before it goes live.
            </Notice>
            <ul className="mt-4 divide-y divide-line-soft">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="mono text-faint">v{v.version}</span>
                      {v.label ?? "Published"}
                      {!v.restorable && (
                        <Badge tone="neutral" icon="info">
                          Older page structure
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {v.actor?.name ?? "System"} · {formatDateTime(v.createdAt)}
                    </p>
                    {!v.restorable && (
                      <p className="mt-1 text-xs text-faint">
                        Saved before this page's sections changed, so it no longer matches the
                        page. Kept as a record.
                      </p>
                    )}
                  </div>
                  {can("version:restore") && (
                    <Button
                      size="sm"
                      icon="history"
                      loading={isBusy("restore")}
                      disabled={!v.restorable}
                      title={v.restorable ? undefined : "This version no longer matches the page"}
                      onClick={() => setConfirming(v)}
                    >
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>

      <Confirm
        open={confirming !== null}
        title={`Restore version ${confirming?.version}?`}
        message="This version's content replaces your current draft."
        warning="Any unsaved or unpublished draft edits are overwritten. The live website is unchanged until you publish."
        confirmLabel="Restore into draft"
        busy={isBusy("restore")}
        onConfirm={() => void restore()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

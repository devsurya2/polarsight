/**
 * Programme editor.
 *
 * Tabs rather than one long form: a programme has detail, curriculum,
 * images, FAQs and SEO, and those are edited at different times by
 * different people.
 *
 * Every list field is an array of plain strings, never free HTML, so
 * nothing typed here can introduce markup into a public page.
 */

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useDraft, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { MediaField, MediaPickerDialog, type MediaAsset } from "@/components/MediaPicker";
import { Icon } from "@/components/Icon";
import {
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
  Select,
  StatusBadge,
  StringList,
  Tabs,
  Textarea,
} from "@/components/ui";

interface Topic {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface Module {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  sortOrder: number;
  topics: Topic[];
}

interface Programme {
  id: string;
  slug: string;
  code: string;
  name: string;
  tag: string;
  summary: string;
  body: string | null;
  durationWeeks: number | null;
  level: string | null;
  points: string[];
  objectives: string[];
  targetAudience: string[];
  eligibility: string[];
  prerequisites: string[];
  tools: string[];
  exercises: string[];
  projects: string[];
  learningOutcomes: string[];
  careerPathways: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  status: string;
  sortOrder: number;
  publishedAt: string | null;
  updatedAt: string;
  imageId: string | null;
  image: { id: string; url: string; alt: string | null } | null;
  gallery: Array<{ mediaId: string; sortOrder: number; media: MediaAsset }>;
  modules: Module[];
}

/** The subset this editor writes back. */
type Editable = Pick<
  Programme,
  | "name"
  | "code"
  | "slug"
  | "tag"
  | "summary"
  | "body"
  | "durationWeeks"
  | "level"
  | "points"
  | "objectives"
  | "targetAudience"
  | "eligibility"
  | "prerequisites"
  | "tools"
  | "exercises"
  | "projects"
  | "learningOutcomes"
  | "careerPathways"
  | "seoTitle"
  | "seoDescription"
  | "sortOrder"
  | "imageId"
>;

const EDITABLE_KEYS: Array<keyof Editable> = [
  "name", "code", "slug", "tag", "summary", "body", "durationWeeks", "level",
  "points", "objectives", "targetAudience", "eligibility", "prerequisites",
  "tools", "exercises", "projects", "learningOutcomes", "careerPathways",
  "seoTitle", "seoDescription", "sortOrder", "imageId",
];

export function ProgrammeEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const query = useQuery<{ item: Programme }>(`/programmes/${id}`);
  const programme = query.data?.item ?? null;

  const source = useMemo<Editable | null>(() => {
    if (!programme) return null;
    return Object.fromEntries(EDITABLE_KEYS.map((k) => [k, programme[k]])) as Editable;
  }, [programme]);

  const draft = useDraft<Editable>(source);
  const [tab, setTab] = useState("detail");

  const canWrite = can("programme:write");
  const canPublish = can("programme:publish");

  const save = async () => {
    if (!draft.value) return;
    const result = await run("save", () =>
      api.patch<{ item: Programme }>(`/programmes/${id}`, draft.value)
    );
    if (result.ok) {
      notify("Programme saved");
      draft.commit();
      await query.reload();
    } else {
      notify(result.error, "error", Object.values(result.fields)[0]);
    }
  };

  const transition = async (action: "publish" | "unpublish" | "archive" | "unarchive") => {
    if (draft.dirty) {
      notify("Save your changes first.", "warning");
      return;
    }
    const result = await run("status", () => api.post(`/programmes/${id}/${action}`));
    if (result.ok) {
      notify(
        action === "publish"
          ? "Published. It is live on the website."
          : action === "unarchive"
            ? "Restored to draft"
            : `${action === "archive" ? "Archived" : "Unpublished"}. It is no longer on the website.`
      );
      await query.reload();
    } else {
      notify(result.error, "error");
    }
  };

  if (query.initial) return <Loading label="Loading the programme" />;

  if (query.error || !programme || !draft.value) {
    return (
      <>
        <PageHeader
          title="Programme"
          breadcrumbs={[{ label: "Website" }, { label: "Programmes", to: "/programmes" }]}
        />
        <ErrorNote message={query.error ?? "That programme does not exist."} onRetry={query.reload} />
        <div className="mt-4">
          <Button icon="chevronLeft" onClick={() => navigate("/programmes")}>
            Back to programmes
          </Button>
        </div>
      </>
    );
  }

  const d = draft.value;
  const set = (patch: Partial<Editable>) => draft.update(patch);

  return (
    <>
      <PageHeader
        title={programme.name}
        description={`Code ${programme.code} · /programmes/${programme.slug}`}
        breadcrumbs={[
          { label: "Website" },
          { label: "Programmes", to: "/programmes" },
          { label: programme.name },
        ]}
        meta={<StatusBadge status={programme.status} />}
        actions={
          <>
            <Button icon="history" onClick={() => setTab("history")}>
              History
            </Button>
            {canPublish && programme.status !== "ARCHIVED" && (
              <Button
                variant={programme.status === "PUBLISHED" ? "secondary" : "primary"}
                icon="globe"
                loading={isBusy("status")}
                disabled={draft.dirty}
                title={draft.dirty ? "Save your changes before publishing" : undefined}
                onClick={() =>
                  void transition(programme.status === "PUBLISHED" ? "unpublish" : "publish")
                }
              >
                {programme.status === "PUBLISHED" ? "Unpublish" : "Publish"}
              </Button>
            )}
            {canPublish && programme.status === "ARCHIVED" && (
              <Button variant="primary" onClick={() => void transition("unarchive")}>
                Restore to draft
              </Button>
            )}
          </>
        }
      />

      {programme.status === "PUBLISHED" && (
        <div className="mb-4">
          <Notice tone="positive" icon="globe">
            This programme is live. Saved changes appear on the website within a minute, so edit with
            that in mind.
          </Notice>
        </div>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "detail", label: "Detail", icon: "programme" },
          { id: "curriculum", label: "Curriculum", icon: "curriculum", count: programme.modules.length },
          { id: "outcomes", label: "Outcomes", icon: "stat" },
          { id: "media", label: "Images", icon: "media", count: programme.gallery.length },
          { id: "seo", label: "SEO", icon: "search" },
          { id: "history", label: "History", icon: "history" },
        ]}
      />

      {tab === "detail" && (
        <div className="space-y-4">
          <Card>
            <SectionHeading title="Identity" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" required value={d.name} disabled={!canWrite} onChange={(e) => set({ name: e.target.value })} />
              <Input label="Category" required value={d.tag} disabled={!canWrite} onChange={(e) => set({ tag: e.target.value })} />
              <Input label="Code" required value={d.code} disabled={!canWrite} onChange={(e) => set({ code: e.target.value })} />
              <Input
                label="Slug"
                required
                hint="Changing this changes the public URL and breaks existing links."
                value={d.slug}
                disabled={!canWrite}
                onChange={(e) =>
                  set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })
                }
              />
              <Select
                label="Level"
                value={d.level ?? ""}
                disabled={!canWrite}
                onChange={(e) => set({ level: e.target.value || null })}
              >
                <option value="">Not stated</option>
                <option value="Entry">Entry</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </Select>
              <Input
                label="Duration in weeks"
                type="number"
                hint="Leave blank unless the duration is actually fixed."
                value={d.durationWeeks === null ? "" : String(d.durationWeeks)}
                disabled={!canWrite}
                onChange={(e) =>
                  set({ durationWeeks: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
              <Input
                label="Display order"
                type="number"
                value={String(d.sortOrder)}
                disabled={!canWrite}
                onChange={(e) => set({ sortOrder: Number(e.target.value) || 0 })}
              />
            </div>
          </Card>

          <Card>
            <SectionHeading title="Description" />
            <div className="space-y-4">
              <Textarea
                label="Summary"
                required
                rows={3}
                hint="Shown on the programme card."
                aside={`${d.summary.length}/600`}
                value={d.summary}
                disabled={!canWrite}
                onChange={(e) => set({ summary: e.target.value })}
              />
              <Textarea
                label="Full description"
                rows={8}
                hint="Shown on the programme page. Blank lines separate paragraphs."
                value={d.body ?? ""}
                disabled={!canWrite}
                onChange={(e) => set({ body: e.target.value || null })}
              />
              <StringList
                label="Card bullet points"
                hint="Up to five read best on the card. One per line."
                value={d.points}
                onChange={(points) => set({ points })}
              />
            </div>
          </Card>

          <Card>
            <SectionHeading
              title="Who it is for"
              description="Stated as requirements and expectations, not as guarantees."
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <StringList label="Target audience" value={d.targetAudience} onChange={(v) => set({ targetAudience: v })} />
              <StringList label="Eligibility requirements" value={d.eligibility} onChange={(v) => set({ eligibility: v })} />
              <StringList label="Recommended prerequisites" value={d.prerequisites} onChange={(v) => set({ prerequisites: v })} />
              <StringList label="Programme objectives" value={d.objectives} onChange={(v) => set({ objectives: v })} />
            </div>
          </Card>
        </div>
      )}

      {tab === "outcomes" && (
        <div className="space-y-4">
          <Notice tone="caution" icon="info">
            These describe capability developed through the programme. They are not employment or
            placement outcomes, and must not be written as if they were.
          </Notice>
          <Card>
            <SectionHeading title="Practical work" />
            <div className="grid gap-4 lg:grid-cols-2">
              <StringList label="Tools and technologies" value={d.tools} onChange={(v) => set({ tools: v })} rows={6} />
              <StringList label="Practical exercises" value={d.exercises} onChange={(v) => set({ exercises: v })} rows={6} />
              <StringList label="Projects" value={d.projects} onChange={(v) => set({ projects: v })} rows={6} />
              <StringList label="Learning outcomes" value={d.learningOutcomes} onChange={(v) => set({ learningOutcomes: v })} rows={6} />
            </div>
          </Card>
          <Card>
            <SectionHeading
              title="Career pathways"
              description="Roles the programme is designed to prepare participants for — directions of travel, not offers."
            />
            <StringList label="Pathways" value={d.careerPathways} onChange={(v) => set({ careerPathways: v })} />
          </Card>
        </div>
      )}

      {tab === "curriculum" && (
        <CurriculumBuilder
          programmeId={id}
          modules={programme.modules}
          canWrite={canWrite}
          canPublish={canPublish}
          onChanged={query.reload}
        />
      )}

      {tab === "media" && (
        <div className="space-y-4">
          <Card>
            <SectionHeading title="Cover image" description="Shown on the programme card and at the top of its page." />
            <MediaField
              label="Cover"
              mediaId={d.imageId}
              disabled={!canWrite}
              onChange={(imageId) => set({ imageId })}
              kind="image"
            />
          </Card>
          <Gallery
            programmeId={id}
            gallery={programme.gallery}
            canWrite={canWrite}
            onChanged={query.reload}
          />
        </div>
      )}


      {tab === "seo" && (
        <Card className="max-w-2xl">
          <SectionHeading title="Search listing" description="How this programme appears in search results and when shared." />
          <div className="space-y-4">
            <Input
              label="SEO title"
              value={d.seoTitle ?? ""}
              disabled={!canWrite}
              aside={`${(d.seoTitle ?? "").length}/60`}
              onChange={(e) => set({ seoTitle: e.target.value || null })}
            />
            <Textarea
              label="SEO description"
              rows={3}
              value={d.seoDescription ?? ""}
              disabled={!canWrite}
              aside={`${(d.seoDescription ?? "").length}/160`}
              onChange={(e) => set({ seoDescription: e.target.value || null })}
            />
            <div className="panel-sunken p-3">
              <p className="label mb-2">Preview</p>
              <p className="truncate text-sm text-accent-ice">
                {d.seoTitle || `${d.name} | POLARSIGHT`}
              </p>
              <p className="mono mt-0.5 text-positive">polarsight.in/programmes/{d.slug}</p>
              <p className="mt-1 text-xs leading-relaxed text-faint clamp-2">
                {d.seoDescription || d.summary}
              </p>
            </div>
          </div>
        </Card>
      )}

      {tab === "history" && <ProgrammeHistory programmeId={id} onRestored={query.reload} />}

      <SaveBar
        dirty={draft.dirty && canWrite}
        saving={isBusy("save")}
        onSave={() => void save()}
        onDiscard={draft.reset}
        message={
          programme.status === "PUBLISHED"
            ? "Unsaved changes. Saving updates the live website."
            : "Unsaved changes."
        }
      />
    </>
  );
}

/* ── Curriculum builder ───────────────────────────────────── */

function CurriculumBuilder({
  programmeId,
  modules,
  canWrite,
  canPublish,
  onChanged,
}: {
  programmeId: string;
  modules: Module[];
  canWrite: boolean;
  canPublish: boolean;
  onChanged(): Promise<void>;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [open, setOpen] = useState<string | null>(modules[0]?.id ?? null);
  const [editingModule, setEditingModule] = useState<Module | "new" | null>(null);
  const [editingTopic, setEditingTopic] = useState<{ module: Module; topic: Topic | "new" } | null>(
    null
  );
  const [deletingModule, setDeletingModule] = useState<Module | null>(null);

  const base = `/programmes/${programmeId}/modules`;

  const reorder = async (from: number, to: number) => {
    if (to < 0 || to >= modules.length) return;
    const next = [...modules];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);

    const result = await run("reorder", () =>
      api.post(`${base}/reorder`, {
        items: next.map((m, i) => ({ id: m.id, sortOrder: i })),
      })
    );
    if (result.ok) await onChanged();
    else notify(result.error, "error");
  };

  const toggle = async (m: Module) => {
    const action = m.status === "PUBLISHED" ? "unpublish" : "publish";
    const result = await run(m.id, () => api.post(`${base}/${m.id}/${action}`));
    if (result.ok) {
      notify(
        action === "publish"
          ? `"${m.title}" is now in the public curriculum`
          : `"${m.title}" hidden from the public curriculum`
      );
      await onChanged();
    } else {
      notify(result.error, "error");
    }
  };

  const removeModule = async () => {
    if (!deletingModule) return;
    const result = await run("delete", () => api.del(`${base}/${deletingModule.id}`));
    if (result.ok) {
      notify("Module deleted");
      setDeletingModule(null);
      await onChanged();
    } else {
      notify(result.error, "error");
    }
  };

  const removeTopic = async (m: Module, t: Topic) => {
    const result = await run(t.id, () => api.del(`${base}/${m.id}/topics/${t.id}`));
    if (result.ok) {
      notify("Topic removed");
      await onChanged();
    } else {
      notify(result.error, "error");
    }
  };

  const published = modules.filter((m) => m.status === "PUBLISHED").length;

  return (
    <>
      <Card padded={false}>
        <div className="px-5 pt-5">
          <SectionHeading
            title="Curriculum"
            icon="curriculum"
            description={`${modules.length} module${modules.length === 1 ? "" : "s"}, ${published} visible on the website. An unpublished module is hidden from visitors.`}
            actions={
              canWrite ? (
                <Button size="sm" variant="primary" icon="plus" onClick={() => setEditingModule("new")}>
                  Add module
                </Button>
              ) : undefined
            }
          />
        </div>

        {modules.length === 0 ? (
          <EmptyState
            icon="curriculum"
            title="No modules yet"
            hint="Add modules, then topics within each one. Publish a module to make it visible on the website."
            action={
              canWrite ? (
                <Button variant="primary" icon="plus" onClick={() => setEditingModule("new")}>
                  Add the first module
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {modules.map((m, i) => {
              const expanded = open === m.id;
              return (
                <li key={m.id} className={isBusy(m.id) ? "row-busy" : ""}>
                  <div className="flex items-start gap-2 px-5 py-3">
                    <span className="tabular mt-1 w-6 shrink-0 text-xs text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : m.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <Icon
                        name={expanded ? "chevronDown" : "chevronRight"}
                        size={14}
                        className="mt-1 shrink-0 text-faint"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{m.title}</span>
                          <StatusBadge status={m.status} />
                          <span className="text-[0.6875rem] text-faint">
                            {m.topics.length} topic{m.topics.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        {m.summary && (
                          <span className="mt-1 block max-w-2xl text-xs leading-relaxed text-faint clamp-2">
                            {m.summary}
                          </span>
                        )}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      {canWrite && (
                        <>
                          <IconButton
                            icon="chevronUp"
                            label="Move up"
                            size="xs"
                            disabled={i === 0}
                            onClick={() => void reorder(i, i - 1)}
                          />
                          <IconButton
                            icon="chevronDown"
                            label="Move down"
                            size="xs"
                            disabled={i === modules.length - 1}
                            onClick={() => void reorder(i, i + 1)}
                          />
                        </>
                      )}
                      {canPublish && (
                        <Button size="xs" onClick={() => void toggle(m)}>
                          {m.status === "PUBLISHED" ? "Hide" : "Publish"}
                        </Button>
                      )}
                      {canWrite && (
                        <>
                          <IconButton icon="edit" label="Edit module" size="xs" onClick={() => setEditingModule(m)} />
                          <IconButton
                            icon="trash"
                            label="Delete module"
                            size="xs"
                            className="hover:text-danger"
                            onClick={() => setDeletingModule(m)}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-line-soft bg-sunken/40 px-5 py-4">
                      {m.topics.length === 0 ? (
                        <p className="text-xs text-faint">No topics in this module yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {m.topics.map((t, ti) => (
                            <li
                              key={t.id}
                              className={`flex items-start gap-2 ${isBusy(t.id) ? "row-busy" : ""}`}
                            >
                              <span className="tabular mt-0.5 w-8 shrink-0 text-[0.6875rem] text-faint">
                                {i + 1}.{ti + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm">{t.title}</p>
                                {t.description && (
                                  <p className="mt-0.5 text-xs leading-relaxed text-faint">
                                    {t.description}
                                  </p>
                                )}
                              </div>
                              {canWrite && (
                                <div className="flex shrink-0 gap-0.5">
                                  <IconButton
                                    icon="edit"
                                    label="Edit topic"
                                    size="xs"
                                    onClick={() => setEditingTopic({ module: m, topic: t })}
                                  />
                                  <IconButton
                                    icon="trash"
                                    label="Remove topic"
                                    size="xs"
                                    className="hover:text-danger"
                                    onClick={() => void removeTopic(m, t)}
                                  />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {canWrite && (
                        <Button
                          size="sm"
                          icon="plus"
                          className="mt-3"
                          onClick={() => setEditingTopic({ module: m, topic: "new" })}
                        >
                          Add topic
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editingModule && (
        <ModuleForm
          programmeId={programmeId}
          module={editingModule === "new" ? null : editingModule}
          onClose={() => setEditingModule(null)}
          onSaved={async () => {
            setEditingModule(null);
            await onChanged();
          }}
        />
      )}

      {editingTopic && (
        <TopicForm
          programmeId={programmeId}
          moduleId={editingTopic.module.id}
          topic={editingTopic.topic === "new" ? null : editingTopic.topic}
          onClose={() => setEditingTopic(null)}
          onSaved={async () => {
            setEditingTopic(null);
            await onChanged();
          }}
        />
      )}

      <Confirm
        open={deletingModule !== null}
        title="Delete this module?"
        message={`"${deletingModule?.title}" will be removed from the curriculum.`}
        warning={
          (deletingModule?.topics.length ?? 0) > 0
            ? `Its ${deletingModule!.topics.length} topic(s) are deleted with it. This cannot be undone.`
            : "This cannot be undone."
        }
        confirmLabel="Delete module"
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void removeModule()}
        onCancel={() => setDeletingModule(null)}
      />
    </>
  );
}

function ModuleForm({
  programmeId,
  module,
  onClose,
  onSaved,
}: {
  programmeId: string;
  module: Module | null;
  onClose(): void;
  onSaved(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [title, setTitle] = useState(module?.title ?? "");
  const [summary, setSummary] = useState(module?.summary ?? "");
  const [error, setError] = useState<string | null>(null);

  const base = `/programmes/${programmeId}/modules`;

  const submit = async () => {
    setError(null);
    const payload = { title, summary: summary || null };
    const result = await run("save", () =>
      module ? api.patch(`${base}/${module.id}`, payload) : api.post(base, payload)
    );
    if (result.ok) {
      notify(module ? "Module updated" : "Module added as a draft");
      onSaved();
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal
      open
      title={module ? "Edit module" : "Add module"}
      description={module ? undefined : "Added unpublished, so it stays off the website until you publish it."}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={isBusy("save")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            loading={isBusy("save")}
            disabled={!title.trim()}
            onClick={() => void submit()}
          >
            {module ? "Save changes" : "Add module"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Input
          label="Module title"
          required
          placeholder="SIEM Fundamentals"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label="Summary"
          rows={3}
          hint="What this module covers, in a sentence or two."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function TopicForm({
  programmeId,
  moduleId,
  topic,
  onClose,
  onSaved,
}: {
  programmeId: string;
  moduleId: string;
  topic: Topic | null;
  onClose(): void;
  onSaved(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [title, setTitle] = useState(topic?.title ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const base = `/programmes/${programmeId}/modules/${moduleId}/topics`;

  const submit = async () => {
    setError(null);
    const payload = { title, description: description || null };
    const result = await run("save", () =>
      topic ? api.patch(`${base}/${topic.id}`, payload) : api.post(base, payload)
    );
    if (result.ok) {
      notify(topic ? "Topic updated" : "Topic added");
      onSaved();
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal
      open
      title={topic ? "Edit topic" : "Add topic"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={isBusy("save")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            loading={isBusy("save")}
            disabled={!title.trim()}
            onClick={() => void submit()}
          >
            {topic ? "Save changes" : "Add topic"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Input
          label="Topic title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* ── Gallery ──────────────────────────────────────────────── */

function Gallery({
  programmeId,
  gallery,
  canWrite,
  onChanged,
}: {
  programmeId: string;
  gallery: Programme["gallery"];
  canWrite: boolean;
  onChanged(): Promise<void>;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [picking, setPicking] = useState(false);

  const save = async (mediaIds: string[]) => {
    const result = await run("gallery", () =>
      api.put(`/programmes/${programmeId}/gallery`, { mediaIds })
    );
    if (result.ok) {
      notify("Gallery updated");
      await onChanged();
    } else {
      notify(result.error, "error");
    }
  };

  const ids = gallery.map((g) => g.mediaId);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    void save(next);
  };

  return (
    <>
      <Card>
        <SectionHeading
          title="Additional images"
          description="Shown in order on the programme page."
          actions={
            canWrite ? (
              <Button size="sm" icon="plus" loading={isBusy("gallery")} onClick={() => setPicking(true)}>
                Add image
              </Button>
            ) : undefined
          }
        />

        {gallery.length === 0 ? (
          <p className="text-sm text-faint">No additional images.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g, i) => (
              <div key={g.mediaId} className="panel-sunken overflow-hidden">
                <img src={g.media.url} alt={g.media.alt ?? ""} className="aspect-[4/3] w-full object-cover" />
                <div className="flex items-center justify-between gap-1 p-2">
                  <span className="tabular text-[0.625rem] text-faint">#{i + 1}</span>
                  {canWrite && (
                    <div className="flex gap-0.5">
                      <IconButton
                        icon="chevronLeft"
                        label="Move earlier"
                        size="xs"
                        disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                      />
                      <IconButton
                        icon="chevronRight"
                        label="Move later"
                        size="xs"
                        disabled={i === gallery.length - 1}
                        onClick={() => move(i, i + 1)}
                      />
                      <IconButton
                        icon="trash"
                        label="Remove"
                        size="xs"
                        className="hover:text-danger"
                        onClick={() => void save(ids.filter((x) => x !== g.mediaId))}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <MediaPickerDialog
        open={picking}
        kind="image"
        onClose={() => setPicking(false)}
        onPick={(asset) => {
          setPicking(false);
          if (!ids.includes(asset.id)) void save([...ids, asset.id]);
          else notify("That image is already in the gallery", "info");
        }}
      />
    </>
  );
}

/* ── History ──────────────────────────────────────────────── */

function ProgrammeHistory({
  programmeId,
  onRestored,
}: {
  programmeId: string;
  onRestored(): Promise<void>;
}) {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const { data, error, initial, reload } = useQuery<{
    items: Array<{
      id: string;
      version: number;
      label: string | null;
      createdAt: string;
      actor: { name: string } | null;
    }>;
  }>(`/programmes/${programmeId}/versions`);
  const [confirming, setConfirming] = useState<number | null>(null);

  const snapshot = async () => {
    const result = await run("snapshot", () =>
      api.post(`/programmes/${programmeId}/snapshot`, { label: "Manual snapshot" })
    );
    if (result.ok) {
      notify("Snapshot recorded");
      await reload();
    } else {
      notify(result.error, "error");
    }
  };

  const restore = async () => {
    if (confirming === null) return;
    const result = await run("restore", () =>
      api.post<{ note: string }>(`/programmes/${programmeId}/restore`, { version: confirming })
    );
    setConfirming(null);
    if (result.ok) {
      notify(`Version ${confirming} restored`, "info", result.value.note);
      await onRestored();
    } else {
      notify(result.error, "error");
    }
  };

  const versions = data?.items ?? [];

  return (
    <>
      <Card padded={false}>
        <div className="px-5 pt-5">
          <SectionHeading
            title="Version history"
            icon="history"
            description="A snapshot is recorded on every publish, and on demand."
            actions={
              can("programme:write") ? (
                <Button size="sm" icon="plus" loading={isBusy("snapshot")} onClick={() => void snapshot()}>
                  Take a snapshot
                </Button>
              ) : undefined
            }
          />
        </div>

        {error && (
          <div className="px-5 pb-5">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        )}

        {initial ? (
          <Loading />
        ) : versions.length === 0 ? (
          <EmptyState
            icon="history"
            title="No versions yet"
            hint="Publish the programme, or take a snapshot, to record one."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
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
                  <Button size="sm" icon="history" onClick={() => setConfirming(v.version)}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Confirm
        open={confirming !== null}
        title={`Restore version ${confirming}?`}
        message="The programme's own fields are replaced with that version's values."
        warning="The programme is forced back to draft and taken off the website, so you can review the restore before publishing it. Curriculum modules and topics are not changed — they have their own history."
        confirmLabel="Restore"
        busy={isBusy("restore")}
        onConfirm={() => void restore()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

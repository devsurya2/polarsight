/**
 * One enquiry.
 *
 * Shows the whole administrative history: notes alongside status
 * changes and assignments, drawn from the append-only audit trail, so
 * the record of how an enquiry was handled cannot be rewritten from
 * inside the portal.
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { Icon, type IconName } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  Notice,
  PageHeader,
  SectionHeading,
  Select,
  StatusBadge,
  Textarea,
  humanise,
} from "@/components/ui";
import { ENQUIRY_STATUSES } from "./Enquiries";

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; email: string } | null;
}

interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  designation: string | null;
  subject: string | null;
  programme: string | null;
  message: string;
  status: string;
  followUpAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { id: string; name: string; email: string } | null;
  notes: Note[];
}

type HistoryEvent =
  | {
      kind: "note";
      id: string;
      at: string;
      actor: { id: string; name: string } | null;
      body: string;
    }
  | {
      kind: "action";
      id: string;
      at: string;
      actor: { id: string; name: string } | null;
      action: string;
      before: unknown;
      after: unknown;
    };

export function EnquiryDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const query = useQuery<{ item: Enquiry }>(`/enquiries/${id}`);
  const history = useQuery<{ items: HistoryEvent[] }>(`/enquiries/${id}/history`);
  const enquiry = query.data?.item ?? null;

  const admins = useQuery<{ items: Array<{ id: string; name: string }> }>(
    can("admin:read") ? "/admin-users?perPage=100&active=true" : null
  );

  const [statusDialog, setStatusDialog] = useState(false);
  const [noteDialog, setNoteDialog] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canWrite = can("enquiry:write");

  const refresh = async () => {
    await Promise.all([query.reload(), history.reload()]);
  };

  const assign = async (assignedToId: string) => {
    const result = await run("assign", () =>
      api.patch(`/enquiries/${id}/assign`, { assignedToId: assignedToId || null })
    );
    if (result.ok) {
      notify(assignedToId ? "Assigned" : "Assignment cleared");
      await refresh();
    } else {
      notify(result.error, "error");
    }
  };

  const setFollowUpDate = async (value: string) => {
    const result = await run("followUp", () =>
      api.patch(`/enquiries/${id}/follow-up`, {
        followUpAt: value ? new Date(`${value}T09:00:00`).toISOString() : null,
      })
    );
    if (result.ok) {
      notify(value ? `Follow-up set for ${formatDate(value)}` : "Follow-up cleared");
      setFollowUp("");
      await refresh();
    } else {
      notify(result.error, "error");
    }
  };

  const archive = async () => {
    const result = await run("archive", () => api.post(`/enquiries/${id}/archive`));
    if (result.ok) {
      notify(enquiry?.archivedAt ? "Returned to the queue" : "Archived");
      await refresh();
    } else {
      notify(result.error, "error");
    }
  };

  const markSpam = async () => {
    const result = await run("spam", () =>
      api.patch(`/enquiries/${id}/status`, { status: "SPAM", note: "Marked as spam." })
    );
    if (result.ok) {
      notify("Marked as spam");
      await refresh();
    } else {
      notify(result.error, "error");
    }
  };

  const remove = async () => {
    const result = await run("delete", () => api.del(`/enquiries/${id}`));
    if (result.ok) {
      notify("Enquiry deleted");
      navigate("/enquiries");
    } else {
      notify(result.error, "error");
      setDeleting(false);
    }
  };

  if (query.initial) return <Loading label="Loading the enquiry" />;

  if (query.error || !enquiry) {
    return (
      <>
        <PageHeader
          title="Enquiry"
          breadcrumbs={[{ label: "Enquiries", to: "/enquiries" }, { label: "Not found" }]}
        />
        <ErrorNote message={query.error ?? "That enquiry does not exist."} onRetry={query.reload} />
        <div className="mt-4">
          <Button icon="chevronLeft" onClick={() => navigate("/enquiries")}>
            Back to enquiries
          </Button>
        </div>
      </>
    );
  }

  const due = enquiry.followUpAt && new Date(enquiry.followUpAt).getTime() <= Date.now();

  return (
    <>
      <PageHeader
        title={enquiry.name}
        description={`${enquiry.subject ?? "General enquiry"} · received ${relativeTime(enquiry.createdAt)}`}
        breadcrumbs={[
          { label: "Enquiries", to: "/enquiries" },
          { label: enquiry.name },
        ]}
        meta={
          <>
            <StatusBadge status={enquiry.status} />
            {enquiry.archivedAt && (
              <Badge tone="neutral" icon="archive">
                Archived
              </Badge>
            )}
            {due && (
              <Badge tone="caution" icon="clock">
                Follow-up due
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <a
              href={`mailto:${enquiry.email}?subject=${encodeURIComponent(
                `Re: ${enquiry.subject ?? "Your enquiry"} — PolarSight`
              )}`}
              className="inline-flex h-10 items-center gap-2 rounded-inner border border-line bg-raised px-4 text-sm font-medium transition-colors hover:border-line-strong"
            >
              <Icon name="mail" size={16} />
              Reply by email
            </a>
            {canWrite && (
              <Button icon="note" onClick={() => setNoteDialog(true)}>
                Add note
              </Button>
            )}
            {canWrite && (
              <Button variant="primary" icon="refresh" onClick={() => setStatusDialog(true)}>
                Change status
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <SectionHeading title="Enquiry" icon="inbox" />
            <DescriptionList
              items={[
                { label: "Name", value: enquiry.name },
                {
                  label: "Email",
                  value: (
                    <a href={`mailto:${enquiry.email}`} className="text-accent-ice underline-offset-2 hover:underline">
                      {enquiry.email}
                    </a>
                  ),
                },
                {
                  label: "Phone",
                  value: enquiry.phone ? (
                    <a
                      href={`tel:${enquiry.phone.replace(/[^\d+]/g, "")}`}
                      className="text-accent-ice underline-offset-2 hover:underline"
                    >
                      {enquiry.phone}
                    </a>
                  ) : null,
                },
                { label: "Organisation", value: enquiry.organisation },
                { label: "Designation", value: enquiry.designation },
                { label: "Enquiry type", value: enquiry.subject },
                { label: "Programme of interest", value: enquiry.programme },
                { label: "Received", value: formatDateTime(enquiry.createdAt) },
              ]}
            />
          </Card>

          <Card>
            <SectionHeading title="Message" icon="mail" />
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{enquiry.message}</p>
          </Card>

          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading
                title="Administrative history"
                icon="history"
                description="Notes, status changes and assignments. Status changes come from the append-only audit trail."
                actions={
                  canWrite ? (
                    <Button size="sm" icon="plus" onClick={() => setNoteDialog(true)}>
                      Add note
                    </Button>
                  ) : undefined
                }
              />
            </div>

            {history.initial ? (
              <Loading label="Loading the history" />
            ) : (history.data?.items ?? []).length === 0 ? (
              <EmptyState icon="history" title="Nothing recorded yet" />
            ) : (
              <ol className="px-5 pb-5">
                {(history.data?.items ?? []).map((ev, i, all) => (
                  <li key={ev.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < all.length - 1 && (
                      <span className="absolute left-[0.6875rem] top-7 h-full w-px bg-line" aria-hidden />
                    )}
                    <span
                      className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        ev.kind === "note"
                          ? "border-line bg-raised text-faint"
                          : "border-accent/40 bg-accent-soft text-accent-ice"
                      }`}
                    >
                      <Icon name={ev.kind === "note" ? "note" : actionIcon(ev.action)} size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      {ev.kind === "note" ? (
                        <>
                          <p className="text-xs text-faint">
                            {ev.actor?.name ?? "Unknown"} added a note ·{" "}
                            <span title={formatDateTime(ev.at)}>{relativeTime(ev.at)}</span>
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-body">
                            {ev.body}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm">{describe(ev)}</p>
                          <p className="mt-0.5 text-xs text-faint">
                            {ev.actor?.name ?? "System"} ·{" "}
                            <span title={formatDateTime(ev.at)}>{relativeTime(ev.at)}</span>
                          </p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <SectionHeading title="Assignment" icon="shield" />
            {admins.data ? (
              <Select
                label="Assigned administrator"
                value={enquiry.assignedTo?.id ?? ""}
                disabled={!canWrite || isBusy("assign")}
                onChange={(e) => void assign(e.target.value)}
              >
                <option value="">Unassigned</option>
                {admins.data.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm">
                {enquiry.assignedTo?.name ?? <span className="text-faint">Unassigned</span>}
              </p>
            )}
          </Card>

          <Card>
            <SectionHeading title="Follow-up" icon="clock" />
            {enquiry.followUpAt ? (
              <div className="space-y-3">
                <p className={`text-sm ${due ? "text-caution" : ""}`}>
                  {due ? "Due" : "Scheduled for"} {formatDate(enquiry.followUpAt)}
                </p>
                {canWrite && (
                  <Button
                    size="sm"
                    icon="close"
                    loading={isBusy("followUp")}
                    onClick={() => void setFollowUpDate("")}
                  >
                    Clear follow-up
                  </Button>
                )}
              </div>
            ) : canWrite ? (
              <div className="space-y-2">
                <Input
                  label="Follow up on"
                  type="date"
                  value={followUp}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  icon="check"
                  disabled={!followUp}
                  loading={isBusy("followUp")}
                  onClick={() => void setFollowUpDate(followUp)}
                >
                  Set follow-up
                </Button>
              </div>
            ) : (
              <p className="text-sm text-faint">No follow-up scheduled.</p>
            )}
          </Card>

          {canWrite && (
            <Card>
              <SectionHeading title="Manage" icon="settings" />
              <div className="space-y-2">
                {enquiry.status !== "SPAM" && (
                  <Button
                    className="w-full"
                    icon="alert"
                    loading={isBusy("spam")}
                    onClick={() => void markSpam()}
                  >
                    Mark as spam
                  </Button>
                )}
                <Button
                  className="w-full"
                  icon="archive"
                  loading={isBusy("archive")}
                  onClick={() => void archive()}
                >
                  {enquiry.archivedAt ? "Return to queue" : "Archive"}
                </Button>
                {can("enquiry:delete") && (
                  <Button className="w-full" variant="danger" icon="trash" onClick={() => setDeleting(true)}>
                    Delete permanently
                  </Button>
                )}
              </div>
              <div className="mt-3">
                <Notice tone="info">
                  Archiving keeps the record and takes it out of the working queue. Deleting is for
                  genuine erasure requests.
                </Notice>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {statusDialog && (
        <StatusDialog
          enquiry={enquiry}
          onClose={() => setStatusDialog(false)}
          onDone={async () => {
            setStatusDialog(false);
            await refresh();
          }}
        />
      )}

      {noteDialog && (
        <NoteDialog
          enquiryId={id}
          onClose={() => setNoteDialog(false)}
          onDone={async () => {
            setNoteDialog(false);
            await refresh();
          }}
        />
      )}

      <Confirm
        open={deleting}
        title="Delete this enquiry permanently?"
        message={`${enquiry.name}'s enquiry and all notes on it will be removed.`}
        warning="This cannot be undone. Archiving keeps the record instead."
        confirmLabel="Delete permanently"
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */

function describe(ev: Extract<HistoryEvent, { kind: "action" }>): string {
  const [, verb = ev.action] = ev.action.split(".");
  const after = ev.after as Record<string, unknown> | null;
  const before = ev.before as Record<string, unknown> | null;

  switch (verb) {
    case "received":
      return "Enquiry received from the website";
    case "status":
      return `Status changed${before?.status ? ` from ${humanise(String(before.status))}` : ""} to ${
        after?.status ? humanise(String(after.status)) : "a new status"
      }`;
    case "assign":
      return after?.assignedToId ? "Assigned to an administrator" : "Assignment cleared";
    case "follow_up_set":
      return after?.followUpAt
        ? `Follow-up set for ${formatDate(String(after.followUpAt))}`
        : "Follow-up cleared";
    case "note_added":
      return "Note added";
    case "archive":
      return "Archived";
    case "unarchive":
      return "Returned to the queue";
    case "export":
      return "Included in an export";
    default:
      return humanise(verb);
  }
}

function actionIcon(action: string): IconName {
  const [, verb = ""] = action.split(".");
  if (verb === "status") return "refresh";
  if (verb === "assign") return "users";
  if (verb.includes("follow")) return "clock";
  if (verb.includes("archive")) return "archive";
  if (verb === "received") return "mail";
  if (verb === "export") return "download";
  return "edit";
}

/* ── Dialogs ──────────────────────────────────────────────── */

function StatusDialog({
  enquiry,
  onClose,
  onDone,
}: {
  enquiry: Enquiry;
  onClose(): void;
  onDone(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const result = await run("save", () =>
      api.patch(`/enquiries/${enquiry.id}/status`, { status, note: note || undefined })
    );
    if (result.ok) {
      notify(`Status changed to ${humanise(status)}`);
      onDone();
    } else {
      setError(result.error);
    }
  };

  const resolving = ["CONVERTED", "CLOSED", "SPAM"].includes(status);

  return (
    <Modal
      open
      title="Change status"
      description={`Currently ${humanise(enquiry.status).toLowerCase()}.`}
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
            disabled={!status}
            onClick={() => void submit()}
          >
            Change status
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Select label="New status" required value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Select a status…</option>
          {ENQUIRY_STATUSES.filter((s) => s !== enquiry.status).map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>

        {resolving && enquiry.followUpAt && (
          <Notice tone="info">
            Resolving this enquiry clears its pending follow-up date.
          </Notice>
        )}

        <Textarea
          label="Note"
          rows={3}
          hint="Saved as an internal note alongside the change, so the reason stays with it."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function NoteDialog({
  enquiryId,
  onClose,
  onDone,
}: {
  enquiryId: string;
  onClose(): void;
  onDone(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const result = await run("save", () => api.post(`/enquiries/${enquiryId}/notes`, { body }));
    if (result.ok) {
      notify("Note added");
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal
      open
      title="Add an internal note"
      description="Visible to administrators only. Never shown on the website or included in an export."
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
            disabled={!body.trim()}
            onClick={() => void submit()}
          >
            Save note
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Textarea
          label="Note"
          required
          rows={6}
          placeholder="Called the department head; meeting arranged for next week."
          value={body}
          aside={`${body.length} characters`}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/**
 * One trainer application.
 *
 * Everything on this screen is internal. Notes, interview feedback,
 * the assigned recruiter and the status history are never exposed by
 * a public endpoint, and the resume is streamed through an
 * authenticated route that audits each download rather than being
 * served from a guessable URL.
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ChipList,
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
import { APPLICATION_STATUSES } from "./Applications";

interface Note {
  id: string;
  body: string;
  kind: "NOTE" | "INTERVIEW_FEEDBACK" | "DEMO_FEEDBACK";
  createdAt: string;
  author: { id: string; name: string; email: string } | null;
}

interface Event {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  scheduledAt: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

interface Application {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  education: string | null;
  currentOrganisation: string | null;
  experienceYears: number | null;
  experienceSummary: string | null;
  expertise: string[];
  technicalSkills: string[];
  certifications: string[];
  appliedPosition: string;
  employmentPreference: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  additionalInfo: string | null;
  status: string;
  interviewAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  jobOpening: { id: string; title: string; department: string; slug: string } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  resume: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    scanStatus: "QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED" | "SCAN_FAILED" | "SCAN_SKIPPED";
    scanDetail: string | null;
    scannedAt: string | null;
  } | null;
  notes: Note[];
  events: Event[];
}

/** Statuses that offer a candidate-facing email. */
const NOTIFIABLE = new Set(["SHORTLISTED", "INTERVIEW_SCHEDULED", "SELECTED", "REJECTED"]);

const NOTE_KINDS = [
  { value: "NOTE", label: "Internal note" },
  { value: "INTERVIEW_FEEDBACK", label: "Technical interview feedback" },
  { value: "DEMO_FEEDBACK", label: "Demo session feedback" },
];

export function ApplicationDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const query = useQuery<{ item: Application }>(`/applications/${id}`);
  const app = query.data?.item ?? null;

  const admins = useQuery<{ items: Array<{ id: string; name: string }> }>(
    can("admin:read") ? "/admin-users?perPage=100&active=true" : null
  );

  const [statusDialog, setStatusDialog] = useState(false);
  const [noteDialog, setNoteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canWrite = can("application:write");

  const rescanResume = async () => {
    const result = await run("rescan", () =>
      api.post<{ scanStatus: string; scanDetail: string | null }>(`/applications/${id}/resume/rescan`)
    );
    if (result.ok) {
      notify(
        result.value.scanStatus === "CLEAN" ? "Resume scanned clean" : "Scan did not complete",
        result.value.scanStatus === "CLEAN" ? "success" : "info",
        result.value.scanDetail ?? undefined
      );
      await query.reload();
    } else {
      notify("Rescan failed", "error", result.error);
      await query.reload();
    }
  };

  const downloadResume = async () => {
    const result = await run("resume", async () => {
      const res = await fetch(`/api/applications/${id}/resume`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not download that resume");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = app?.resume?.originalName ?? "resume";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    if (result.ok) notify("Resume downloaded", "info", "This download is recorded in the audit log.");
    else notify(result.error, "error");
  };

  const assign = async (assignedToId: string) => {
    const result = await run("assign", () =>
      api.patch(`/applications/${id}/assign`, { assignedToId: assignedToId || null })
    );
    if (result.ok) {
      notify(assignedToId ? "Recruiter assigned" : "Recruiter cleared");
      await query.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const archive = async () => {
    const result = await run("archive", () => api.post(`/applications/${id}/archive`));
    if (result.ok) {
      notify(app?.archivedAt ? "Returned to the active pipeline" : "Archived");
      await query.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const remove = async () => {
    const result = await run("delete", () => api.del(`/applications/${id}`));
    if (result.ok) {
      notify("Application deleted", "info", "The resume was deleted with it.");
      navigate("/applications");
    } else {
      notify(result.error, "error");
      setDeleting(false);
    }
  };

  if (query.initial) return <Loading label="Loading the application" />;

  if (query.error || !app) {
    return (
      <>
        <PageHeader
          title="Application"
          breadcrumbs={[{ label: "Recruitment" }, { label: "Applications", to: "/applications" }]}
        />
        <ErrorNote message={query.error ?? "That application does not exist."} onRetry={query.reload} />
        <div className="mt-4">
          <Button icon="chevronLeft" onClick={() => navigate("/applications")}>
            Back to applications
          </Button>
        </div>
      </>
    );
  }

  const feedback = app.notes.filter((n) => n.kind !== "NOTE");
  const plainNotes = app.notes.filter((n) => n.kind === "NOTE");

  return (
    <>
      <PageHeader
        title={app.fullName}
        description={`Applied for ${app.appliedPosition} · ${relativeTime(app.createdAt)}`}
        breadcrumbs={[
          { label: "Recruitment" },
          { label: "Applications", to: "/applications" },
          { label: app.fullName },
        ]}
        meta={
          <>
            <StatusBadge status={app.status} />
            {app.archivedAt && (
              <Badge tone="neutral" icon="archive">
                Archived
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {app.resume && can("application:read") && (
              <Button icon="download" loading={isBusy("resume")} onClick={() => void downloadResume()}>
                Resume
              </Button>
            )}
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

      <Notice tone="info" icon="lock">
        Everything on this screen is internal. Notes, feedback and status history are never exposed
        on the website, and resume downloads are recorded in the audit log.
      </Notice>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Candidate ─────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <SectionHeading title="Applicant profile" icon="users" />
            <DescriptionList
              items={[
                { label: "Full name", value: app.fullName },
                {
                  label: "Email",
                  value: (
                    <a href={`mailto:${app.email}`} className="text-accent-ice underline-offset-2 hover:underline">
                      {app.email}
                    </a>
                  ),
                },
                { label: "Phone", value: app.phone },
                { label: "Location", value: app.location },
                { label: "Current organisation", value: app.currentOrganisation },
                {
                  label: "Employment preference",
                  value: app.employmentPreference ? humanise(app.employmentPreference) : null,
                },
                { label: "Education", value: app.education },
                {
                  label: "Experience",
                  value:
                    app.experienceYears !== null
                      ? `${app.experienceYears} year${app.experienceYears === 1 ? "" : "s"}`
                      : null,
                },
                {
                  label: "LinkedIn",
                  value: app.linkedinUrl ? <ExternalLink href={app.linkedinUrl} /> : null,
                },
                {
                  label: "Portfolio",
                  value: app.portfolioUrl ? <ExternalLink href={app.portfolioUrl} /> : null,
                },
              ]}
            />
          </Card>

          {app.experienceSummary && (
            <Card>
              <SectionHeading title="Professional experience" icon="briefcase" />
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">
                {app.experienceSummary}
              </p>
            </Card>
          )}

          <Card>
            <SectionHeading title="Skills and certifications" icon="verified" />
            <div className="space-y-4">
              <div>
                <p className="label mb-2">Expertise</p>
                <ChipList items={app.expertise} tone="accent" />
              </div>
              <div>
                <p className="label mb-2">Technical skills</p>
                <ChipList items={app.technicalSkills} />
              </div>
              <div>
                <p className="label mb-2">Certifications</p>
                <ChipList items={app.certifications} tone="positive" />
              </div>
            </div>
          </Card>

          {app.additionalInfo && (
            <Card>
              <SectionHeading title="Additional information" icon="note" />
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">
                {app.additionalInfo}
              </p>
            </Card>
          )}

          {/* ── Evaluation ─────────────────────────────── */}
          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading
                title="Interview and demo feedback"
                icon="note"
                description="Recorded against the stage it belongs to."
                actions={
                  canWrite ? (
                    <Button size="sm" icon="plus" onClick={() => setNoteDialog(true)}>
                      Add
                    </Button>
                  ) : undefined
                }
              />
            </div>
            {feedback.length === 0 ? (
              <EmptyState icon="note" title="No feedback recorded yet" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {feedback.map((n) => (
                  <li key={n.id} className="px-5 py-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={n.kind === "INTERVIEW_FEEDBACK" ? "accent" : "info"}>
                        {humanise(n.kind)}
                      </Badge>
                      <span className="text-xs text-faint" title={formatDateTime(n.createdAt)}>
                        {n.author?.name ?? "Unknown"} · {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading title="Internal notes" icon="note" />
            </div>
            {plainNotes.length === 0 ? (
              <EmptyState icon="note" title="No notes yet" hint="Notes are visible only to administrators." />
            ) : (
              <ul className="divide-y divide-line-soft">
                {plainNotes.map((n) => (
                  <li key={n.id} className="px-5 py-3.5">
                    <p className="mb-1 text-xs text-faint" title={formatDateTime(n.createdAt)}>
                      {n.author?.name ?? "Unknown"} · {relativeTime(n.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── Sidebar ───────────────────────────────────── */}
        <aside className="space-y-4">
          <Card>
            <SectionHeading title="Resume" icon="file" />
            {app.resume ? (
              <div className="space-y-3">
                <div className="panel-sunken flex items-center gap-3 p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-line bg-raised text-faint">
                    <Icon name="file" size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm">{app.resume.originalName}</p>
                    <p className="text-xs text-faint">
                      {app.resume.mimeType === "application/pdf" ? "PDF" : "Word document"} ·{" "}
                      {formatBytes(app.resume.sizeBytes)}
                    </p>
                  </div>
                </div>
                <ScanState
                  status={app.resume.scanStatus}
                  detail={app.resume.scanDetail}
                  busy={isBusy("rescan")}
                  onRescan={() => void rescanResume()}
                />
                <Button
                  className="w-full"
                  icon="download"
                  loading={isBusy("resume")}
                  disabled={app.resume.scanStatus !== "CLEAN"}
                  onClick={() => void downloadResume()}
                >
                  Download resume
                </Button>
                <p className="text-[0.6875rem] leading-relaxed text-faint">
                  Served through an authenticated route, never a public URL, and only after the
                  malware scanner has passed it. Each download is recorded and asks you to confirm
                  your password.
                </p>
              </div>
            ) : (
              <p className="text-sm text-faint">No resume was attached to this application.</p>
            )}
          </Card>

          <Card>
            <SectionHeading title="Assignment" icon="shield" />
            {admins.data ? (
              <Select
                label="Assigned recruiter"
                value={app.assignedTo?.id ?? ""}
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
                {app.assignedTo ? app.assignedTo.name : <span className="text-faint">Unassigned</span>}
              </p>
            )}
          </Card>

          <Card>
            <SectionHeading title="Application" icon="info" />
            <dl className="space-y-3 text-xs">
              <Row label="Received" value={relativeTime(app.createdAt)} title={formatDateTime(app.createdAt)} />
              <Row label="Last updated" value={relativeTime(app.updatedAt)} title={formatDateTime(app.updatedAt)} />
              {app.interviewAt && (
                <Row
                  label="Interview"
                  value={formatDateTime(app.interviewAt)}
                  title={formatDateTime(app.interviewAt)}
                />
              )}
              {app.jobOpening && <Row label="Opening" value={app.jobOpening.title} />}
              {app.jobOpening && <Row label="Department" value={app.jobOpening.department} />}
            </dl>
          </Card>

          {/* ── Status history ───────────────────────── */}
          <Card padded={false}>
            <div className="px-5 pt-5">
              <SectionHeading title="Status history" icon="history" />
            </div>
            <ol className="relative px-5 pb-5">
              {app.events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < app.events.length - 1 && (
                    <span className="absolute left-[0.3125rem] top-4 h-full w-px bg-line" aria-hidden />
                  )}
                  <span className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-accent bg-canvas" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      {e.fromStatus && e.fromStatus !== e.toStatus ? (
                        <>
                          <span className="text-faint">{humanise(e.fromStatus)}</span>
                          <Icon name="chevronRight" size={11} className="mx-1 inline text-faint" />
                        </>
                      ) : null}
                      <span className="font-medium">{humanise(e.toStatus)}</span>
                    </p>
                    {e.note && (
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-body">{e.note}</p>
                    )}
                    {e.scheduledAt && (
                      <p className="mt-1 text-[0.6875rem] text-accent-ice">
                        Scheduled for {formatDateTime(e.scheduledAt)}
                      </p>
                    )}
                    <p className="mt-1 text-[0.6875rem] text-faint" title={formatDateTime(e.createdAt)}>
                      {e.actor?.name ?? "Applicant"} · {relativeTime(e.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {canWrite && (
            <Card>
              <SectionHeading title="Manage" icon="settings" />
              <div className="space-y-2">
                <Button className="w-full" icon="archive" loading={isBusy("archive")} onClick={() => void archive()}>
                  {app.archivedAt ? "Return to pipeline" : "Archive application"}
                </Button>
                {can("application:delete") && (
                  <Button
                    className="w-full"
                    variant="danger"
                    icon="trash"
                    onClick={() => setDeleting(true)}
                  >
                    Delete permanently
                  </Button>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>

      {statusDialog && (
        <StatusDialog
          app={app}
          onClose={() => setStatusDialog(false)}
          onDone={async () => {
            setStatusDialog(false);
            await query.reload();
          }}
        />
      )}

      {noteDialog && (
        <NoteDialog
          applicationId={id}
          onClose={() => setNoteDialog(false)}
          onDone={async () => {
            setNoteDialog(false);
            await query.reload();
          }}
        />
      )}

      <Confirm
        open={deleting}
        title="Delete this application permanently?"
        message={`${app.fullName}'s application and every note, feedback entry and status change on it will be removed.`}
        warning="Their resume file is deleted too. This cannot be undone — archiving keeps the record instead."
        confirmLabel="Delete permanently"
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right" title={title}>
        {value}
      </dd>
    </div>
  );
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 break-all text-accent-ice underline-offset-2 hover:underline"
    >
      {href.replace(/^https?:\/\/(www\.)?/, "")}
      <Icon name="external" size={12} />
    </a>
  );
}

/* ── Status change ────────────────────────────────────────── */

function StatusDialog({
  app,
  onClose,
  onDone,
}: {
  app: Application;
  onClose(): void;
  onDone(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notifyCandidate, setNotifyCandidate] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const needsSchedule = status === "INTERVIEW_SCHEDULED";
  const canNotify = NOTIFIABLE.has(status);

  const submit = async () => {
    setError(null);
    const result = await run("save", () =>
      api.patch<{
        notification: { sent: boolean; reason?: string; detail?: string | null } | null;
      }>(`/applications/${app.id}/status`, {
        status,
        note: note || undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        notifyCandidate: canNotify && notifyCandidate,
        notifyMessage: notifyMessage || undefined,
      })
    );

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const n = result.value.notification;
    // Report exactly what happened to the email. Never imply it was
    // delivered when the server could not send it.
    if (!n) {
      notify(`Status changed to ${humanise(status)}`);
    } else if (n.sent) {
      notify(`Status changed to ${humanise(status)}`, "success", "The candidate was emailed.");
    } else if (n.reason === "not_configured") {
      notify(
        `Status changed to ${humanise(status)}`,
        "warning",
        "No email was sent: outbound email is not configured on this server. Contact the candidate yourself."
      );
    } else {
      notify(
        `Status changed to ${humanise(status)}`,
        "warning",
        `The notification email failed: ${n.detail ?? "unknown error"}. Contact the candidate yourself.`
      );
    }
    onDone();
  };

  return (
    <Modal
      open
      title="Change status"
      description={`${app.fullName} is currently ${humanise(app.status).toLowerCase()}.`}
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
            disabled={!status || (needsSchedule && !scheduledAt)}
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
          {APPLICATION_STATUSES.filter((s) => s !== app.status).map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>

        {needsSchedule && (
          <Input
            label="Interview date and time"
            type="datetime-local"
            required
            value={scheduledAt}
            hint="Required when scheduling an interview."
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        )}

        <Textarea
          label="Note"
          rows={3}
          hint="Recorded on the status history. Internal only."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {canNotify && (
          <div className="panel-sunken space-y-3 p-3">
            <Checkbox
              label="Email the candidate about this"
              hint="A plain message stating the outcome. Nothing about salary or terms."
              checked={notifyCandidate}
              onChange={setNotifyCandidate}
            />
            {notifyCandidate && (
              <>
                <Textarea
                  label="Add to the message"
                  rows={3}
                  hint="Optional. Interview joining details, for instance."
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                />
                <Notice tone="caution" icon="mail">
                  If outbound email is not configured on this server, nothing is sent and you will be
                  told so plainly — the status change still applies.
                </Notice>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Notes ────────────────────────────────────────────────── */

function NoteDialog({
  applicationId,
  onClose,
  onDone,
}: {
  applicationId: string;
  onClose(): void;
  onDone(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [kind, setKind] = useState("NOTE");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const result = await run("save", () =>
      api.post(`/applications/${applicationId}/notes`, { body, kind })
    );
    if (result.ok) {
      notify("Recorded");
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal
      open
      title="Add a note"
      description="Visible to administrators only. Never shown on the website."
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
        <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
          {NOTE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Textarea
          label="Note"
          required
          rows={6}
          value={body}
          aside={`${body.length} characters`}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
    </Modal>
  );
}


/** The malware-scan state of an uploaded file, with a rescan control. */
function ScanState({
  status,
  detail,
  busy,
  onRescan,
}: {
  status: string;
  detail: string | null;
  busy: boolean;
  onRescan: () => void;
}) {
  if (status === "CLEAN") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-body">
        <Icon name="check" size={13} className="text-positive" /> Scanned clean
      </p>
    );
  }
  const rejected = status === "REJECTED";
  return (
    <div className="space-y-2">
      <Notice tone={rejected ? "danger" : "caution"} icon="alert">
        {rejected
          ? "The malware scanner rejected this file. It has been destroyed and cannot be downloaded."
          : "This resume has not passed a malware scan yet, so it cannot be downloaded."}
        {detail && <span className="mt-1 block text-xs opacity-80">{detail}</span>}
      </Notice>
      {!rejected && (
        <Button variant="secondary" size="sm" loading={busy} onClick={onRescan}>
          Scan now
        </Button>
      )}
    </div>
  );
}

import { Frame, Bar, Row, Dot } from "./Frame";

/* ── Audience panels ─────────────────────────────────────── */

function StudentMock() {
  return (
    <Frame title="My progress" status="Week 09">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">SOC Analyst track</span>
        <span className="font-mono text-xs text-accent-ice">68%</span>
      </div>
      <div className="mt-2">
        <Bar value={68} />
      </div>

      <div className="mt-4 space-y-2">
        {[
          ["Log triage basics", "92"],
          ["Phishing analysis", "88"],
          ["Incident write-up", "74"],
        ].map(([name, score]) => (
          <Row key={name}>
            <Dot />
            <span className="min-w-0 flex-1 text-xs break-words sm:truncate">{name}</span>
            <span className="font-mono text-xs text-body">{score}</span>
          </Row>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-inner bg-accent-soft px-3 py-2.5">
        <span className="text-xs font-medium text-accent-ice">Portfolio ready</span>
        <span className="font-mono text-[0.625rem] text-accent-ice">12 artefacts</span>
      </div>
    </Frame>
  );
}

function CollegeMock() {
  return (
    <Frame title="Faculty dashboard" status="Live">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["62", "Enrolled"],
          ["54", "On track"],
          ["8", "At risk"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-inner border border-line-soft bg-canvas/60 px-3 py-2.5">
            <p className="text-lg font-semibold leading-none">{v}</p>
            <p className="mt-1 text-[0.625rem] text-faint">{l}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {[
          ["Module 04 · Triage", 86],
          ["Module 05 · Forensics", 61],
          ["Module 06 · Reporting", 34],
        ].map(([name, v]) => (
          <div key={name}>
            <div className="flex justify-between text-[0.6875rem]">
              <span className="text-body">{name}</span>
              <span className="font-mono text-faint">{v}%</span>
            </div>
            <div className="mt-1.5">
              <Bar value={v} tone={v > 70 ? "accent" : v > 50 ? "ink" : "ice"} />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function CellMock() {
  return (
    <Frame title="Placement shortlist" status="Ranked">
      <div className="space-y-2">
        {[
          ["Priya N.", "SOC", "94", true],
          ["Rahul V.", "OffSec", "89", true],
          ["Divya S.", "Cloud", "81", true],
          ["Karthik M.", "SOC", "67", false],
        ].map(([name, track, score, ready]) => (
          <Row key={name}>
            <Dot tone={ready ? "accent" : "ice"} />
            <span className="min-w-0 flex-1 text-xs font-medium break-words sm:truncate">{name}</span>
            <span className="font-mono text-[0.625rem] text-faint">{track}</span>
            <span className="font-mono text-xs">{score}</span>
          </Row>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-inner bg-accent-soft px-3 py-2.5">
        <span className="text-xs font-medium text-accent-ice">Interview ready</span>
        <span className="font-mono text-[0.625rem] text-accent-ice">38 of 62</span>
      </div>
    </Frame>
  );
}

function EmployerMock() {
  return (
    <Frame title="Candidate evidence" status="Verified">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-invert font-mono text-xs text-on-invert">
          PN
        </span>
        <div className="min-w-0">
          <p className="min-w-0 truncate text-sm font-medium">Priya N.</p>
          <p className="font-mono text-[0.625rem] text-faint">SOC Analyst · Cohort 04</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {[
          ["Alert triage", 94],
          ["Log analysis", 88],
          ["Report quality", 91],
        ].map(([name, v]) => (
          <div key={name}>
            <div className="flex justify-between text-[0.6875rem]">
              <span className="text-body">{name}</span>
              <span className="font-mono text-faint">{v}</span>
            </div>
            <div className="mt-1.5">
              <Bar value={v} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-inner border border-line-soft bg-canvas/60 px-3 py-2.5">
        <p className="font-mono text-[0.625rem] text-faint">Scenario set by you</p>
        <p className="mt-1 text-xs">Ransomware precursor · 48h window</p>
      </div>
    </Frame>
  );
}

/* ── Programme panels ────────────────────────────────────── */

function SocMock() {
  return (
    <Frame title="Alert queue" status="Live lab">
      <div className="space-y-2">
        {[
          ["A-4417", "Suspicious PowerShell", "ice", "High"],
          ["A-4418", "Impossible travel", "ink", "Medium"],
          ["A-4419", "Failed MFA burst", "accent", "Low"],
          ["A-4420", "New admin created", "ice", "High"],
        ].map(([id, label, tone, sev]) => (
          <Row key={id}>
            <Dot tone={tone} />
            <span className="shrink-0 font-mono text-[0.625rem] text-faint">{id}</span>
            <span className="min-w-0 flex-1 text-xs break-words sm:truncate">{label}</span>
            <span className="font-mono text-[0.625rem] text-body">{sev}</span>
          </Row>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-inner bg-accent-soft px-3 py-2.5">
        <span className="text-xs font-medium text-accent-ice">Triaged correctly</span>
        <span className="font-mono text-[0.625rem] text-accent-ice">18 / 20</span>
      </div>
    </Frame>
  );
}

function OffsecMock() {
  return (
    <Frame title="Engagement console" status="In range">
      <div className="overflow-x-auto rounded-inner bg-terminal p-3 font-mono text-[0.625rem] leading-relaxed text-on-terminal [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className="text-accent">$ scan 10.10.24.0/24</p>
        <p className="mt-1">22/tcp open ssh</p>
        <p>445/tcp open smb</p>
        <p>3389/tcp open rdp</p>
        <p className="mt-1 text-accent-ice">2 hosts · 1 path to domain admin</p>
      </div>

      <div className="mt-3 space-y-2">
        {[
          ["F-01", "SMB signing disabled", "ice"],
          ["F-02", "Kerberoastable account", "ice"],
          ["F-03", "Stale local admin", "ink"],
        ].map(([id, label, tone]) => (
          <Row key={id}>
            <Dot tone={tone} />
            <span className="shrink-0 font-mono text-[0.625rem] text-faint">{id}</span>
            <span className="min-w-0 flex-1 text-xs break-words sm:truncate">{label}</span>
          </Row>
        ))}
      </div>
    </Frame>
  );
}

function CloudMock() {
  return (
    <Frame title="Posture review" status="2 accounts">
      <div className="grid grid-cols-2 gap-2">
        {[
          ["14", "Findings"],
          ["3", "Critical"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-inner border border-line-soft bg-canvas/60 px-3 py-2.5">
            <p className="text-lg font-semibold leading-none">{v}</p>
            <p className="mt-1 text-[0.625rem] text-faint">{l}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {[
          ["IAM", "Wildcard policy on role", "ice"],
          ["S3", "Bucket readable by any user", "ice"],
          ["K8s", "Privileged pod in default ns", "ink"],
          ["Logs", "CloudTrail gap, 6 hours", "ink"],
        ].map(([svc, label, tone]) => (
          <Row key={label}>
            <Dot tone={tone} />
            <span className="w-9 shrink-0 font-mono text-[0.625rem] text-faint">{svc}</span>
            <span className="min-w-0 flex-1 text-xs break-words sm:truncate">{label}</span>
          </Row>
        ))}
      </div>
    </Frame>
  );
}

function GrcMock() {
  return (
    <Frame title="Control register" status="Audit prep">
      <div className="space-y-2">
        {[
          ["A.5.15", "Access control", "Met", "accent"],
          ["A.8.12", "Data leakage prevention", "Gap", "ice"],
          ["A.5.23", "Cloud service security", "Partial", "ink"],
          ["A.6.3", "Awareness training", "Met", "accent"],
        ].map(([ref, name, state, tone]) => (
          <Row key={ref}>
            <Dot tone={tone} />
            <span className="w-12 shrink-0 font-mono text-[0.625rem] text-faint">{ref}</span>
            <span className="min-w-0 flex-1 text-xs break-words sm:truncate">{name}</span>
            <span className="font-mono text-[0.625rem] text-body">{state}</span>
          </Row>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-[0.6875rem]">
          <span className="text-body">Evidence collected</span>
          <span className="font-mono text-faint">72%</span>
        </div>
        <div className="mt-1.5">
          <Bar value={72} />
        </div>
      </div>
    </Frame>
  );
}

export const MOCKS = {
  student: StudentMock,
  college: CollegeMock,
  cell: CellMock,
  employer: EmployerMock,
  soc: SocMock,
  offsec: OffsecMock,
  cloud: CloudMock,
  grc: GrcMock,
};

export function Mock({ name, className = "" }) {
  const C = MOCKS[name];
  if (!C) return null;
  return (
    <div className={className}>
      <C />
    </div>
  );
}

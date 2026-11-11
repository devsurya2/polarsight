/**
 * Website settings and integration health.
 *
 * Credentials are deliberately absent. SMTP passwords, JWT secrets and
 * storage keys live in the server's environment, and the API refuses to
 * store or return them — so this screen reports whether an integration
 * is configured and working, never how.
 */

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { MediaField } from "@/components/MediaPicker";
import { Icon, type IconName } from "@/components/Icon";
import {
  Badge,
  Card,
  ErrorNote,
  Input,
  Loading,
  Notice,
  PageHeader,
  SaveBar,
  SectionHeading,
  Switch,
  Tabs,
  Textarea,
} from "@/components/ui";

interface Setting {
  id: string;
  key: string;
  group: string;
  label: string;
  type: "TEXT" | "LONG_TEXT" | "URL" | "EMAIL" | "NUMBER" | "BOOLEAN" | "MEDIA" | "JSON";
  hint: string | null;
  value: string;
  isSecret: boolean;
  isLocked: boolean;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

interface Integrations {
  api: { ok: boolean; uptimeSeconds: number; environment: string };
  database: { ok: boolean; latencyMs: number | null; error: string | null };
  mediaStorage: { ok: boolean; driver: string; error: string | null };
  malwareScanner: {
    configured: boolean;
    ok: boolean;
    host: string | null;
    version: string | null;
    error: string | null;
    awaitingScan: number;
  };
  email: {
    configured: boolean;
    host: string | null;
    port: number | null;
    secure: boolean | null;
    from: string | null;
    authUser: string | null;
  };
  security: {
    cookieSecure: boolean;
    accessTokenTtl: string;
    refreshTokenTtl: string;
    distinctJwtSecrets: boolean;
    corsOrigins: string[];
    loginAttemptLimit: number;
    mfaKeyConfigured: boolean;
    trustProxy: boolean;
    resumeMaxBytes: number;
  };
}

const GROUP_LABELS: Record<string, { label: string; icon: IconName; description: string }> = {
  general: {
    label: "General",
    icon: "settings",
    description: "Company name, description and brand assets.",
  },
  seo: {
    label: "SEO",
    icon: "search",
    description: "Defaults used where a page sets nothing of its own.",
  },
  contact: {
    label: "Contact and social",
    icon: "mail",
    description:
      "Shown on the website. A blank value is omitted entirely rather than rendered empty, so leave anything you do not own unset.",
  },
  security: {
    label: "Security",
    icon: "shield",
    description: "Configured on the server. Shown here for reference, read-only.",
  },
};

export function SettingsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const settings = useQuery<{ groups: Record<string, Setting[]> }>("/settings");
  const health = useQuery<Integrations>("/settings/integrations");

  const [tab, setTab] = useState("general");
  const [edits, setEdits] = useState<Record<string, string>>({});

  const canWrite = can("setting:write");
  const groups = settings.data?.groups ?? {};
  const dirty = Object.keys(edits).length > 0;

  const valueOf = (s: Setting) => edits[s.key] ?? s.value;

  const setValue = (key: string, value: string) =>
    setEdits((e) => ({ ...e, [key]: value }));

  const save = async () => {
    const values = Object.entries(edits).map(([key, value]) => ({ key, value }));
    const result = await run("save", () => api.put<{ updated: number }>("/settings", { values }));
    if (result.ok) {
      notify(`${result.value.updated} setting${result.value.updated === 1 ? "" : "s"} saved`);
      setEdits({});
      await settings.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const tabs = useMemo(
    () => [
      ...Object.keys(groups)
        .filter((g) => GROUP_LABELS[g])
        .sort((a, b) => Object.keys(GROUP_LABELS).indexOf(a) - Object.keys(GROUP_LABELS).indexOf(b))
        .map((g) => ({
          id: g,
          label: GROUP_LABELS[g]!.label,
          icon: GROUP_LABELS[g]!.icon,
        })),
      { id: "integrations", label: "Integrations", icon: "database" as IconName },
    ],
    [groups]
  );

  if (settings.initial) return <Loading label="Loading settings" />;

  const meta = GROUP_LABELS[tab];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Operational configuration for the website and this portal."
        breadcrumbs={[{ label: "Administration" }, { label: "Settings" }]}
      />

      {settings.error && <ErrorNote message={settings.error} onRetry={settings.reload} />}

      <Notice tone="info" icon="lock">
        Credentials are never stored or shown here. SMTP passwords, signing secrets and storage keys
        stay in the server's environment, where an authenticated HTTP request cannot reach them.
      </Notice>

      <div className="mt-5">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === "integrations" ? (
        <IntegrationHealth health={health} />
      ) : (
        <Card className="max-w-3xl">
          {meta && <SectionHeading title={meta.label} icon={meta.icon} description={meta.description} />}

          <div className="space-y-5">
            {(groups[tab] ?? []).map((s) => (
              <SettingField
                key={s.key}
                setting={s}
                value={valueOf(s)}
                disabled={!canWrite || s.isLocked}
                onChange={(v) => setValue(s.key, v)}
              />
            ))}
          </div>
        </Card>
      )}

      <SaveBar
        dirty={dirty && canWrite}
        saving={isBusy("save")}
        onSave={() => void save()}
        onDiscard={() => setEdits({})}
        message={`${Object.keys(edits).length} setting${Object.keys(edits).length === 1 ? "" : "s"} changed.`}
      />
    </>
  );
}

/* ── One setting ──────────────────────────────────────────── */

function SettingField({
  setting,
  value,
  disabled,
  onChange,
}: {
  setting: Setting;
  value: string;
  disabled: boolean;
  onChange(next: string): void;
}) {
  const footer = setting.updatedBy ? (
    <p className="mt-1 text-[0.6875rem] text-faint" title={formatDateTime(setting.updatedAt)}>
      Last changed by {setting.updatedBy.name}, {relativeTime(setting.updatedAt)}
    </p>
  ) : null;

  const lockBadge = setting.isLocked ? (
    <Badge tone="neutral" icon="lock">
      Server-managed
    </Badge>
  ) : null;

  if (setting.type === "BOOLEAN") {
    return (
      <div>
        <Switch
          label={setting.label}
          hint={setting.hint ?? undefined}
          checked={value === "true"}
          disabled={disabled}
          onChange={(next) => onChange(next ? "true" : "false")}
        />
        {footer}
      </div>
    );
  }

  if (setting.type === "MEDIA") {
    return (
      <div>
        <MediaField
          label={setting.label}
          hint={setting.hint ?? undefined}
          mediaId={value || null}
          disabled={disabled}
          onChange={(id) => onChange(id ?? "")}
        />
        {footer}
      </div>
    );
  }

  if (setting.type === "LONG_TEXT" || setting.type === "JSON") {
    return (
      <div>
        <Textarea
          label={setting.label}
          hint={setting.hint ?? undefined}
          rows={setting.type === "JSON" ? 6 : 3}
          className={setting.type === "JSON" ? "font-mono text-xs" : ""}
          value={value}
          disabled={disabled}
          aside={lockBadge}
          onChange={(e) => onChange(e.target.value)}
        />
        {footer}
      </div>
    );
  }

  return (
    <div>
      <Input
        label={setting.label}
        hint={setting.hint ?? undefined}
        type={
          setting.type === "EMAIL"
            ? "email"
            : setting.type === "URL"
              ? "url"
              : setting.type === "NUMBER"
                ? "number"
                : "text"
        }
        placeholder={
          setting.type === "URL"
            ? "https://…"
            : setting.type === "EMAIL"
              ? "name@example.com"
              : undefined
        }
        value={value}
        disabled={disabled}
        aside={lockBadge}
        onChange={(e) => onChange(e.target.value)}
      />
      {footer}
    </div>
  );
}

/* ── Integration health ───────────────────────────────────── */

function IntegrationHealth({
  health,
}: {
  health: ReturnType<typeof useQuery<Integrations>>;
}) {
  const h = health.data;

  if (health.initial) return <Loading label="Checking integrations" />;
  if (health.error || !h)
    return <ErrorNote message={health.error ?? "Could not read integration status"} onRetry={health.reload} />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HealthCard
        title="Backend API"
        icon="database"
        ok={h.api.ok}
        rows={[
          ["Status", h.api.ok ? "Responding" : "Unavailable"],
          ["Environment", h.api.environment],
          ["Uptime", formatUptime(h.api.uptimeSeconds)],
        ]}
      />

      <HealthCard
        title="Database"
        icon="database"
        ok={h.database.ok}
        error={h.database.error}
        rows={[
          ["Status", h.database.ok ? "Connected" : "Unreachable"],
          ["Round trip", h.database.latencyMs !== null ? `${h.database.latencyMs} ms` : "—"],
        ]}
      />

      <HealthCard
        title="Media storage"
        icon="media"
        ok={h.mediaStorage.ok}
        error={h.mediaStorage.error}
        rows={[
          ["Driver", h.mediaStorage.driver],
          ["Status", h.mediaStorage.ok ? "Writable" : "Not usable"],
        ]}
        note={
          h.mediaStorage.driver === "local"
            ? "Local disk is for development. Configure object storage before deploying."
            : undefined
        }
      />

      <HealthCard
        title="Malware scanner"
        icon="shield"
        ok={h.malwareScanner.ok}
        error={h.malwareScanner.error}
        rows={[
          ["Status", h.malwareScanner.ok ? "Reachable" : h.malwareScanner.configured ? "Unreachable" : "Not configured"],
          ["Daemon", h.malwareScanner.host ?? "—"],
          ["Version", h.malwareScanner.version ?? "—"],
          ["Files awaiting a verdict", String(h.malwareScanner.awaitingScan)],
        ]}
        note={
          h.malwareScanner.ok
            ? "Every upload is scanned before it is served or downloadable."
            : "Resumes cannot be downloaded and uploads stay quarantined until the scanner is reachable. Set CLAMAV_HOST on the server."
        }
      />

      <HealthCard
        title="Outbound email"
        icon="mail"
        ok={h.email.configured}
        rows={[
          ["Status", h.email.configured ? "Configured" : "Not configured"],
          ["Host", h.email.host ?? "—"],
          ["Port", h.email.port !== null ? String(h.email.port) : "—"],
          ["TLS", h.email.secure === null ? "—" : h.email.secure ? "Yes" : "No"],
          ["From address", h.email.from ?? "—"],
          ["Auth user", h.email.authUser ?? "None"],
        ]}
        note={
          h.email.configured
            ? undefined
            : "Candidate and enquiry notifications will not be sent. The portal says so plainly rather than implying a message went out — set SMTP_HOST and MAIL_FROM on the server to enable it."
        }
      />

      <Card className="lg:col-span-2">
        <SectionHeading
          title="Security configuration"
          icon="shield"
          description="Set in the server's environment. Shown for reference; no secret is included."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact
            label="Secure cookies"
            value={h.security.cookieSecure ? "Enabled" : "Disabled"}
            ok={h.security.cookieSecure}
            warn={!h.security.cookieSecure && h.api.environment === "production"}
          />
          <Fact label="Access token lifetime" value={h.security.accessTokenTtl} ok />
          <Fact label="Refresh token lifetime" value={h.security.refreshTokenTtl} ok />
          <Fact
            label="Distinct signing secrets"
            value={h.security.distinctJwtSecrets ? "Yes" : "No — reusing one secret"}
            ok={h.security.distinctJwtSecrets}
            warn={!h.security.distinctJwtSecrets}
          />
          <Fact
            label="Sign-in attempt limit"
            value={`${h.security.loginAttemptLimit} per window`}
            ok
          />
          <Fact
            label="MFA secret encryption key"
            value={h.security.mfaKeyConfigured ? "Dedicated key" : "Derived from JWT secret"}
            ok={h.security.mfaKeyConfigured}
            warn={!h.security.mfaKeyConfigured && h.api.environment === "production"}
          />
          <Fact
            label="Trusts proxy headers"
            value={h.security.trustProxy ? "Yes" : "No"}
            ok
          />
          <Fact
            label="Allowed origins"
            value={h.security.corsOrigins.join(", ") || "None"}
            ok={h.security.corsOrigins.length > 0}
          />
        </div>

        {!h.security.cookieSecure && h.api.environment === "production" && (
          <div className="mt-4">
            <Notice tone="danger" icon="alert">
              Secure cookies are disabled in production. Session cookies would be sent over plain
              HTTP. Set COOKIE_SECURE=true and redeploy.
            </Notice>
          </div>
        )}
      </Card>
    </div>
  );
}

function HealthCard({
  title,
  icon,
  ok,
  rows,
  error,
  note,
}: {
  title: string;
  icon: IconName;
  ok: boolean;
  rows: Array<[string, string]>;
  error?: string | null;
  note?: string;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name={icon} size={15} className="text-faint" />
          {title}
        </h2>
        <Badge tone={ok ? "positive" : "caution"} icon={ok ? "check" : "alert"}>
          {ok ? "OK" : "Attention"}
        </Badge>
      </div>

      <dl className="space-y-2.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-faint">{label}</dt>
            <dd className="break-all text-right">{value}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <div className="mt-3">
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        </div>
      )}
      {note && (
        <div className="mt-3">
          <Notice tone="caution" icon="info">
            {note}
          </Notice>
        </div>
      )}
    </Card>
  );
}

function Fact({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p
        className={`flex items-center gap-1.5 break-words text-sm ${
          warn ? "text-danger" : ok ? "" : "text-caution"
        }`}
      >
        {warn ? <Icon name="alert" size={13} /> : ok ? <Icon name="check" size={13} className="text-positive" /> : null}
        {value}
      </p>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

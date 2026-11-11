/**
 * Your own account.
 *
 * Changing your password ends every session, including this one — the
 * server stamps the account so the access token already in this
 * browser stops working on its next request rather than lingering
 * until it expires.
 *
 * Two-factor authentication is enrolled here. The secret is shown
 * once, as text and as an otpauth link, and the recovery codes are
 * shown once; neither is retrievable afterwards.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  ErrorNote,
  Input,
  Loading,
  Notice,
  PageHeader,
  SectionHeading,
} from "@/components/ui";
import { PasswordRules, passwordProblems } from "./AdminUsers";

export function AccountPage() {
  const { user, signOut, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery<{
    item: { id: string; email: string; name: string; role: { name: string }; createdAt: string };
    sessions: Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      ip: string | null;
      userAgent: string | null;
    }>;
  }>(user && !user.mfaSetupRequired ? `/admin-users/${user.id}` : null);

  const problems = passwordProblems(form.newPassword);
  const mismatch = form.confirm.length > 0 && form.newPassword !== form.confirm;
  const ready =
    form.currentPassword.length > 0 && problems.length === 0 && !mismatch && form.confirm.length > 0;

  const changePassword = async () => {
    setError(null);
    const result = await run("password", () =>
      api.post<{ message: string }>("/auth/change-password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      })
    );

    if (result.ok) {
      notify("Password changed", "success", "Signing you out of every session.");
      // The server has invalidated this session, so go to sign-in
      // rather than leaving the interface in a state it cannot use.
      await signOut();
      navigate("/login", { replace: true });
    } else {
      setError(result.error);
    }
  };

  if (!user) return <Loading />;

  return (
    <>
      <PageHeader
        title="Your account"
        description="Your details, your sessions, your password and your second factor."
        breadcrumbs={[{ label: "Your account" }]}
        meta={<Badge tone="accent">{user.role}</Badge>}
      />

      {user.mfaSetupRequired && (
        <div className="mb-4">
          <Notice tone="danger" icon="shield">
            Your role requires two-factor authentication. Set it up below to continue — nothing
            else in the portal is available until you do.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MfaCard
          user={user}
          onChanged={async (signInAgain) => {
            if (signInAgain) {
              await signOut();
              navigate("/login", { replace: true });
            } else {
              await refreshUser();
            }
          }}
        />

        <Card>
          <SectionHeading title="Details" icon="users" />
          <DescriptionList
            columns={1}
            items={[
              { label: "Name", value: user.name },
              { label: "Email", value: user.email },
              { label: "Role", value: user.role },
              {
                label: "Last sign-in",
                value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "This is your first",
              },
              {
                label: "Permissions",
                value: `${user.permissions.length} granted by your role`,
              },
            ]}
          />
          <div className="mt-4">
            <Notice tone="info">
              Your name and role are managed by a Super Admin. Ask one if either needs changing.
            </Notice>
          </div>
        </Card>

        {!user.mfaSetupRequired && (
          <>
            <Card>
              <SectionHeading
                title="Change your password"
                icon="lock"
                description="Ends every session, including this one."
              />
              <div className="space-y-4">
                {error && <ErrorNote message={error} />}

                <Input
                  label="Current password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={form.currentPassword}
                  onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                />
                <Input
                  label="New password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                />
                <PasswordRules value={form.newPassword} />
                <Input
                  label="Confirm new password"
                  type="password"
                  required
                  autoComplete="new-password"
                  error={mismatch ? "The two passwords do not match." : undefined}
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                />

                <Button
                  variant="primary"
                  icon="lock"
                  loading={isBusy("password")}
                  disabled={!ready}
                  onClick={() => void changePassword()}
                >
                  Change password and sign out
                </Button>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <SectionHeading
                title="Your active sessions"
                icon="globe"
                description="Where this account is signed in. Only the address and device are recorded — never the session token."
              />
              {detail.initial ? (
                <Loading />
              ) : (detail.data?.sessions.length ?? 0) === 0 ? (
                <p className="text-sm text-faint">No other active sessions.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {detail.data!.sessions.map((s) => (
                    <li key={s.id} className="panel-sunken p-3">
                      <p className="text-sm font-medium">{s.ip ?? "Unknown address"}</p>
                      <p className="mt-0.5 truncate text-xs text-faint" title={s.userAgent ?? ""}>
                        {s.userAgent ?? "Unknown device"}
                      </p>
                      <p className="mt-1.5 text-[0.6875rem] text-faint">
                        Started {relativeTime(s.createdAt)} · expires {relativeTime(s.expiresAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <Notice tone="info" icon="shield">
                  To end them all, change your password above. A Super Admin can also revoke
                  sessions for any account from the Administrators screen.
                </Notice>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

/* ── Two-factor authentication ─────────────────────────────── */

function MfaCard({
  user,
  onChanged,
}: {
  user: { mfaEnabled: boolean; mfaSetupRequired: boolean; recoveryCodesLeft?: number; email: string };
  onChanged: (signInAgain: boolean) => Promise<void>;
}) {
  const { run, isBusy } = useAction();
  const { notify } = useToast();

  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disable, setDisable] = useState({ password: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setError(null);
    const result = await run("mfa-setup", () => api.post<{ secret: string; otpauth: string }>("/auth/mfa/setup"));
    if (result.ok) setSetup(result.value);
    else setError(result.error);
  };

  const confirm = async () => {
    setError(null);
    const result = await run("mfa-confirm", () =>
      api.post<{ recoveryCodes: string[]; signInAgain: boolean }>("/auth/mfa/confirm", { code })
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSetup(null);
    setCode("");
    setRecovery(result.value.recoveryCodes);
    notify("Two-factor authentication is on", "success");
    if (result.value.signInAgain) {
      // Keep the recovery codes on screen; the sign-out happens when
      // the user dismisses them.
      setPendingSignOut(true);
    } else {
      await onChanged(false);
    }
  };

  const [pendingSignOut, setPendingSignOut] = useState(false);

  const dismissRecovery = async () => {
    setRecovery(null);
    if (pendingSignOut) {
      setPendingSignOut(false);
      await onChanged(true);
    }
  };

  const turnOff = async () => {
    setError(null);
    const result = await run("mfa-disable", () => api.post("/auth/mfa/disable", disable));
    if (result.ok) {
      setDisable({ password: "", code: "" });
      notify("Two-factor authentication is off", "info");
      await onChanged(false);
    } else {
      setError(result.error);
    }
  };

  const regenerate = async () => {
    setError(null);
    const result = await run("mfa-recovery", () =>
      api.post<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { code })
    );
    if (result.ok) {
      setCode("");
      setRecovery(result.value.recoveryCodes);
      await onChanged(false);
    } else {
      setError(result.error);
    }
  };

  return (
    <Card>
      <SectionHeading
        title="Two-factor authentication"
        icon="shield"
        description="A code from an authenticator app is required at sign-in and before sensitive actions."
      />
      {error && (
        <div className="mb-4">
          <ErrorNote message={error} />
        </div>
      )}

      {recovery ? (
        <div className="space-y-4">
          <Notice tone="caution" icon="alert">
            Save these recovery codes somewhere safe now. Each one signs you in once if you lose your
            device, and they will not be shown again.
          </Notice>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {recovery.map((c) => (
              <li key={c} className="panel-sunken px-3 py-2 tracking-wide">
                {c}
              </li>
            ))}
          </ul>
          <Button variant="primary" onClick={() => void dismissRecovery()}>
            I have saved them{pendingSignOut ? " — sign in again" : ""}
          </Button>
        </div>
      ) : setup ? (
        <div className="space-y-4">
          <p className="text-sm text-body">
            Add this account to your authenticator app, then enter the code it shows to finish.
          </p>
          <div className="panel-sunken space-y-2 p-3">
            <p className="text-xs text-faint">Secret key (enter it manually)</p>
            <p className="break-all font-mono text-sm tracking-wider">{setup.secret}</p>
            <a href={setup.otpauth} className="text-xs text-accent underline">
              Open in an authenticator app on this device
            </a>
          </div>
          <Input
            label="Code from the app"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123 456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="primary" loading={isBusy("mfa-confirm")} disabled={code.trim().length < 6} onClick={() => void confirm()}>
              Turn on
            </Button>
            <Button variant="secondary" onClick={() => setSetup(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : user.mfaEnabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="positive" icon="check">
              On
            </Badge>
            <span className="text-sm text-body">
              {user.recoveryCodesLeft ?? 0} recovery code{user.recoveryCodesLeft === 1 ? "" : "s"} left
            </span>
          </div>

          <div className="space-y-2">
            <Input
              label="Current authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Needed for the actions below"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button variant="secondary" loading={isBusy("mfa-recovery")} disabled={code.trim().length < 6} onClick={() => void regenerate()}>
              Generate new recovery codes
            </Button>
          </div>

          {!user.mfaSetupRequired && (
            <details className="text-sm">
              <summary className="cursor-pointer text-body">Turn off two-factor authentication</summary>
              <div className="mt-3 space-y-3">
                <Input
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={disable.password}
                  onChange={(e) => setDisable({ ...disable, password: e.target.value })}
                />
                <Input
                  label="Authenticator or recovery code"
                  inputMode="numeric"
                  value={disable.code}
                  onChange={(e) => setDisable({ ...disable, code: e.target.value })}
                />
                <Button variant="danger" loading={isBusy("mfa-disable")} disabled={!disable.password || !disable.code} onClick={() => void turnOff()}>
                  Turn off
                </Button>
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone={user.mfaSetupRequired ? "danger" : "caution"} icon="alert">
              Off
            </Badge>
            <span className="text-sm text-body">
              {user.mfaSetupRequired ? "Required for your role." : "Strongly recommended for every administrator."}
            </span>
          </div>
          <Button variant="primary" icon="shield" loading={isBusy("mfa-setup")} onClick={() => void begin()}>
            Set up two-factor authentication
          </Button>
        </div>
      )}
    </Card>
  );
}

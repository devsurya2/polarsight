/**
 * Administrator accounts.
 *
 * The server enforces every guard this screen implies: you cannot
 * disable or re-role your own account, cannot assign a role holding
 * permissions you lack, and cannot remove the last active Super Admin.
 * The buttons are hidden where that is known in advance, but the
 * refusal comes from the API either way.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useList, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  FilterSelect,
  IconButton,
  Input,
  Loading,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  SectionHeading,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/ui";

interface AdminRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  isLockedOut: boolean;
  activeSessions: number;
  createdAt: string;
  role: { id: string; name: string };
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  userCount: number;
}

export function AdminUsersPage() {
  const { user, can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const list = useList<AdminRow>("/admin-users", { roleId: "", active: "" });
  const roles = useQuery<{ items: Role[] }>(can("role:read") ? "/roles" : null);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [resetting, setResetting] = useState<AdminRow | null>(null);
  const [viewing, setViewing] = useState<AdminRow | null>(null);
  const [deleting, setDeleting] = useState<AdminRow | null>(null);
  const [revoking, setRevoking] = useState<AdminRow | null>(null);

  const canWrite = can("admin:write");
  const canDelete = can("admin:delete");

  const simple = async (row: AdminRow, action: "unlock") => {
    const result = await run(row.id, () => api.post(`/admin-users/${row.id}/${action}`));
    if (result.ok) {
      notify("Account unlocked");
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const toggleActive = async (row: AdminRow) => {
    const result = await run(row.id, () =>
      api.patch(`/admin-users/${row.id}`, { isActive: !row.isActive })
    );
    if (result.ok) {
      notify(
        row.isActive ? "Account disabled" : "Account enabled",
        "success",
        row.isActive ? "Their sessions were ended immediately." : undefined
      );
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    const result = await run("revoke", () =>
      api.post<{ revoked: number; message: string }>(`/admin-users/${revoking.id}/revoke-sessions`)
    );
    setRevoking(null);
    if (result.ok) {
      notify("Sessions revoked", "success", result.value.message);
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const result = await run("delete", () => api.del(`/admin-users/${deleting.id}`));
    if (result.ok) {
      notify("Administrator removed");
      setDeleting(null);
      await list.reload();
    } else {
      notify(result.error, "error");
    }
  };

  return (
    <>
      <PageHeader
        title="Administrators"
        description="Who can sign in to this portal, and what their role allows. Permissions are enforced by the server on every request."
        breadcrumbs={[{ label: "Administration" }, { label: "Administrators" }]}
        actions={
          canWrite ? (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Add administrator
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <SearchInput value={list.searchInput} onChange={list.setSearchInput} placeholder="Name or email…" />
        {roles.data && (
          <FilterSelect
            label="Role"
            value={String(list.filters.roleId ?? "")}
            onChange={(v) => list.setFilter({ roleId: v })}
            allLabel="All roles"
            options={roles.data.items.map((r) => ({ value: r.id, label: r.name, count: r.userCount }))}
          />
        )}
        <FilterSelect
          label="Status"
          value={String(list.filters.active ?? "")}
          onChange={(v) => list.setFilter({ active: v })}
          allLabel="All"
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Disabled" },
          ]}
        />
        {list.filtered && (
          <Button size="sm" icon="close" onClick={list.clearFilters} className="mb-px">
            Clear
          </Button>
        )}
      </Toolbar>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}

      {list.initial ? (
        <TableSkeleton cols={5} />
      ) : list.items.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon="shield" title="No administrators match those filters" />
        </Card>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Administrator</Th>
                <Th>Role</Th>
                <Th>Last sign-in</Th>
                <Th>Sessions</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((a) => {
                const isSelf = a.id === user?.id;
                return (
                  <Tr key={a.id} busy={isBusy(a.id)}>
                    <Td>
                      <button
                        type="button"
                        onClick={() => setViewing(a)}
                        className="block text-left font-medium transition-colors hover:text-accent-ice"
                      >
                        {a.name}
                        {isSelf && <span className="ml-1.5 text-xs text-faint">(you)</span>}
                      </button>
                      <p className="truncate text-xs text-faint">{a.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={a.role.name === "Super Admin" ? "accent" : "neutral"}>
                        {a.role.name}
                      </Badge>
                    </Td>
                    <Td>
                      {a.lastLoginAt ? (
                        <span className="text-xs text-body" title={formatDateTime(a.lastLoginAt)}>
                          {relativeTime(a.lastLoginAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-faint">Never</span>
                      )}
                    </Td>
                    <Td>
                      <span className="tabular text-sm">{a.activeSessions}</span>
                    </Td>
                    <Td>
                      {a.isLockedOut ? (
                        <Badge tone="danger" icon="lock">
                          Locked out
                        </Badge>
                      ) : a.isActive ? (
                        <Badge tone="positive">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Disabled</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {canWrite && a.isLockedOut && (
                          <Button size="sm" icon="unlock" onClick={() => void simple(a, "unlock")}>
                            Unlock
                          </Button>
                        )}
                        {canWrite && a.activeSessions > 0 && (
                          <IconButton
                            icon="logout"
                            label="Revoke sessions"
                            onClick={() => setRevoking(a)}
                          />
                        )}
                        {canWrite && (
                          <IconButton icon="lock" label="Reset password" onClick={() => setResetting(a)} />
                        )}
                        {canWrite && !isSelf && (
                          <Button size="sm" onClick={() => void toggleActive(a)}>
                            {a.isActive ? "Disable" : "Enable"}
                          </Button>
                        )}
                        {canWrite && <IconButton icon="edit" label="Edit" onClick={() => setEditing(a)} />}
                        {canDelete && !isSelf && (
                          <IconButton
                            icon="trash"
                            label="Remove"
                            className="hover:text-danger"
                            onClick={() => setDeleting(a)}
                          />
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>

          {list.pagination && (
            <Pagination
              page={list.pagination.page}
              totalPages={list.pagination.totalPages}
              total={list.pagination.total}
              perPage={list.pagination.perPage}
              onPage={list.setPage}
            />
          )}
        </>
      )}

      {(creating || editing) && (
        <AdminForm
          admin={editing}
          roles={roles.data?.items ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await list.reload();
          }}
        />
      )}

      {resetting && (
        <ResetPassword
          admin={resetting}
          onClose={() => setResetting(null)}
          onDone={async () => {
            setResetting(null);
            await list.reload();
          }}
        />
      )}

      {viewing && <AdminDetail adminId={viewing.id} onClose={() => setViewing(null)} />}

      <Confirm
        open={revoking !== null}
        title="End all sessions for this account?"
        message={`${revoking?.name} will be signed out everywhere and will need to sign in again.`}
        warning="This takes effect on their very next request, not when their token happens to expire."
        confirmLabel="Revoke sessions"
        busy={isBusy("revoke")}
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      />

      <Confirm
        open={deleting !== null}
        title="Remove this administrator?"
        message={`${deleting?.name} (${deleting?.email}) will no longer be able to sign in.`}
        warning="Their audit trail entries are kept, but attributed to a removed account. Disabling the account is usually the better option."
        confirmLabel="Remove"
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/* ── Create / edit ────────────────────────────────────────── */

function AdminForm({
  admin,
  roles,
  onClose,
  onSaved,
}: {
  admin: AdminRow | null;
  roles: Role[];
  onClose(): void;
  onSaved(): void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [form, setForm] = useState({
    name: admin?.name ?? "",
    email: admin?.email ?? "",
    password: "",
    roleId: admin?.role.id ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const isSelf = admin?.id === user?.id;

  const submit = async () => {
    setError(null);
    setFields({});
    const result = await run("save", () =>
      admin
        ? api.patch(`/admin-users/${admin.id}`, {
            name: form.name,
            ...(isSelf || form.roleId === admin.role.id ? {} : { roleId: form.roleId }),
          })
        : api.post("/admin-users", form)
    );
    if (result.ok) {
      notify(admin ? "Administrator updated" : "Administrator created");
      onSaved();
    } else {
      setError(result.error);
      setFields(result.fields);
    }
  };

  const problems = admin ? [] : passwordProblems(form.password);

  return (
    <Modal
      open
      title={admin ? "Edit administrator" : "Add administrator"}
      description={
        admin ? undefined : "They can sign in immediately with the password you set here."
      }
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
            disabled={!admin && (problems.length > 0 || !form.email || !form.roleId)}
            onClick={() => void submit()}
          >
            {admin ? "Save changes" : "Create account"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}

        <Input
          label="Full name"
          required
          value={form.name}
          error={fields.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        {!admin && (
          <Input
            label="Email"
            type="email"
            required
            hint="Used to sign in."
            value={form.email}
            error={fields.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        )}

        <Select
          label="Role"
          required
          hint={
            isSelf
              ? "You cannot change your own role."
              : "You can only assign a role whose permissions you hold yourself."
          }
          value={form.roleId}
          error={fields.roleId}
          disabled={isSelf}
          onChange={(e) => setForm({ ...form, roleId: e.target.value })}
        >
          <option value="">Select a role…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {r.permissions.length} permissions
            </option>
          ))}
        </Select>

        {!admin && (
          <>
            <Input
              label="Initial password"
              type="password"
              required
              autoComplete="new-password"
              value={form.password}
              error={fields.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <PasswordRules value={form.password} />
            <Notice tone="info" icon="lock">
              Share this password through a channel you trust, and ask them to change it after their
              first sign-in.
            </Notice>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ── Password reset ───────────────────────────────────────── */

function ResetPassword({
  admin,
  onClose,
  onDone,
}: {
  admin: AdminRow;
  onClose(): void;
  onDone(): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const result = await run("save", () =>
      api.post<{ message: string }>(`/admin-users/${admin.id}/reset-password`, { password })
    );
    if (result.ok) {
      notify("Password reset", "success", result.value.message);
      onDone();
    } else {
      setError(result.error);
    }
  };

  const problems = passwordProblems(password);

  return (
    <Modal
      open
      title={`Reset password for ${admin.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={isBusy("save")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="lock"
            loading={isBusy("save")}
            disabled={problems.length > 0}
            onClick={() => void submit()}
          >
            Reset password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Notice tone="caution" icon="alert">
          Their existing sessions end immediately, and any lockout is cleared. Share the new password
          through a channel you trust.
        </Notice>
        <Input
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordRules value={password} />
      </div>
    </Modal>
  );
}

export function passwordProblems(value: string): string[] {
  const problems: string[] = [];
  if (value.length < 12) problems.push("At least 12 characters");
  if (!/[a-z]/.test(value)) problems.push("A lowercase letter");
  if (!/[A-Z]/.test(value)) problems.push("An uppercase letter");
  if (!/[0-9]/.test(value)) problems.push("A digit");
  return problems;
}

export function PasswordRules({ value }: { value: string }) {
  const rules = [
    { label: "At least 12 characters", ok: value.length >= 12 },
    { label: "A lowercase letter", ok: /[a-z]/.test(value) },
    { label: "An uppercase letter", ok: /[A-Z]/.test(value) },
    { label: "A digit", ok: /[0-9]/.test(value) },
  ];
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {rules.map((r) => (
        <li
          key={r.label}
          className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-positive" : "text-faint"}`}
        >
          <Icon name={r.ok ? "check" : "close"} size={12} />
          {r.label}
        </li>
      ))}
    </ul>
  );
}

/* ── Detail ───────────────────────────────────────────────── */

function AdminDetail({ adminId, onClose }: { adminId: string; onClose(): void }) {
  const { data, error, initial } = useQuery<{
    item: AdminRow;
    activity: Array<{
      id: string;
      action: string;
      entity: string;
      entityId: string | null;
      createdAt: string;
      ip: string | null;
    }>;
    sessions: Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      ip: string | null;
      userAgent: string | null;
    }>;
  }>(`/admin-users/${adminId}`);

  return (
    <Modal open title={data?.item.name ?? "Administrator"} onClose={onClose} width="lg">
      {error && <ErrorNote message={error} />}
      {initial ? (
        <Loading />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" value={data.item.email} />
            <Field label="Role" value={data.item.role.name} />
            <Field
              label="Last sign-in"
              value={data.item.lastLoginAt ? formatDateTime(data.item.lastLoginAt) : "Never"}
            />
            <Field label="Created" value={formatDateTime(data.item.createdAt)} />
          </div>

          <div>
            <SectionHeading
              title="Active sessions"
              icon="globe"
              description="Where this account is currently signed in. Only the address and device are recorded, never the token."
            />
            {data.sessions.length === 0 ? (
              <p className="text-sm text-faint">No active sessions.</p>
            ) : (
              <ul className="space-y-2">
                {data.sessions.map((s) => (
                  <li key={s.id} className="panel-sunken p-3 text-xs">
                    <p className="font-medium">{s.ip ?? "Unknown address"}</p>
                    <p className="mt-0.5 truncate text-faint" title={s.userAgent ?? ""}>
                      {s.userAgent ?? "Unknown device"}
                    </p>
                    <p className="mt-1 text-faint">
                      Started {relativeTime(s.createdAt)} · expires {relativeTime(s.expiresAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <SectionHeading title="Recent activity" icon="history" />
            {data.activity.length === 0 ? (
              <p className="text-sm text-faint">Nothing recorded.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {data.activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="mono min-w-0 truncate">{a.action}</span>
                    <span className="shrink-0 text-faint" title={formatDateTime(a.createdAt)}>
                      {relativeTime(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p className="break-words text-sm">{value}</p>
    </div>
  );
}

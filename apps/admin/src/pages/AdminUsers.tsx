import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, qs, type Paged } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import {
  Badge, Button, EmptyState, ErrorNote, Input, Loading, PageHeader,
  Pagination, Select, Table, Td, Th,
} from "@/components/ui";

interface AdminRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string };
}

interface RoleOption {
  id: string;
  name: string;
}

export function AdminUsersPage() {
  const { user, can } = useAuth();
  const { notify } = useToast();

  const [data, setData] = useState<Paged<AdminRow> | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [resetting, setResetting] = useState<AdminRow | null>(null);
  const [confirming, setConfirming] = useState<AdminRow | null>(null);

  const [form, setForm] = useState({ email: "", name: "", password: "", roleId: "" });
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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
        setData(await api.get<Paged<AdminRow>>(`/admin-users${qs({ page, perPage: 20, search: search || undefined })}`, signal));
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

  useEffect(() => {
    if (!can("role:read")) return;
    api
      .get<{ items: RoleOption[] }>("/roles")
      .then((r) => setRoles(r.items))
      .catch(() => setRoles([]));
  }, [can]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await api.post("/admin-users", form);
      notify("Administrator created");
      setCreating(false);
      setForm({ email: "", name: "", password: "", roleId: "" });
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.fieldErrors);
      } else setFormError("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.patch(`/admin-users/${editing.id}`, {
        name: editing.name,
        roleId: editing.role.id,
        isActive: editing.isActive,
      });
      notify("Administrator updated");
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetting) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await api.post(`/admin-users/${resetting.id}/reset-password`, { password: newPassword });
      notify("Password reset; their sessions were ended");
      setResetting(null);
      setNewPassword("");
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.fieldErrors);
      } else setFormError("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await api.del(`/admin-users/${confirming.id}`);
      notify("Administrator removed");
      setConfirming(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not remove", "error");
    } finally {
      setBusy(false);
    }
  };

  const canWrite = can("admin:write");

  return (
    <>
      <PageHeader
        title="Administrators"
        description="Staff accounts and the role each one holds."
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setForm({ email: "", name: "", password: "", roleId: roles[0]?.id ?? "" });
                setFormError(null);
                setFieldErrors({});
                setCreating(true);
              }}
            >
              New administrator
            </Button>
          ) : null
        }
      />

      <div className="mb-4">
        <input
          className="field max-w-xs"
          placeholder="Search name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search administrators"
        />
      </div>

      {error && <ErrorNote message={error} />}

      {!data && !error ? (
        <Loading />
      ) : data && data.items.length === 0 ? (
        <div className="panel"><EmptyState title="No administrators match" /></div>
      ) : data ? (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>State</Th>
                <Th>Last signed in</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => {
                const isSelf = a.id === user?.id;
                return (
                  <tr key={a.id} className="transition-colors hover:bg-raised/50">
                    <Td>
                      <span className="font-medium">{a.name}</span>
                      {isSelf && <span className="ml-2 text-[0.6875rem] text-faint">(you)</span>}
                      <span className="block text-xs text-faint">{a.email}</span>
                    </Td>
                    <Td><Badge tone="accent">{a.role.name}</Badge></Td>
                    <Td>
                      {a.isActive ? (
                        <Badge tone="accent">active</Badge>
                      ) : (
                        <Badge tone="danger">disabled</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-faint" title={formatDateTime(a.lastLoginAt)}>
                      {a.lastLoginAt ? relativeTime(a.lastLoginAt) : "never"}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {canWrite && (
                          <>
                            <Button size="sm" onClick={() => { setEditing({ ...a }); setFormError(null); }}>
                              Edit
                            </Button>
                            <Button size="sm" onClick={() => { setResetting(a); setNewPassword(""); setFormError(null); }}>
                              Reset password
                            </Button>
                          </>
                        )}
                        {can("admin:delete") && !isSelf && (
                          <Button size="sm" variant="danger" onClick={() => setConfirming(a)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            onPage={setPage}
          />
        </>
      ) : null}

      {/* Create */}
      <Modal
        open={creating}
        title="New administrator"
        description="They sign in with this email and password."
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="submit" form="create-admin" loading={busy}>Create</Button>
          </>
        }
      >
        <form id="create-admin" onSubmit={create} className="space-y-4" noValidate>
          {formError && <ErrorNote message={formError} />}
          <Input label="Full name" required value={form.name} error={fieldErrors.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} error={fieldErrors.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Temporary password" type="text" required value={form.password}
            error={fieldErrors.password}
            hint="At least 12 characters with upper case, lower case and a digit. Ask them to change it after signing in."
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label="Role" required value={form.roleId} error={fieldErrors.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            <option value="">Select a role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={editing !== null}
        title="Edit administrator"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="submit" form="edit-admin" loading={busy}>Save changes</Button>
          </>
        }
      >
        {editing && (
          <form id="edit-admin" onSubmit={saveEdit} className="space-y-4" noValidate>
            {formError && <ErrorNote message={formError} />}
            <Input label="Full name" required value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Select
              label="Role"
              value={editing.role.id}
              disabled={editing.id === user?.id}
              hint={editing.id === user?.id ? "You cannot change your own role." : undefined}
              onChange={(e) => {
                const r = roles.find((x) => x.id === e.target.value);
                if (r) setEditing({ ...editing, role: r });
              }}
            >
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.isActive}
                disabled={editing.id === user?.id}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                className="h-4 w-4 accent-[#1677E8]"
              />
              Account is active
              {editing.id === user?.id && (
                <span className="text-xs text-faint">(you cannot disable yourself)</span>
              )}
            </label>
          </form>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={resetting !== null}
        title="Reset password"
        description={resetting ? `For ${resetting.email}. Their other sessions will end.` : undefined}
        onClose={() => setResetting(null)}
        footer={
          <>
            <Button onClick={() => setResetting(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="submit" form="reset-pw" loading={busy}>Reset</Button>
          </>
        }
      >
        <form id="reset-pw" onSubmit={resetPassword} className="space-y-4" noValidate>
          {formError && <ErrorNote message={formError} />}
          <Input
            label="New password"
            type="text"
            required
            value={newPassword}
            error={fieldErrors.password}
            hint="At least 12 characters with upper case, lower case and a digit."
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </form>
      </Modal>

      <Confirm
        open={confirming !== null}
        title="Remove this administrator?"
        message="Their account is deleted and they lose access immediately."
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

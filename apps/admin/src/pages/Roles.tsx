/**
 * Roles and permissions.
 *
 * The matrix is the real control surface: a permission ticked here is
 * what the API checks on every request. Two rules are enforced by the
 * server and surfaced here so they are not a surprise:
 *
 *  - Super Admin always holds everything, and cannot be edited
 *  - nobody can grant a permission they do not hold themselves
 */

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Confirm, Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  Notice,
  PageHeader,
  SectionHeading,
  Textarea,
} from "@/components/ui";

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

interface Permission {
  id: string;
  key: string;
  description: string | null;
  group: string;
}

const SUPER_ADMIN = "Super Admin";

export function RolesPage() {
  const { user, can } = useAuth();
  const { notify } = useToast();
  const { run, isBusy } = useAction();

  const roles = useQuery<{ items: Role[] }>("/roles");
  const permissions = useQuery<{ groups: Record<string, Permission[]> }>("/roles/permissions");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const canWrite = can("role:write");
  const held = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const list = roles.data?.items ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0] ?? null;
  const groups = permissions.data?.groups ?? {};

  // The working copy of the selected role's permissions.
  const current = draft ?? new Set(selected?.permissions ?? []);
  const dirty =
    draft !== null &&
    selected !== undefined &&
    selected !== null &&
    (draft.size !== selected.permissions.length ||
      selected.permissions.some((p) => !draft.has(p)));

  const pick = (role: Role) => {
    setSelectedId(role.id);
    setDraft(null);
  };

  const toggle = (key: string) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft(next);
  };

  const toggleGroup = (group: string, on: boolean) => {
    const next = new Set(current);
    for (const p of groups[group] ?? []) {
      // Never offer to grant something the caller does not hold.
      if (on && !held.has(p.key)) continue;
      if (on) next.add(p.key);
      else next.delete(p.key);
    }
    setDraft(next);
  };

  const save = async () => {
    if (!selected || !draft) return;
    const result = await run("save", () =>
      api.put<{ note: string }>(`/roles/${selected.id}/permissions`, {
        permissionKeys: [...draft],
      })
    );
    if (result.ok) {
      notify(`"${selected.name}" permissions updated`, "success", result.value.note);
      setDraft(null);
      await roles.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const result = await run("delete", () => api.del(`/roles/${deleting.id}`));
    if (result.ok) {
      notify("Role deleted");
      setDeleting(null);
      setSelectedId(null);
      await roles.reload();
    } else {
      notify(result.error, "error");
    }
  };

  const locked = selected?.name === SUPER_ADMIN;

  return (
    <>
      <PageHeader
        title="Roles and permissions"
        description="What each role may do. The server checks these on every request, so a permission removed here is refused immediately — not merely hidden."
        breadcrumbs={[{ label: "Administration" }, { label: "Roles" }]}
        actions={
          canWrite ? (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              New role
            </Button>
          ) : null
        }
      />

      {roles.error && <ErrorNote message={roles.error} onRetry={roles.reload} />}

      {roles.initial || permissions.initial ? (
        <Loading label="Loading roles" />
      ) : list.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon="lock" title="No roles" hint="Run the database seed to create them." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* ── Role list ───────────────────────────────── */}
          <aside className="space-y-2">
            {list.map((r) => {
              const active = r.id === selected?.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r)}
                  className={`panel w-full p-4 text-left transition-colors ${
                    active ? "border-accent bg-accent-soft/40" : "hover:border-line-strong"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    {r.name === SUPER_ADMIN && <Icon name="lock" size={13} className="mt-0.5 text-faint" />}
                  </div>
                  {r.description && (
                    <p className="mt-1 text-xs leading-relaxed text-faint clamp-2">{r.description}</p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge tone={active ? "accent" : "neutral"}>{r.permissions.length} permissions</Badge>
                    <Badge>{r.userCount} user{r.userCount === 1 ? "" : "s"}</Badge>
                    {r.isSystem && <Badge tone="neutral">System</Badge>}
                  </div>
                </button>
              );
            })}
          </aside>

          {/* ── Permission matrix ───────────────────────── */}
          <div className="min-w-0">
            {selected && (
              <Card padded={false}>
                <div className="border-b border-line px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold">{selected.name}</h2>
                      {selected.description && (
                        <p className="mt-1 max-w-xl text-xs leading-relaxed text-faint">
                          {selected.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canWrite && !selected.isSystem && selected.userCount === 0 && (
                        <Button size="sm" variant="danger" icon="trash" onClick={() => setDeleting(selected)}>
                          Delete role
                        </Button>
                      )}
                      {dirty && (
                        <>
                          <Button size="sm" onClick={() => setDraft(null)}>
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            icon="check"
                            loading={isBusy("save")}
                            onClick={() => void save()}
                          >
                            Save permissions
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  {locked ? (
                    <Notice tone="info" icon="lock">
                      The Super Admin role always holds every permission. That is deliberate: it
                      guarantees there is always a way back into the portal, so it cannot be edited
                      here.
                    </Notice>
                  ) : (
                    <Notice tone="info" icon="shield">
                      You can only grant permissions you hold yourself. Anything beyond your own
                      access is shown greyed out, and the server would refuse it regardless.
                    </Notice>
                  )}

                  {Object.entries(groups).map(([group, perms]) => {
                    const grantable = perms.filter((p) => held.has(p.key));
                    const all = grantable.length > 0 && grantable.every((p) => current.has(p.key));
                    const some = perms.some((p) => current.has(p.key));

                    return (
                      <div key={group} className="panel-sunken p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold">{group}</p>
                          {!locked && canWrite && grantable.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleGroup(group, !all)}
                              className="text-[0.6875rem] text-accent-ice underline-offset-2 hover:underline"
                            >
                              {all ? "Clear all" : "Select all"}
                            </button>
                          )}
                          {some && !all && <Badge tone="caution">Partial</Badge>}
                        </div>

                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {perms.map((p) => {
                            const grantableByMe = held.has(p.key);
                            return (
                              <div key={p.key} className={grantableByMe ? "" : "opacity-50"}>
                                <Checkbox
                                  label={p.description ?? p.key}
                                  hint={p.key}
                                  checked={locked ? true : current.has(p.key)}
                                  disabled={locked || !canWrite || !grantableByMe}
                                  onChange={() => toggle(p.key)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {creating && (
        <CreateRole
          groups={groups}
          held={held}
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            setSelectedId(id);
            await roles.reload();
          }}
        />
      )}

      <Confirm
        open={deleting !== null}
        title="Delete this role?"
        message={`"${deleting?.name}" will be removed.`}
        warning="A role still held by an administrator cannot be deleted; move them to another role first."
        confirmLabel="Delete role"
        destructive
        busy={isBusy("delete")}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/* ── Create ───────────────────────────────────────────────── */

function CreateRole({
  groups,
  held,
  onClose,
  onCreated,
}: {
  groups: Record<string, Permission[]>;
  held: Set<string>;
  onClose(): void;
  onCreated(id: string): void;
}) {
  const { notify } = useToast();
  const { run, isBusy } = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };

  const submit = async () => {
    setError(null);
    const result = await run("save", () =>
      api.post<{ item: Role }>("/roles", {
        name,
        description: description || null,
        permissionKeys: [...picked],
      })
    );
    if (result.ok) {
      notify(`Role "${name}" created`);
      onCreated(result.value.item.id);
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal
      open
      title="New role"
      description="A role is a named set of permissions you can assign to administrators."
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={isBusy("save")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            loading={isBusy("save")}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            Create role
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}

        <Input
          label="Role name"
          required
          placeholder="Partnerships Manager"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Textarea
          label="Description"
          rows={2}
          hint="What this role is for. Shown to whoever assigns it."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <SectionHeading
          title="Permissions"
          description="Only permissions you hold yourself are offered."
        />

        <div className="space-y-3">
          {Object.entries(groups).map(([group, perms]) => {
            const grantable = perms.filter((p) => held.has(p.key));
            if (grantable.length === 0) return null;
            return (
              <div key={group} className="panel-sunken p-3">
                <p className="mb-2 text-xs font-semibold">{group}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {grantable.map((p) => (
                    <Checkbox
                      key={p.key}
                      label={p.description ?? p.key}
                      hint={p.key}
                      checked={picked.has(p.key)}
                      onChange={() => toggle(p.key)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-faint">
          {picked.size} permission{picked.size === 1 ? "" : "s"} selected.
        </p>
      </div>
    </Modal>
  );
}

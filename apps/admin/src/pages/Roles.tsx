import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Button, ErrorNote, Loading, PageHeader } from "@/components/ui";

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

export function RolesPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [groups, setGroups] = useState<Record<string, Permission[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [r, p] = await Promise.all([
        api.get<{ items: Role[] }>("/roles"),
        api.get<{ groups: Record<string, Permission[]> }>("/roles/permissions"),
      ]);
      setRoles(r.items);
      setGroups(p.groups);
      setSelected((s) => s ?? r.items.find((x) => x.name !== "Super Admin")?.id ?? r.items[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = roles?.find((r) => r.id === selected) ?? null;

  useEffect(() => {
    if (current) setDraft(new Set(current.permissions));
  }, [current?.id, current?.permissions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: string) => {
    setDraft((d) => {
      const next = new Set(d);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await api.put(`/roles/${current.id}/permissions`, { permissionKeys: [...draft] });
      notify(`Permissions updated for ${current.name}`);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (!roles) return <Loading />;

  const canWrite = can("role:write");
  const locked = current?.name === "Super Admin";
  const dirty =
    current &&
    (draft.size !== current.permissions.length ||
      current.permissions.some((p) => !draft.has(p)));

  return (
    <>
      <PageHeader
        title="Roles"
        description="What each role may do. Permissions are stored as data, so changing them needs no deployment."
      />

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <ul className="space-y-2">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r.id)}
                className={`w-full rounded-card border p-3 text-left transition-colors ${
                  r.id === selected
                    ? "border-accent/45 bg-accent-soft"
                    : "border-line bg-panel hover:border-[#39414F]"
                }`}
              >
                <span className="block text-sm font-medium">{r.name}</span>
                <span className="mt-0.5 block text-xs text-faint">
                  {r.permissions.length} permissions · {r.userCount} user{r.userCount === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {current && (
          <div className="panel p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{current.name}</h2>
                {current.description && (
                  <p className="mt-1 max-w-xl text-sm text-body">{current.description}</p>
                )}
              </div>
              {canWrite && !locked && (
                <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
                  {dirty ? "Save changes" : "Saved"}
                </Button>
              )}
            </div>

            {locked && (
              <div className="mb-4 rounded-inner border border-line bg-raised px-3 py-2 text-xs text-body">
                The Super Admin role always holds every permission and cannot be edited. This stops
                the last route into the portal being removed by accident.
              </div>
            )}

            <div className="space-y-5">
              {Object.entries(groups).map(([group, perms]) => (
                <section key={group}>
                  <h3 className="label mb-2">{group}</h3>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {perms.map((p) => {
                      const on = locked ? true : draft.has(p.key);
                      return (
                        <li key={p.id}>
                          <label
                            className={`flex items-start gap-2.5 rounded-inner border px-3 py-2 text-sm ${
                              on ? "border-accent/35 bg-accent-soft/60" : "border-line-soft bg-canvas/50"
                            } ${canWrite && !locked ? "cursor-pointer" : "cursor-default"}`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!canWrite || locked}
                              onChange={() => toggle(p.key)}
                              className="mt-0.5 h-4 w-4 accent-[#1677E8]"
                            />
                            <span>
                              <span className="block font-mono text-[0.6875rem] text-accent-ice">{p.key}</span>
                              {p.description && (
                                <span className="block text-xs text-faint">{p.description}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <p className="mt-5 border-t border-line pt-4 text-xs text-faint">
              A change takes effect for a signed-in user within one token refresh cycle.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Badge, Button, ErrorNote, Input, PageHeader } from "@/components/ui";

export function AccountPage() {
  const { user, signOut } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (newPassword !== confirm) {
      setFieldErrors({ confirm: "The two passwords do not match" });
      return;
    }

    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      notify("Password changed. Please sign in again.");
      // The API ends every session on a password change, so follow it.
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Your account" description="Your details and sign-in security." />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="label mb-3">Details</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-faint">Name</dt>
              <dd>{user?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Role</dt>
              <dd><Badge tone="accent">{user?.role}</Badge></dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Last signed in</dt>
              <dd>{formatDateTime(user?.lastLoginAt)}</dd>
            </div>
          </dl>

          <h3 className="label mb-2 mt-6">Your permissions</h3>
          <ul className="flex flex-wrap gap-1.5">
            {user?.permissions.map((p) => (
              <li key={p}>
                <span className="rounded-full border border-line bg-raised px-2 py-0.5 font-mono text-[0.625rem] text-body">
                  {p}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <h2 className="label mb-3">Change password</h2>
          <p className="mb-4 text-xs text-faint">
            Changing your password signs you out of every device, including this one.
          </p>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <ErrorNote message={error} />}
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              error={fieldErrors.currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              error={fieldErrors.newPassword}
              hint="At least 12 characters, with upper case, lower case and a digit."
              onChange={(e) => setNext(e.target.value)}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              error={fieldErrors.confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={busy}>Change password</Button>
          </form>
        </div>
      </div>
    </>
  );
}

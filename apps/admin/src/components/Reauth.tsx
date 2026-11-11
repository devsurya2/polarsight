/**
 * Re-authentication prompt.
 *
 * The API gates its most sensitive actions — administrators, roles,
 * settings, exports, resume downloads, deleting media — behind a fresh
 * password (and second factor, if enrolled). When a request is refused
 * with REAUTH_REQUIRED the API client calls this prompt, waits for the
 * user to confirm, and retries. Nothing the user typed is kept.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, setReauthHandler } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, ErrorNote, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";

export function ReauthProvider() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
    setPassword("");
    setCode("");
    setError(null);
  }, []);

  useEffect(() => {
    setReauthHandler(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setOpen(true);
        })
    );
    return () => setReauthHandler(null);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reauth", user?.mfaEnabled ? { password, code } : { password });
      finish(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open || !user) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4"
    >
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-6" noValidate>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-accent">
            <Icon name="lock" size={18} />
          </span>
          <div>
            <h2 id="reauth-title" className="text-sm font-semibold">
              Confirm it is you
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-body">
              This action is sensitive. Enter your password{user.mfaEnabled ? " and a code from your authenticator" : ""} to
              continue. You will not be asked again for ten minutes.
            </p>
          </div>
        </div>

        {error && <ErrorNote message={error} />}

        <Input
          label="Password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {user.mfaEnabled && (
          <Input
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123 456 or a recovery code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => finish(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!password || (user.mfaEnabled && !code)}>
            Confirm
          </Button>
        </div>
      </form>
    </div>
  );
}

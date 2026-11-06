import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button, ErrorNote, Input, Loading } from "@/components/ui";

export function Login() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading label="Checking your session" />;
  if (user) return <Navigate to={location.state?.from ?? "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(location.state?.from ?? "/", { replace: true });
    } catch (err) {
      // The API returns one message for both a wrong password and an
      // unknown account; surfacing it verbatim keeps that property.
      setError(err instanceof ApiError ? err.message : "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-2.5">
          <img src="/favicon.png" alt="" className="h-8 w-auto object-contain" />
          <span className="text-lg font-semibold tracking-tight">
            POLARSIGHT <span className="font-normal text-faint">Admin</span>
          </span>
        </div>

        <div className="panel p-6">
          <h1 className="text-base font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-faint">Staff access only.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {error && <ErrorNote message={error} />}

            <Input
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@polarsight.in"
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" variant="primary" loading={busy} className="w-full">
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          Sign-in attempts are rate limited and recorded.
        </p>
      </div>
    </div>
  );
}

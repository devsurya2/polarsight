import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { Button, ErrorNote, Input, Loading } from "@/components/ui";

export function Login() {
  const { user, loading, signIn, completeMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading label="Checking your session" />;

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    // A role that requires a second factor sends the account straight
    // to enrolment; the API refuses everything else until it is done.
    if (user.mfaSetupRequired) return <Navigate to="/account" replace />;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  const afterSignIn = (setupRequired: boolean) => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(setupRequired ? "/account" : from && from !== "/login" ? from : "/", { replace: true });
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(email, password);
      if (result.mfaRequired) {
        // Keep the password out of memory from here on.
        setPassword("");
        setChallenge(result.challenge);
      } else {
        afterSignIn(result.user.mfaSetupRequired);
      }
    } catch (err) {
      // The API returns the same message whether the account exists or
      // the password is wrong, so this screen cannot be used to work
      // out which addresses are registered.
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const signedIn = await completeMfa(challenge, code);
      afterSignIn(signedIn.mfaSetupRequired);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify that code.");
      if (err instanceof ApiError && /expired/i.test(err.message)) {
        setChallenge(null);
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/favicon.png" alt="" className="mb-4 h-10 w-10 object-contain" />
          <h1 className="text-lg font-semibold tracking-tight">
            POLARSIGHT <span className="font-normal text-faint">Admin</span>
          </h1>
          <p className="mt-1.5 text-sm text-body">
            {challenge ? "Enter the code from your authenticator." : "Sign in to manage the website."}
          </p>
        </div>

        {challenge ? (
          <form onSubmit={submitCode} className="panel space-y-4 p-6" noValidate>
            {error && <ErrorNote message={error} />}

            <Input
              label="Authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="123 456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={code.trim().length < 6}>
              Verify and sign in
            </Button>

            <p className="text-xs leading-relaxed text-faint">
              Lost your device? Enter one of your recovery codes instead. Each works once.
            </p>
            <button
              type="button"
              className="text-xs text-body underline"
              onClick={() => {
                setChallenge(null);
                setCode("");
                setError(null);
              }}
            >
              Start again
            </button>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="panel space-y-4 p-6" noValidate>
            {error && <ErrorNote message={error} />}

            <Input
              label="Email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!email || !password}>
              Sign in
            </Button>

            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-faint">
              <Icon name="lock" size={13} className="mt-0.5" />
              Repeated failed attempts lock the account for a short period. Ask a Super Admin if you
              are locked out.
            </p>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-faint">
          Authorised administrators only. Every action in this portal is recorded.
        </p>
      </div>
    </div>
  );
}

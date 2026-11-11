import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setSessionLostHandler } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  lastLoginAt?: string | null;
  mfaEnabled: boolean;
  /** The role requires a second factor and this account has none yet. */
  mfaSetupRequired: boolean;
  recoveryCodesLeft?: number;
}

export type SignInResult = { mfaRequired: true; challenge: string } | { mfaRequired: false; user: CurrentUser };

interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Second step of sign-in, with the challenge from the first. */
  completeMfa(challenge: string, code: string): Promise<CurrentUser>;
  signOut(): Promise<void>;
  /** True when the current user holds every listed permission. */
  can(...required: string[]): boolean;
  canAny(...accepted: string[]): boolean;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: CurrentUser }>("/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    }
  }, []);

  // On boot, try to adopt an existing cookie session.
  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  // When a refresh cannot recover the session, drop the user so the
  // router sends them to sign-in rather than rendering empty screens.
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    return () => setSessionLostHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const res = await api.post<{ user?: CurrentUser; mfaRequired?: boolean; challenge?: string }>(
      "/auth/login",
      { email, password }
    );
    if (res.mfaRequired && res.challenge) return { mfaRequired: true, challenge: res.challenge };
    setUser(res.user!);
    return { mfaRequired: false, user: res.user! };
  }, []);

  const completeMfa = useCallback(async (challenge: string, code: string) => {
    const { user } = await api.post<{ user: CurrentUser }>("/auth/mfa/verify", { challenge, code });
    setUser(user);
    return user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthValue>(() => {
    const held = new Set(user?.permissions ?? []);
    return {
      user,
      loading,
      signIn,
      completeMfa,
      signOut,
      can: (...required) => required.every((p) => held.has(p)),
      canAny: (...accepted) => accepted.some((p) => held.has(p)),
      refreshUser: load,
    };
  }, [user, loading, signIn, completeMfa, signOut, load]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

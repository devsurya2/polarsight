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
}

interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { user } = await api.post<{ user: CurrentUser }>("/auth/login", { email, password });
    setUser(user);
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
      signOut,
      can: (...required) => required.every((p) => held.has(p)),
      canAny: (...accepted) => accepted.some((p) => held.has(p)),
      refreshUser: load,
    };
  }, [user, loading, signIn, signOut, load]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

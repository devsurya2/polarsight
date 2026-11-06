import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from "react";

type Kind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

interface ToastValue {
  notify(message: string, kind?: Kind): void;
}

const ToastContext = createContext<ToastValue | null>(null);

const STYLES: Record<Kind, string> = {
  success: "border-accent/40 bg-accent-soft text-accent-ice",
  error: "border-danger/40 bg-danger-soft text-danger",
  info: "border-line bg-raised text-ink",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-inner border px-4 py-3 text-sm shadow-lg ${STYLES[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./Icon";

type Kind = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  kind: Kind;
  message: string;
  detail?: string;
}

interface ToastValue {
  notify(message: string, kind?: Kind, detail?: string): void;
}

const ToastContext = createContext<ToastValue | null>(null);

const STYLES: Record<Kind, { className: string; icon: IconName }> = {
  success: { className: "border-positive/40 bg-positive-soft text-positive", icon: "check" },
  error: { className: "border-danger/40 bg-danger-soft text-danger", icon: "alert" },
  warning: { className: "border-caution/40 bg-caution-soft text-caution", icon: "alert" },
  info: { className: "border-line bg-raised text-ink", icon: "info" },
};

/** Errors stay long enough to read and act on; confirmations do not. */
const LIFETIME: Record<Kind, number> = {
  success: 4_000,
  info: 5_000,
  warning: 8_000,
  error: 10_000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, kind: Kind = "success", detail?: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-4), { id, kind, message, detail }]);
      window.setTimeout(() => dismiss(id), LIFETIME[kind]);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const style = STYLES[t.kind];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-inner border px-3.5 py-3 text-sm shadow-lg animate-in ${style.className}`}
            >
              <Icon name={style.icon} size={15} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="leading-snug">{t.message}</p>
                {t.detail && <p className="mt-1 text-xs leading-snug opacity-80">{t.detail}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

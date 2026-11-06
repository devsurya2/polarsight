import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/* ── Button ───────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-strong text-white hover:bg-accent disabled:hover:bg-accent-strong",
  secondary: "bg-raised text-ink border border-line hover:border-[#39414F]",
  ghost: "text-body hover:text-ink hover:bg-raised",
  danger: "bg-danger-soft text-danger border border-danger/40 hover:bg-danger hover:text-white",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-inner font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/* ── Form fields ──────────────────────────────────────────── */

interface FieldWrap {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

function Wrap({ label, hint, error, required, children }: FieldWrap & { children: ReactNode }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-body">
          {label}
          {required && <span className="text-danger">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({
  label, hint, error, required, className = "", ...rest
}: FieldWrap & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrap label={label} hint={hint} error={error} required={required}>
      <input
        {...rest}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`field ${error ? "border-danger" : ""} ${className}`}
      />
    </Wrap>
  );
}

export function Textarea({
  label, hint, error, required, rows = 4, className = "", ...rest
}: FieldWrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrap label={label} hint={hint} error={error} required={required}>
      <textarea
        {...rest}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`field resize-y leading-relaxed ${error ? "border-danger" : ""} ${className}`}
      />
    </Wrap>
  );
}

export function Select({
  label, hint, error, required, children, className = "", ...rest
}: FieldWrap & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrap label={label} hint={hint} error={error} required={required}>
      <select {...rest} className={`field cursor-pointer ${error ? "border-danger" : ""} ${className}`}>
        {children}
      </select>
    </Wrap>
  );
}

/* ── Display ──────────────────────────────────────────────── */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-raised text-body border-line",
  accent: "bg-accent-soft text-accent-ice border-accent/35",
  success: "bg-accent-soft text-accent-ice border-accent/35",
  warn: "bg-raised text-ink border-line",
  danger: "bg-danger-soft text-danger border-danger/35",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "PUBLISHED" ? "accent" :
    status === "NEW" ? "accent" :
    status === "SPAM" ? "danger" :
    status === "CLOSED" ? "neutral" : "warn";
  return <Badge tone={tone}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-body">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-faint">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-inner border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-faint">
      <Spinner />
      {label}
    </div>
  );
}

/* ── Table ────────────────────────────────────────────────── */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`border-b border-line px-4 py-3 text-left text-xs font-medium text-faint ${className}`}>
      {children}
    </th>
  );
}

export function Td({
  children, className = "", title,
}: { children?: ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={`border-b border-line-soft px-4 py-3 align-middle ${className}`}>
      {children}
    </td>
  );
}

export function Pagination({
  page, totalPages, total, onPage,
}: { page: number; totalPages: number; total: number; onPage(p: number): void }) {
  if (total === 0) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-faint">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </div>
  );
}

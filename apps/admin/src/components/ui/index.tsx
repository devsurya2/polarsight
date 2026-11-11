/**
 * The admin portal's UI primitives.
 *
 * Everything a screen renders comes from here, so spacing, borders,
 * focus rings and status colours stay consistent without each page
 * re-deciding them. No component here performs an action of its own:
 * they are presentation, and the pages own the behaviour.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../Icon";

/* ── Button ───────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "xs" | "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent-strong text-white hover:bg-accent disabled:hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]",
  secondary: "bg-raised text-ink border border-line hover:border-line-strong",
  ghost: "text-body hover:text-ink hover:bg-raised",
  subtle: "bg-transparent text-body border border-line hover:text-ink hover:border-line-strong",
  danger:
    "bg-danger-soft text-danger border border-danger/40 hover:bg-danger hover:text-white hover:border-danger",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2 text-[0.6875rem] gap-1",
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: IconName;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-inner font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : icon ? (
        <Icon name={icon} size={size === "md" ? 16 : 14} />
      ) : null}
      {children}
    </button>
  );
}

/** A link styled as a button, for navigation rather than an action. */
export function LinkButton({
  to,
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex shrink-0 items-center justify-center rounded-inner font-medium transition-colors ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {icon && <Icon name={icon} size={size === "md" ? 16 : 14} />}
      {children}
    </Link>
  );
}

/** An icon-only control. Requires a label, which becomes its tooltip. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "sm",
  ...rest
}: Omit<ButtonProps, "children" | "icon"> & { icon: IconName; label: string }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-inner transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${
        size === "xs" ? "h-7 w-7" : size === "sm" ? "h-8 w-8" : "h-10 w-10"
      }`}
    >
      <Icon name={icon} size={size === "md" ? 18 : 15} />
    </button>
  );
}

/* ── Form fields ──────────────────────────────────────────── */

interface FieldWrap {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Shown to the right of the label, e.g. a character count. */
  aside?: ReactNode;
}

function Wrap({
  label,
  hint,
  error,
  required,
  aside,
  htmlFor,
  children,
}: FieldWrap & { htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="flex items-center gap-1 text-xs font-medium text-body">
            {label}
            {required && (
              <span className="text-danger" aria-hidden>
                *
              </span>
            )}
          </label>
          {aside && <span className="text-[0.6875rem] text-faint">{aside}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="mt-1 flex items-start gap-1 text-xs text-danger">
          <Icon name="alert" size={13} className="mt-px" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  required,
  aside,
  className = "",
  id,
  ...rest
}: FieldWrap & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap
      label={label}
      hint={hint}
      error={error}
      required={required}
      aside={aside}
      htmlFor={fieldId}
    >
      <input
        {...rest}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`field ${className}`}
      />
    </Wrap>
  );
}

export function Textarea({
  label,
  hint,
  error,
  required,
  aside,
  rows = 4,
  className = "",
  id,
  ...rest
}: FieldWrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap
      label={label}
      hint={hint}
      error={error}
      required={required}
      aside={aside}
      htmlFor={fieldId}
    >
      <textarea
        {...rest}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`field resize-y leading-relaxed ${className}`}
      />
    </Wrap>
  );
}

export function Select({
  label,
  hint,
  error,
  required,
  aside,
  children,
  className = "",
  id,
  ...rest
}: FieldWrap & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap
      label={label}
      hint={hint}
      error={error}
      required={required}
      aside={aside}
      htmlFor={fieldId}
    >
      <div className="relative">
        <select
          {...rest}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={`field cursor-pointer appearance-none pr-8 ${className}`}
        >
          {children}
        </select>
        <Icon
          name="chevronDown"
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
        />
      </div>
    </Wrap>
  );
}

export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? "border-accent bg-accent text-white" : "border-line bg-canvas"
        }`}
      >
        {checked && <Icon name="check" size={11} strokeWidth={2.6} />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm leading-snug">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-faint">{hint}</span>}
      </span>
    </label>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
          checked ? "border-accent bg-accent" : "border-line bg-raised"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-[left] duration-150 ${
            checked ? "left-[1.1rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * A list of short strings, one per line.
 *
 * Deliberately a textarea rather than a repeater: an editor pasting
 * eight bullet points should not have to click "add" eight times.
 */
export function StringList({
  label,
  hint,
  error,
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  label?: string;
  hint?: string;
  error?: string;
  value: string[];
  onChange(next: string[]): void;
  rows?: number;
  placeholder?: string;
}) {
  // Kept as text while editing, so a blank line mid-typing is not
  // swallowed the moment it is created.
  const [text, setText] = useState(() => value.join("\n"));
  const lastEmitted = useRef(value.join("\n"));

  useEffect(() => {
    const joined = value.join("\n");
    if (joined !== lastEmitted.current) {
      setText(joined);
      lastEmitted.current = joined;
    }
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    const list = next
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    lastEmitted.current = list.join("\n");
    onChange(list);
  };

  const count = text.split("\n").filter((s) => s.trim()).length;

  return (
    <Textarea
      label={label}
      hint={hint ?? "One per line."}
      error={error}
      rows={rows}
      value={text}
      placeholder={placeholder}
      aside={count > 0 ? `${count} item${count === 1 ? "" : "s"}` : undefined}
      onChange={(e) => commit(e.target.value)}
    />
  );
}

/* ── Display ──────────────────────────────────────────────── */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type Tone = "neutral" | "accent" | "positive" | "caution" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-raised text-body border-line",
  accent: "bg-accent-soft text-accent-ice border-accent/35",
  positive: "bg-positive-soft text-positive border-positive/35",
  caution: "bg-caution-soft text-caution border-caution/35",
  danger: "bg-danger-soft text-danger border-danger/35",
  info: "bg-info-soft text-info border-info/35",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${TONES[tone]}`}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

/** Human wording for an enum value: NOT_STARTED → "not started". */
export const humanise = (value: string) =>
  value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/**
 * Status colouring, shared by every table so a word means the same
 * thing wherever it appears.
 */
const STATUS_TONES: Record<string, Tone> = {
  // Publishing
  PUBLISHED: "positive",
  DRAFT: "caution",
  ARCHIVED: "neutral",
  // Enquiries
  NEW: "info",
  IN_PROGRESS: "caution",
  UNDER_REVIEW: "caution",
  CONTACTED: "accent",
  FOLLOW_UP_REQUIRED: "caution",
  CONVERTED: "positive",
  CLOSED: "neutral",
  SPAM: "danger",
  // Applications
  SHORTLISTED: "accent",
  INTERVIEW_SCHEDULED: "accent",
  TECHNICAL_ASSESSMENT: "accent",
  DEMO_SESSION: "accent",
  SELECTED: "positive",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{humanise(status)}</Badge>;
}

/* ── Page furniture ───────────────────────────────────────── */

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-faint">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <Icon name="chevronRight" size={12} className="text-line-strong" />}
            {c.to && i < items.length - 1 ? (
              <Link to={c.to} className="transition-colors hover:text-body">
                {c.label}
              </Link>
            ) : (
              <span className={i === items.length - 1 ? "text-body" : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Badges or counts shown beside the title. */
  meta?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {meta}
          </div>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-body">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionHeading({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon && <Icon name={icon} size={15} className="text-faint" />}
          {title}
        </h2>
        {description && <p className="mt-1 max-w-xl text-xs leading-relaxed text-faint">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`panel ${padded ? "p-5" : ""} ${className}`}>{children}</div>;
}

/**
 * A dashboard figure.
 *
 * `value` is never formatted here beyond thousands separators: a card
 * that rounds or estimates would be a card that misleads.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  to,
  loading,
}: {
  label: string;
  value: number | string | null | undefined;
  sub?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  to?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="label">{label}</p>
        {icon && (
          <span className={`rounded-inner border p-1.5 ${TONES[tone]}`}>
            <Icon name={icon} size={14} />
          </span>
        )}
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-16" />
      ) : (
        <p className="tabular mt-2 text-2xl font-semibold leading-none">
          {typeof value === "number" ? value.toLocaleString() : (value ?? "—")}
        </p>
      )}
      {sub && <p className="mt-2 text-xs leading-snug text-faint">{sub}</p>}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="panel block p-4 transition-colors hover:border-line-strong hover:bg-raised/40"
      >
        {body}
      </Link>
    );
  }
  return <div className="panel p-4">{body}</div>;
}

export function EmptyState({
  title,
  hint,
  action,
  icon = "info",
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="rounded-full border border-line bg-raised p-3 text-faint">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm leading-relaxed text-faint">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-inner border border-danger/40 bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      <span className="flex items-start gap-2">
        <Icon name="alert" size={15} className="mt-0.5" />
        {message}
      </span>
      {onRetry && (
        <Button size="sm" variant="subtle" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
  icon = "info",
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-inner border px-3 py-2.5 text-xs leading-relaxed ${TONES[tone]}`}
    >
      <Icon name={icon} size={14} className="mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-faint">
      <Spinner />
      {label}…
    </div>
  );
}

/** Row-shaped placeholders, so a table does not jump when data lands. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel overflow-hidden">
      <div className="divide-y divide-line-soft">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="skeleton h-3.5"
                style={{ width: c === 0 ? "22%" : `${Math.max(10, 70 / cols)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
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

export function Th({
  children,
  className = "",
  sortable,
  active,
  dir,
  onSort,
}: {
  children?: ReactNode;
  className?: string;
  sortable?: boolean;
  active?: boolean;
  dir?: "asc" | "desc";
  onSort?: () => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`border-b border-line bg-panel px-4 py-3 text-left text-xs font-medium text-faint ${className}`}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={`inline-flex items-center gap-1 transition-colors hover:text-body ${active ? "text-body" : ""}`}
        >
          {children}
          <Icon
            name={active ? (dir === "asc" ? "chevronUp" : "chevronDown") : "chevronDown"}
            size={12}
            className={active ? "" : "opacity-30"}
          />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  children,
  className = "",
  title,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
  colSpan?: number;
}) {
  return (
    <td
      title={title}
      colSpan={colSpan}
      className={`border-b border-line-soft px-4 py-3 align-middle ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  onClick,
  busy,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors ${onClick ? "cursor-pointer" : ""} hover:bg-raised/40 ${busy ? "row-busy" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  perPage,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage?: number;
  onPage(p: number): void;
}) {
  if (total === 0) return null;
  const from = perPage ? (page - 1) * perPage + 1 : null;
  const to = perPage ? Math.min(page * perPage, total) : null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-faint">
      <span className="tabular">
        {from !== null
          ? `Showing ${from.toLocaleString()}–${to!.toLocaleString()} of ${total.toLocaleString()}`
          : `${total.toLocaleString()} total`}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" icon="chevronLeft" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <span className="tabular px-1">
          {page} / {totalPages}
        </span>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Next
          <Icon name="chevronRight" size={14} />
        </Button>
      </div>
    </div>
  );
}

/* ── Toolbar and filters ──────────────────────────────────── */

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-2.5">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
}: {
  value: string;
  onChange(next: string): void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Icon
        name="search"
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        className="field pl-9"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-ink"
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

/** A compact labelled select used in filter bars. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange(next: string): void;
  options: Array<{ value: string; label: string; count?: number }>;
  allLabel?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-body">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className="field cursor-pointer appearance-none pr-8 text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{allLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.count !== undefined ? ` (${o.count})` : ""}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          size={13}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
        />
      </div>
    </div>
  );
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange(next: { from: string; to: string }): void;
}) {
  return (
    <div className="flex items-end gap-2">
      <Input
        label="From"
        type="date"
        value={from}
        max={to || undefined}
        className="text-xs"
        onChange={(e) => onChange({ from: e.target.value, to })}
      />
      <Input
        label="To"
        type="date"
        value={to}
        min={from || undefined}
        className="text-xs"
        onChange={(e) => onChange({ from, to: e.target.value })}
      />
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────── */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; icon?: IconName; count?: number }>;
  active: string;
  onChange(id: string): void;
}) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              selected
                ? "border-accent text-ink"
                : "border-transparent text-body hover:border-line-strong hover:text-ink"
            }`}
          >
            {t.icon && <Icon name={t.icon} size={14} />}
            {t.label}
            {t.count !== undefined && (
              <span className="tabular rounded-full bg-raised px-1.5 text-[0.625rem] text-faint">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Key/value display ───────────────────────────────────── */

export function DescriptionList({
  items,
  columns = 2,
}: {
  items: Array<{ label: string; value: ReactNode }>;
  columns?: 1 | 2 | 3;
}) {
  const visible = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  if (visible.length === 0) return null;
  return (
    <dl
      className={`grid gap-x-6 gap-y-4 ${
        columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
      }`}
    >
      {visible.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="label mb-1">{i.label}</dt>
          <dd className="break-words text-sm leading-relaxed">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A list of short strings as chips. Renders nothing when empty. */
export function ChipList({ items, tone = "neutral" }: { items: string[]; tone?: Tone }) {
  if (!items?.length) return <span className="text-sm text-faint">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <Badge key={`${s}-${i}`} tone={tone}>
          {s}
        </Badge>
      ))}
    </div>
  );
}

/** A persistent bar offering to save or discard pending edits. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  message = "You have unsaved changes.",
  extra,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave(): void;
  onDiscard?: () => void;
  message?: string;
  extra?: ReactNode;
}) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-6 border-t border-line bg-panel/95 px-5 py-3 backdrop-blur animate-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-body">
          <Icon name="info" size={14} className="text-caution" />
          {message}
        </p>
        <div className="flex items-center gap-2">
          {extra}
          {onDiscard && (
            <Button size="sm" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button size="sm" variant="primary" icon="check" loading={saving} onClick={onSave}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

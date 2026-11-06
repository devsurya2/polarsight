/* Shared chrome for the small illustrative UI panels */
export function Frame({ title, status, children, className = "" }) {
  return (
    <div
      className={`surface-card overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <span className="t-label text-faint">
          {title}
        </span>
        {status && (
          <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-accent-ice">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {status}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Bar({ value, tone = "accent" }) {
  const bg =
    tone === "accent" ? "bg-accent" : tone === "ink" ? "bg-ink" : "bg-accent-ice";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand">
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export function Row({ children, className = "" }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-inner border border-line-soft bg-canvas/60 px-3 py-2.5 ${className}`}
    >
      {children}
    </div>
  );
}

export function Dot({ tone = "accent" }) {
  const bg =
    tone === "accent"
      ? "bg-accent"
      : tone === "ice"
        ? "bg-accent-ice"
        : tone === "ink"
          ? "bg-ink"
          : "bg-faint";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${bg}`} />;
}

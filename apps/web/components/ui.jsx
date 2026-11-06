"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

/* ───────────────────────────────────────────────────────────
   Shared primitives. Every section composes from these, so the
   page keeps one rhythm instead of drifting section by section.
   ─────────────────────────────────────────────────────────── */

/* One vertical rhythm for the whole page */
export function Section({ id, children, className = "", tight = false }) {
  return (
    <section
      id={id}
      className={`relative ${tight ? "py-16 md:py-20" : "py-20 md:py-28"} ${className}`}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}

/* Monospace eyebrow. `tone` keeps it legible on dark panels. */
export function Kicker({ children, tone = "light", className = "" }) {
  return (
    <p
      className={`t-label flex items-center gap-2.5 ${
        tone === "dark" ? "text-accent" : "text-accent-ice"
      } ${className}`}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </p>
  );
}

/* One heading block used by every section */
export function Heading({
  kicker,
  title,
  body,
  align = "left",
  tone = "light",
  className = "",
}) {
  const centered = align === "center";
  const dark = tone === "dark";

  return (
    <div
      className={`${centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"} ${className}`}
    >
      {kicker && (
        <div className={centered ? "flex justify-center" : ""}>
          <Kicker tone={tone}>{kicker}</Kicker>
        </div>
      )}
      <h2 className={`t-h2 mt-5 text-balance ${dark ? "text-on-emph" : ""}`}>{title}</h2>
      {body && (
        <p
          className={`t-lead mt-5 text-pretty ${dark ? "text-on-emph-muted" : "text-body"}`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

/* Card: the single small surface used across the page */
export function Card({ children, className = "", lift = false, as: Tag = "div" }) {
  return (
    <Tag className={`surface-card p-7 ${lift ? "lift" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

/* Panel: the single large surface used across the page */
export function Panel({ children, className = "", padded = true }) {
  return (
    <div className={`surface-panel ${padded ? "p-7 sm:p-10 lg:p-12" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* Pill button with a circular arrow badge */
export function Button({
  href = "#",
  children,
  variant = "dark",
  className = "",
  // "a" by default so every existing call site is unchanged. Forms
  // need a real submit control, so they pass as="button".
  as = "a",
  ...rest
}) {
  const base =
    "group inline-flex min-h-12 items-center gap-3 rounded-pill py-2 pl-6 pr-2 text-sm font-medium transition-all duration-300";

  const skin = {
    dark: "bg-invert text-on-invert shadow-pill hover:opacity-90 hover:shadow-lift",
    accent: "bg-accent text-on-invert shadow-pill hover:bg-invert hover:shadow-lift",
    paper: "border border-line bg-paper text-ink shadow-card hover:shadow-lift",
  };

  const badge = {
    dark: "bg-canvas/25 text-on-invert",
    accent: "bg-canvas/25 text-on-invert",
    paper: "bg-canvas text-ink group-hover:bg-invert group-hover:text-on-invert",
  };

  const Tag = as;
  const tagProps = as === "a" ? { href } : {};

  return (
    <Tag className={`${base} ${skin[variant]} ${className}`} {...tagProps} {...rest}>
      <span>{children}</span>
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${badge[variant]}`}
      >
        <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </Tag>
  );
}

/* Text link with a small circular arrow */
export function ArrowLink({ href = "#", children, tone = "light", className = "" }) {
  const dark = tone === "dark";
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2.5 text-sm font-medium transition-colors ${
        dark ? "text-on-emph hover:text-accent" : "text-ink hover:text-accent-ice"
      } ${className}`}
    >
      <span>{children}</span>
      <span
        aria-hidden
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-200 ${
          dark
            ? "border-emph-line group-hover:border-accent group-hover:bg-accent group-hover:text-on-invert"
            : "border-line group-hover:border-accent-ice group-hover:bg-accent-ice group-hover:text-on-invert"
        }`}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}

/* Small outlined chip */
export function Chip({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-paper px-4 py-2 text-xs text-body shadow-card">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

/* Tag used for categories and metadata */
export function Tag({ children, className = "" }) {
  return (
    <span
      className={`t-label rounded-pill bg-canvas px-3 py-1.5 text-body ${className}`}
    >
      {children}
    </span>
  );
}

/* Fade-and-rise on scroll, skipped under prefers-reduced-motion */
export function Reveal({ children, delay = 0, className = "" }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Hairline({ className = "" }) {
  return <div aria-hidden className={`hairline h-px w-full ${className}`} />;
}

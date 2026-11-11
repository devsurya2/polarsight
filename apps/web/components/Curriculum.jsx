"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

/* Expandable curriculum list. Each module is a real <button> with
   aria-expanded so it works from the keyboard and reads correctly to
   a screen reader. Several can be open at once: comparing two modules
   is the common case. */
export function Curriculum({ modules }) {
  const [open, setOpen] = useState(() => new Set());

  const toggle = (i) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const allOpen = open.size === modules.length;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-xs text-faint">
          {modules.length} modules
        </span>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(modules.map((_, i) => i)))}
          className="rounded-pill border border-line bg-paper px-4 py-2 text-xs text-body transition-colors hover:text-ink"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line bg-paper/40">
        {modules.map((m, i) => {
          const isOpen = open.has(i);
          const panelId = `module-panel-${i}`;
          return (
            <li key={m.title}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-canvas/60 sm:px-6"
              >
                <span className="shrink-0 font-mono text-xs text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-ink sm:text-base">
                  {m.title}
                </span>
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-body"
                >
                  <Plus
                    className={`h-3.5 w-3.5 transition-transform duration-300 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  />
                </span>
              </button>

              {isOpen && (
                <div id={panelId} className="px-4 pb-5 pl-[2.25rem] sm:px-6 sm:pl-[3.25rem]">
                  {m.body && (
                    <p className="t-body max-w-2xl text-pretty text-body">{m.body}</p>
                  )}

                  {/* Topics, when a module has them. Added through the
                      admin portal's curriculum builder; a module with
                      none simply shows its summary. */}
                  {m.topics?.length > 0 && (
                    <ul className="mt-4 space-y-2.5 border-l border-line pl-5">
                      {m.topics.map((t) => (
                        <li key={t.title} className="min-w-0">
                          <p className="text-sm font-medium text-ink">{t.title}</p>
                          {t.description && (
                            <p className="t-body mt-1 max-w-2xl text-pretty text-body">
                              {t.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { Section, Heading, ArrowLink, Reveal } from "./ui";
import { Mock } from "./mocks";
import { serve } from "@/lib/content";

export function Serve() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const tab = serve.tabs[active];

  return (
    <Section id="serve">
      <Reveal>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Heading kicker={serve.kicker} title={serve.title} body={serve.body} />
          <div className="shrink-0">
            <ArrowLink href="#contact">{serve.linkLabel}</ArrowLink>
          </div>
        </div>
      </Reveal>

      {/* Tabs */}
      <Reveal delay={0.06}>
        <div
          role="tablist"
          aria-label="Who we serve"
          className="mt-12 flex flex-wrap gap-2 border-b border-line pb-4"
        >
          {serve.tabs.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              id={`serve-tab-${t.id}`}
              aria-selected={i === active}
              aria-controls={`serve-panel-${t.id}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") setActive((active + 1) % serve.tabs.length);
                if (e.key === "ArrowLeft")
                  setActive((active - 1 + serve.tabs.length) % serve.tabs.length);
              }}
              className={`min-h-11 rounded-pill px-5 py-2.5 text-sm font-medium transition-colors duration-200 ${
                i === active
                  ? "bg-invert text-on-invert shadow-pill"
                  : "border border-line bg-paper text-body hover:border-ink hover:text-ink"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Panel */}
      <div
        role="tabpanel"
        id={`serve-panel-${tab.id}`}
        aria-labelledby={`serve-tab-${tab.id}`}
        className="mt-10"
      >
        <motion.div
          key={tab.id}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="surface-panel grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:p-12"
        >
          <div>
            <h3 className="t-h2 text-balance">
              {tab.heading}
            </h3>
            <p className="t-lead mt-4 text-pretty text-body">{tab.blurb}</p>

            {/* Flow */}
            <ol className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-3">
              {tab.flow.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-pill bg-canvas px-3.5 py-1.5 text-xs font-medium">
                    <span className="font-mono text-[0.625rem] text-accent-ice">
                      0{i + 1}
                    </span>
                    {step}
                  </span>
                  {i < tab.flow.length - 1 && (
                    <span aria-hidden className="text-faint">
                      ·
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <p className="mt-8 flex items-center gap-2.5 text-sm font-medium text-accent-ice">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              {tab.outcome}
            </p>
          </div>

          <Mock name={tab.mock} className="mx-auto w-full max-w-sm" />
        </motion.div>
      </div>
    </Section>
  );
}

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Section, Heading, ArrowLink, Reveal } from "./ui";
import { faq as staticFaq } from "@/lib/content";

export function Faq({ faq = staticFaq }) {
  const [open, setOpen] = useState(0);

  return (
    <Section id="faq">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <Reveal>
            <Heading kicker={faq.kicker} title={faq.title} body={faq.body} />
            <div className="mt-8">
              <ArrowLink href="#contact">{faq.linkLabel}</ArrowLink>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.06}>
          <ul className="border-t border-line">
            {faq.items.map((item, i) => {
              const isOpen = open === i;
              return (
                <li key={item.q} className="border-b border-line">
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? -1 : i)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-trigger-${i}`}
                      className="flex min-h-14 w-full min-w-0 items-center justify-between gap-4 py-5 text-left transition-colors hover:text-accent-ice sm:gap-6"
                    >
                      <span className="t-lead min-w-0 text-pretty font-medium break-words">{item.q}</span>
                      <span
                        aria-hidden
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                          isOpen
                            ? "rotate-45 border-invert bg-invert text-on-invert"
                            : "border-line text-ink"
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                      </span>
                    </button>
                  </h3>

                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${i}`}
                    hidden={!isOpen}
                  >
                    <p className="t-body max-w-xl text-pretty pb-6 text-body">
                      {item.a}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

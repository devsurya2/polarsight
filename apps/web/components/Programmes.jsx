import { Check } from "lucide-react";
import { Section, Heading, ArrowLink, Reveal } from "./ui";
import { Mock } from "./mocks";
import { programmes as staticProgrammes } from "@/lib/content";

export function Programmes({ programmes = staticProgrammes }) {
  const total = String(programmes.items.length).padStart(2, "0");

  return (
    <Section id="programmes">
      <Reveal>
        <Heading
          kicker={programmes.kicker}
          title={programmes.title}
          body={programmes.body}
        />
      </Reveal>

      <div className="mt-14 space-y-4">
        {programmes.items.map((p, i) => {
          const flip = i % 2 === 1;
          return (
            <Reveal key={p.code} delay={0.04}>
              <article className="surface-panel overflow-hidden transition-shadow duration-500 hover:shadow-lift">
                <div
                  className={`grid items-center gap-8 p-5 sm:gap-10 sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:p-12 ${
                    flip ? "lg:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-xs text-faint">
                        {String(i + 1).padStart(2, "0")} / {total}
                      </span>
                      <span className="h-px flex-1 bg-line" aria-hidden />
                      <span className="t-label min-w-0 rounded-pill bg-canvas px-3 py-1.5 text-body">
                        {p.tag}
                      </span>
                    </div>

                    <h3 className="t-h2 mt-5">
                      {p.name}
                    </h3>
                    <p className="t-lead mt-3 text-pretty text-body">
                      {p.summary}
                    </p>

                    <ul className="mt-7 space-y-3">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex gap-3 text-sm text-body">
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-accent-ice"
                            aria-hidden
                          />
                          <span className="text-pretty">{pt}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-line-soft pt-6">
                      <span className="font-mono text-xs text-faint">{p.duration}</span>
                      <span aria-hidden className="h-1 w-1 rounded-full bg-line" />
                      <span className="font-mono text-xs text-faint">{p.level}</span>
                      <ArrowLink href="#contact" className="ml-auto">
                        Explore {p.name}
                      </ArrowLink>
                    </div>
                  </div>

                  <div className="min-w-0 rounded-card bg-canvas p-4 sm:p-8">
                    <Mock name={p.mock} className="mx-auto w-full max-w-sm" />
                  </div>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

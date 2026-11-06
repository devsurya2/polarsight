import { Section, Heading, ArrowLink, Reveal } from "./ui";
import { outcomes as staticOutcomes } from "@/lib/content";

export function Outcomes({ outcomes = staticOutcomes }) {
  return (
    <Section id="outcomes">
      <Reveal>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Heading kicker={outcomes.kicker} title={outcomes.title} body={outcomes.body} />
          <div className="shrink-0">
            <ArrowLink href="#contact">{outcomes.linkLabel}</ArrowLink>
          </div>
        </div>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {outcomes.items.map((o, i) => (
          <Reveal key={o.name} delay={(i % 4) * 0.06} className="h-full">
            <article className="surface-card lift flex h-full flex-col p-7">
              <span className="t-label w-fit rounded-pill bg-canvas px-3 py-1.5 text-body">
                {o.tag}
              </span>

              <h3 className="t-h3 mt-6 text-pretty">
                {o.name}
              </h3>
              <p className="t-body mt-2 flex-1 text-pretty text-body">
                {o.detail}
              </p>

              <p className="mt-6 border-t border-line-soft pt-4 font-mono text-xs text-accent-ice">
                {o.metric}
              </p>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="mt-8 font-mono text-[0.6875rem] text-faint">{outcomes.note}</p>
      </Reveal>
    </Section>
  );
}

import { Section, Kicker, Reveal, ArrowLink } from "../ui";
import { outcomes as builtIn } from "@/lib/home";

export function Outcomes({ content }) {
  // Published content when the CMS has it, the built-in
  // copy otherwise. The markup below is identical either way.
  const outcomes = content ?? builtIn;

  return (
    <Section className="border-t border-line">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
        <Reveal>
          <div className="max-w-2xl">
            <Kicker>{outcomes.kicker}</Kicker>
            <h2 className="t-h2 mt-6 text-balance">{outcomes.title}</h2>
            <p className="t-body mt-6 text-pretty text-body">{outcomes.body}</p>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="shrink-0">
            <ArrowLink href={outcomes.cta.href}>{outcomes.cta.label}</ArrowLink>
          </div>
        </Reveal>
      </div>

      <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {outcomes.items.map((it, i) => (
          <Reveal key={it.n} delay={i * 0.06}>
            <div className="min-w-0 border-t border-line pt-6">
              <span className="font-mono text-xs text-accent-ice">{it.n}</span>
              <h3 className="t-h3 mt-5">{it.title}</h3>
              <p className="t-body mt-3 text-pretty text-body">{it.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

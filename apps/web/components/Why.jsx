import { Section, Heading, Reveal } from "./ui";
import { why as staticWhy } from "@/lib/content";

export function Why({ why = staticWhy }) {
  return (
    <Section>
      <div className="rounded-panel bg-emph px-7 py-16 shadow-lift sm:px-12 md:py-20">
        <Reveal>
          <Heading
            tone="dark"
            kicker={why.kicker}
            title={why.title}
            body={why.body}
          />
        </Reveal>

        <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          {why.items.map((item, i) => (
            <Reveal key={item.n} delay={i * 0.08}>
              <div className="border-t border-emph-line pt-6">
                <span className="font-mono text-sm text-accent">{item.n}</span>
                <h3 className="t-h3 mt-4 text-pretty text-on-emph">
                  {item.title}
                </h3>
                <p className="t-body mt-3 text-pretty text-on-emph-muted">
                  {item.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

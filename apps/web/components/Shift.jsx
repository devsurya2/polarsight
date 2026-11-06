import { ArrowRight } from "lucide-react";
import { Section, Heading, Reveal } from "./ui";
import { shift as staticShift } from "@/lib/content";

export function Shift({ shift = staticShift }) {
  return (
    <Section>
      <Reveal>
        <Heading kicker={shift.kicker} title={shift.title} />
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shift.items.map((item, i) => (
          <Reveal key={item.area} delay={(i % 3) * 0.06} className="h-full">
            <article className="surface-card lift h-full p-7">
              <h3 className="t-label text-faint">
                {item.area}
              </h3>

              <p className="t-body mt-5 text-body line-through decoration-line decoration-1">
                {item.before}
              </p>

              <div className="my-3 flex items-center gap-2 text-accent-ice">
                <ArrowRight className="h-4 w-4" aria-hidden />
                <span className="h-px flex-1 bg-line" aria-hidden />
              </div>

              <p className="t-body text-pretty font-medium text-ink">
                {item.after}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

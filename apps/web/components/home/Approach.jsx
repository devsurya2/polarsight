import { Section, Kicker, Reveal } from "../ui";
import { Figure } from "./Figure";
import { approach as builtIn } from "@/lib/home";

/* Editorial rather than a card grid: the heading sits in its own
   column, the image anchors the left and the three ideas run down the
   right separated by hairlines. */
export function Approach({ content }) {
  // Published content when the CMS has it, the built-in
  // copy otherwise. The markup below is identical either way.
  const approach = content ?? builtIn;

  return (
    <Section className="border-t border-line">
      <Reveal>
        <div className="max-w-3xl">
          <Kicker>{approach.kicker}</Kicker>
          <h2 className="t-h2 mt-6 text-balance">{approach.title}</h2>
          <p className="t-lead mt-6 max-w-2xl text-pretty text-body">
            {approach.body}
          </p>
        </div>
      </Reveal>

      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-20">
        <Reveal>
          <Figure image={approach.image} className="lg:sticky lg:top-32" />
        </Reveal>

        <Reveal delay={0.08}>
          <ol className="divide-y divide-line border-y border-line">
            {approach.items.map((it) => (
              <li
                key={it.n}
                className="grid gap-x-8 gap-y-3 py-9 sm:grid-cols-[auto_minmax(0,1fr)]"
              >
                <span className="font-mono text-xs text-accent-ice">
                  {it.n}
                </span>
                <div className="min-w-0">
                  <h3 className="t-h3">{it.title}</h3>
                  <p className="t-body mt-3 max-w-md text-pretty text-body">
                    {it.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </Section>
  );
}

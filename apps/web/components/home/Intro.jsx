import { Section, Kicker, Reveal, ArrowLink } from "../ui";
import { Figure } from "./Figure";
import { intro as builtIn } from "@/lib/home";

export function Intro({ content }) {
  // Published content when the CMS has it, the built-in
  // copy otherwise. The markup below is identical either way.
  const intro = content ?? builtIn;

  return (
    <Section id="about" className="border-t border-line">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <div className="max-w-xl">
            <Kicker>{intro.kicker}</Kicker>
            <h2 className="t-h2 mt-6 text-balance">{intro.title}</h2>
            <p className="t-lead mt-6 text-pretty text-body">{intro.body}</p>
            <p className="t-body mt-5 text-pretty text-body">{intro.support}</p>
            <div className="mt-9">
              <ArrowLink href={intro.cta.href} newTab={intro.cta.newTab}>
                {intro.cta.label}
              </ArrowLink>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <Figure image={intro.image} />
        </Reveal>
      </div>
    </Section>
  );
}

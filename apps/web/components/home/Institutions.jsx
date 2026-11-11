import { Check } from "lucide-react";
import { Section, Kicker, Reveal, Button } from "../ui";
import { Figure } from "./Figure";
import { institutions as builtIn } from "@/lib/home";

export function Institutions({ content }) {
  // Published content when the CMS has it, the built-in
  // copy otherwise. The markup below is identical either way.
  const institutions = content ?? builtIn;

  return (
    <Section className="border-t border-line">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Image first in the source, and first on screen from lg up,
            so this section mirrors the intro rather than repeating it. */}
        <Reveal className="lg:order-1">
          <Figure image={institutions.image} />
        </Reveal>

        <Reveal delay={0.08} className="lg:order-2">
          <div className="max-w-xl">
            <Kicker>{institutions.kicker}</Kicker>
            <h2 className="t-h2 mt-6 text-balance">{institutions.title}</h2>
            <p className="t-lead mt-6 text-pretty text-body">
              {institutions.body}
            </p>

            <ul className="mt-8 space-y-3.5">
              {institutions.points.map((p) => (
                <li
                  key={p}
                  className="flex gap-3 text-sm text-body sm:text-base"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-ice"
                    aria-hidden
                  />
                  <span className="min-w-0 text-pretty">{p}</span>
                </li>
              ))}
            </ul>

            <div className="mt-9">
              <Button href={institutions.cta.href}>
                {institutions.cta.label}
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

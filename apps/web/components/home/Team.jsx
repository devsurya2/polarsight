import { Section, Kicker, Reveal, Button } from "../ui";
import { Figure } from "./Figure";
import { team as builtIn } from "@/lib/home";

export function Team({ content }) {
  // Published content when the CMS has it, the built-in
  // copy otherwise. The markup below is identical either way.
  const team = content ?? builtIn;

  return (
    <Section className="border-t border-line">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <div className="max-w-xl">
            <Kicker>{team.kicker}</Kicker>
            <h2 className="t-h2 mt-6 text-balance">{team.title}</h2>
            <p className="t-lead mt-6 text-pretty text-body">{team.body}</p>

            <ul className="mt-8 flex flex-wrap gap-2.5">
              {team.roles.map((r) => (
                <li
                  key={r}
                  className="rounded-pill border border-line bg-paper px-4 py-2 text-sm text-body shadow-card"
                >
                  {r}
                </li>
              ))}
            </ul>

            <div className="mt-9">
              {/* Opens in its own tab, so a visitor reading the
                  homepage does not lose their place. */}
              <Button
                href={team.cta.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {team.cta.label}
              </Button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <Figure image={team.image} />
        </Reveal>
      </div>
    </Section>
  );
}

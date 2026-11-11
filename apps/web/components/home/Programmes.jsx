import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Section, Heading, Reveal, Tag } from "../ui";
import { Figure } from "./Figure";
import { programmes as builtIn } from "@/lib/home";

export function Programmes({ content }) {
  // Published content when the CMS has it, the built-in
  // copy otherwise. The markup below is identical either way.
  const programmes = content ?? builtIn;

  return (
    <Section id="programmes" className="border-t border-line">
      <Reveal>
        <Heading
          kicker={programmes.kicker}
          title={programmes.title}
          body={programmes.body}
        />
      </Reveal>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        {programmes.items.map((p, i) => (
          <Reveal key={p.href} delay={i * 0.08} className="h-full">
            <Link
              href={p.href}
              aria-label={`Explore the ${p.name} programme`}
              className="surface-panel group flex h-full min-w-0 flex-col overflow-hidden transition-shadow duration-500 hover:shadow-lift"
            >
              <Figure
                image={p.image}
                ratio="16/10"
                className="rounded-none border-0 border-b border-line"
              />

              <div className="flex flex-1 flex-col p-6 sm:p-8">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-mono text-xs text-faint">
                    {p.code}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  <Tag>{p.tag}</Tag>
                </div>

                <h3 className="t-h2 mt-5">{p.name}</h3>
                <p className="t-body mt-4 max-w-md text-pretty text-body">
                  {p.body}
                </p>

                <ul className="mt-7 flex flex-wrap gap-2">
                  {p.areas.map((a) => (
                    <li
                      key={a}
                      className="rounded-pill border border-line bg-canvas px-3 py-1.5 text-xs text-body"
                    >
                      {a}
                    </li>
                  ))}
                </ul>

                <span className="mt-auto flex items-center gap-2.5 border-t border-line pt-7 text-sm font-medium text-ink transition-colors group-hover:text-accent-ice">
                  Explore Programme
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import {
  PageShell,
  PageHero,
  Disclaimer,
  PreviewBanner,
} from "@/components/PageShell";
import { Section, Reveal, Tag, Button } from "@/components/ui";
import {
  programmes as builtInProgrammes,
  programmesIntro as builtInIntro,
} from "@/lib/programmes";
import { getPageContent, getSiteContent, getProgramme } from "@/lib/getContent";

export const revalidate = 60;

export async function generateMetadata() {
  const c = await getSiteContent();
  const seo = c.seo?.programmes ?? {};
  return {
    title: seo.title ?? "Programmes | POLARSIGHT",
    description:
      seo.description ??
      "Practical cybersecurity training programmes: SOC Analyst and AI Security Engineer.",
  };
}

export default async function ProgrammesPage({ searchParams }) {
  const c = await getSiteContent();
  const { content: programmesIntro, isPreview } = await getPageContent(
    "programmes",
    searchParams,
    c,
  );

  // Cards need each programme's detail, so the published list is
  // resolved here. Only published programmes are returned, so an
  // unpublished one is absent rather than shown without its content.
  const slugs = c.programmes.items
    .map((p) => p.href?.replace("/programmes/", ""))
    .filter(Boolean);

  const resolved = await Promise.all(
    slugs.map((slug) => getProgramme(slug, c)),
  );
  const programmes = resolved.filter(Boolean);

  // A build with no API at all still renders the built-in programmes.
  const list = programmes.length > 0 ? programmes : builtInProgrammes;

  return (
    <PageShell content={c}>
      {isPreview && <PreviewBanner />}
      <PageHero
        kicker={programmesIntro.kicker}
        title={programmesIntro.title}
        body={programmesIntro.body}
      />

      <Section>
        <div className="grid gap-5 lg:grid-cols-2">
          {list.map((p, i) => (
            <Reveal key={p.slug} delay={i * 0.06} className="h-full">
              <article className="surface-panel flex h-full flex-col p-6 transition-shadow duration-500 hover:shadow-lift sm:p-8">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-mono text-xs text-faint">
                    {p.code}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  <Tag>{p.tag}</Tag>
                </div>

                <h2 className="t-h2 mt-5">{p.name}</h2>
                <p className="t-lead mt-3 text-pretty text-body">{p.summary}</p>

                <ul className="mt-6 space-y-2.5">
                  {p.skills.slice(0, 4).map((s) => (
                    <li key={s} className="flex gap-3 text-sm text-body">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent-ice"
                        aria-hidden
                      />
                      <span className="text-pretty">{s}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap gap-1.5">
                  {p.tools.slice(0, 5).map((t) => (
                    <span
                      key={t}
                      className="rounded-pill border border-line bg-canvas px-2.5 py-1 font-mono text-[0.6875rem] text-body"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-4 border-t border-line pt-6">
                  <span className="font-mono text-xs text-faint">
                    {p.curriculum.length} modules
                  </span>
                  <Link
                    href={`/programmes/${p.slug}`}
                    className="group ml-auto inline-flex items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-accent-ice"
                  >
                    View programme
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                    <span className="sr-only">: {p.name}</span>
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Disclaimer>
          Curriculum topics are proposed programme content and are subject to
          actual delivery capability. We do not publish course duration, fees,
          certification, accreditation or placement guarantees, because none of
          those are established.
        </Disclaimer>
      </Section>

      <Section tight>
        <div className="surface-panel dotfield overflow-hidden px-6 py-12 text-center sm:px-12 md:py-16">
          <h2 className="t-h2 mx-auto max-w-2xl text-balance">
            Interested in running one of these with your institution?
          </h2>
          <p className="t-lead mx-auto mt-4 max-w-xl text-pretty text-body">
            Tell us about your batch and we will come back with a programme
            outline.
          </p>
          <div className="mt-8 flex justify-center">
            <Button href="/contact">Get in touch</Button>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}

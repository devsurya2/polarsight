import Link from "next/link";
import { Check } from "lucide-react";
import {
  PageShell,
  PageHero,
  Disclaimer,
  PreviewBanner,
} from "@/components/PageShell";
import { Section, Kicker, Reveal, Button } from "@/components/ui";
import { outcomesPage } from "@/lib/pages";
import { getPageContent, getSiteContent } from "@/lib/getContent";

export const revalidate = 60;

export async function generateMetadata() {
  const c = await getSiteContent();
  const seo = c.seo?.outcomes ?? {};
  return {
    title: seo.title ?? "Outcomes | POLARSIGHT",
    description:
      seo.description ??
      "Learning outcomes of the POLARSIGHT programmes: practical skill development, industry readiness, hands-on experience and career preparation.",
  };
}

export default async function OutcomesPage({ searchParams }) {
  const c = await getSiteContent();
  const { content: page, isPreview } = await getPageContent(
    "outcomes",
    searchParams,
    c,
  );

  return (
    <PageShell content={c}>
      {isPreview && <PreviewBanner />}
      <PageHero kicker={page.kicker} title={page.title} body={page.body} />

      {page.sections.map((s, si) => (
        <Section
          key={s.id}
          id={s.id}
          tight={si > 0}
          className={si > 0 ? "border-t border-line" : ""}
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16">
            <Reveal>
              <div className="lg:sticky lg:top-32">
                <Kicker>{String(si + 1).padStart(2, "0")}</Kicker>
                <h2 className="t-h2 mt-5 text-balance">{s.heading}</h2>
                <p className="t-body mt-5 max-w-md text-pretty text-body">
                  {s.body}
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              {s.points && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {s.points.map((pt) => (
                    <div key={pt.title} className="surface-card min-w-0 p-6">
                      <h3 className="text-sm font-medium text-ink sm:text-base">
                        {pt.title}
                      </h3>
                      <p className="t-body mt-3 text-pretty text-body">
                        {pt.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {s.examples && (
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-paper/40">
                  {s.examples.map((ex, i) => (
                    <li
                      key={ex}
                      className="flex items-start gap-4 px-4 py-4 sm:px-6"
                    >
                      <span className="shrink-0 font-mono text-xs text-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 text-pretty text-sm text-body sm:text-base">
                        {ex}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>
          </div>
        </Section>
      ))}

      {/* Career pathways */}
      <Section tight className="border-t border-line">
        <Reveal>
          <Kicker>05</Kicker>
          <h2 className="t-h2 mt-5 max-w-2xl text-balance">
            {page.pathways.heading}
          </h2>
          <p className="t-body mt-5 max-w-2xl text-pretty text-body">
            {page.pathways.body}
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {page.pathways.groups.map((g, i) => (
            <Reveal key={g.slug} delay={i * 0.08}>
              <div className="surface-panel min-w-0 p-6 sm:p-8">
                <h3 className="t-h3">{g.programme}</h3>
                <ul className="mt-5 space-y-3">
                  {g.roles.map((r) => (
                    <li key={r} className="flex gap-3 text-sm text-body">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent-ice"
                        aria-hidden
                      />
                      <span className="text-pretty">{r}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/programmes/${g.slug}`}
                  className="mt-7 inline-block border-t border-line pt-5 text-sm text-ink transition-colors hover:text-accent-ice"
                >
                  View programme →
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        <Disclaimer>{page.pathways.note}</Disclaimer>
      </Section>

      <Section tight className="border-t border-line">
        <div className="surface-panel dotfield overflow-hidden px-6 py-12 text-center sm:px-12 md:py-16">
          <h2 className="t-h2 mx-auto max-w-2xl text-balance">
            Questions about what a programme covers?
          </h2>
          <p className="t-lead mx-auto mt-4 max-w-xl text-pretty text-body">
            Ask us directly. We will tell you what is in place and what is still
            being built.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/contact">Contact us</Button>
            <Button href="/programmes" variant="paper">
              Browse programmes
            </Button>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}

import { Check } from "lucide-react";
import { PageShell, PageHero, PreviewBanner } from "@/components/PageShell";
import { ApplicationForm } from "@/components/ApplicationForm";
import { Section, Kicker, Reveal, Button, Hairline } from "@/components/ui";
import { careersPage } from "@/lib/pages";
import { getPageContent, getSiteContent } from "@/lib/getContent";

export const revalidate = 60;

export async function generateMetadata() {
  const c = await getSiteContent();
  const seo = c.seo?.careers ?? {};
  return {
    title: seo.title ?? "Careers | POLARSIGHT",
    description:
      seo.description ??
      "Join PolarSight as a cybersecurity trainer, industry expert or technical mentor.",
  };
}

export default async function CareersPage({ searchParams }) {
  const c = await getSiteContent();
  const { content: page, isPreview } = await getPageContent(
    "careers",
    searchParams,
    c,
  );

  return (
    <PageShell content={c}>
      {isPreview && <PreviewBanner />}
      <PageHero
        kicker={page.hero.kicker}
        title={page.hero.title}
        body={page.hero.body}
      >
        <Button href={page.hero.cta.href}>{page.hero.cta.label}</Button>
      </PageHero>

      {/* Why join */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <h2 className="t-h2 text-balance">{page.why.heading}</h2>
            <p className="t-body mt-5 max-w-md text-pretty text-body">
              {page.why.body}
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="grid gap-4 sm:grid-cols-2">
              {page.why.items.map((it) => (
                <div key={it.title} className="surface-card min-w-0 p-6">
                  <h3 className="text-sm font-medium text-ink sm:text-base">
                    {it.title}
                  </h3>
                  <p className="t-body mt-3 text-pretty text-body">{it.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </Section>

      {/* Open positions */}
      <Section id="positions" tight className="border-t border-line">
        <Reveal>
          <Kicker>Open positions</Kicker>
          <h2 className="t-h2 mt-5 max-w-2xl text-balance">
            {page.positions.heading}
          </h2>
          <p className="t-body mt-5 max-w-2xl text-pretty text-body">
            {page.positions.body}
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {page.positions.items.map((job, i) => (
            <Reveal
              key={job.id ?? job.title}
              delay={(i % 3) * 0.06}
              className="h-full"
            >
              <article className="surface-card flex h-full min-w-0 flex-col p-6 sm:p-7">
                <span className="t-label text-accent-ice">{job.area}</span>
                <h3 className="t-h3 mt-4">{job.title}</h3>

                {/* Only what the opening actually states. Nothing here
                    implies a salary, a start date or a headcount. */}
                {(job.employmentType || job.workMode || job.location) && (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {[job.employmentType, job.workMode, job.location]
                      .filter(Boolean)
                      .map((meta) => (
                        <li
                          key={meta}
                          className="rounded-pill border border-line bg-canvas px-2.5 py-1 text-xs text-body"
                        >
                          {meta}
                        </li>
                      ))}
                  </ul>
                )}

                {job.applicationDeadline && (
                  <p className="mt-3 text-xs text-faint">
                    Applications close{" "}
                    {new Date(job.applicationDeadline).toLocaleDateString(
                      undefined,
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                  </p>
                )}

                <p className="mt-6 text-xs text-faint">Required expertise</p>
                <ul className="mt-3 space-y-2">
                  {job.expertise.map((x) => (
                    <li key={x} className="flex gap-2.5 text-sm text-body">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-ice"
                        aria-hidden
                      />
                      <span className="min-w-0 text-pretty">{x}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#apply"
                  className="mt-auto pt-6 text-sm text-ink transition-colors hover:text-accent-ice"
                >
                  Apply for this role →
                </a>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Employment types + eligibility */}
      <Section tight className="border-t border-line">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h2 className="t-h3">{page.employmentTypes.heading}</h2>
            <p className="t-body mt-4 max-w-md text-pretty text-body">
              {page.employmentTypes.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {page.employmentTypes.items.map((t) => (
                <span
                  key={t}
                  className="rounded-pill border border-line bg-paper px-4 py-2 text-sm text-body"
                >
                  {t}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <h2 className="t-h3">{page.eligibility.heading}</h2>
            <p className="t-body mt-4 max-w-md text-pretty text-body">
              {page.eligibility.body}
            </p>
            <ul className="mt-6 space-y-3">
              {page.eligibility.items.map((x) => (
                <li key={x} className="flex gap-3 text-sm text-body">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-ice"
                    aria-hidden
                  />
                  <span className="min-w-0 text-pretty">{x}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      {/* Recruitment process */}
      <Section tight className="border-t border-line">
        <Reveal>
          <h2 className="t-h2 max-w-2xl text-balance">
            {page.process.heading}
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {page.process.steps.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 0.06}>
              <div className="min-w-0">
                <span className="font-mono text-xs text-accent-ice">{s.n}</span>
                <Hairline className="mt-4" />
                <h3 className="t-h3 mt-5">{s.title}</h3>
                <p className="t-body mt-3 text-pretty text-body">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Apply */}
      <Section id="apply" tight className="border-t border-line">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <div className="lg:sticky lg:top-32">
              <Kicker>Apply</Kicker>
              <h2 className="t-h2 mt-5 text-balance">{page.apply.heading}</h2>
              <p className="t-body mt-5 max-w-sm text-pretty text-body">
                {page.apply.body}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <ApplicationForm positions={page.positions.items} />
          </Reveal>
        </div>
      </Section>
    </PageShell>
  );
}

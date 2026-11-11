import { PageShell, PageHero, PreviewBanner } from "@/components/PageShell";
import { Section, Kicker, Reveal, Button, Hairline } from "@/components/ui";
import { aboutPage } from "@/lib/pages";
import { getPageContent, getSiteContent } from "@/lib/getContent";

export const revalidate = 60;

/** Title and description come from the CMS when an editor has set them. */
export async function generateMetadata() {
  const c = await getSiteContent();
  const seo = c.seo?.about ?? {};
  return {
    title: seo.title ?? "About us | POLARSIGHT",
    description:
      seo.description ??
      "PolarSight is a cybersecurity-focused training and workforce-readiness initiative helping individuals develop practical security skills.",
  };
}

export default async function AboutPage({ searchParams }) {
  const c = await getSiteContent();
  const { content: page, isPreview } = await getPageContent(
    "about",
    searchParams,
    c,
  );

  return (
    <PageShell content={c}>
      {isPreview && <PreviewBanner />}
      <PageHero kicker={page.kicker} title={page.title} />

      {/* Who we are */}
      {page.whoWeAre.visible !== false && (
        <Section>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
            <Reveal>
              <h2 className="t-h2 text-balance">{page.whoWeAre.heading}</h2>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="max-w-2xl space-y-5">
                {page.whoWeAre.paragraphs.map((para) => (
                  <p
                    key={para.slice(0, 32)}
                    className="t-lead text-pretty text-body"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </Reveal>
          </div>
        </Section>
      )}

      {/* Mission / vision */}
      <Section tight className="border-t border-line">
        <div className="grid gap-5 lg:grid-cols-2">
          {[page.mission, page.vision]
            .filter((b) => b.visible !== false)
            .map((b, i) => (
              <Reveal key={b.heading} delay={i * 0.08}>
                <div className="surface-panel dotfield h-full min-w-0 overflow-hidden p-7 sm:p-10">
                  <Kicker>{b.heading}</Kicker>
                  <p className="t-lead mt-6 max-w-lg text-pretty text-ink">
                    {b.body}
                  </p>
                </div>
              </Reveal>
            ))}
        </div>
      </Section>

      {/* Approach */}
      {page.approach.visible !== false && (
        <Section tight className="border-t border-line">
          <Reveal>
            <h2 className="t-h2 max-w-2xl text-balance">
              {page.approach.heading}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {page.approach.items.map((it, i) => (
              <Reveal key={it.title} delay={i * 0.06}>
                <div className="min-w-0">
                  <span className="font-mono text-xs text-accent-ice">
                    {it.n}
                  </span>
                  <Hairline className="mt-4" />
                  <h3 className="t-h3 mt-5">{it.title}</h3>
                  <p className="t-body mt-3 text-pretty text-body">{it.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      {/* Focus areas */}
      {page.focus.visible !== false && (
        <Section tight className="border-t border-line">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
            <Reveal>
              <h2 className="t-h2 text-balance">{page.focus.heading}</h2>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="grid gap-4 sm:grid-cols-2">
                {page.focus.items.map((it) => (
                  <div key={it.title} className="surface-card min-w-0 p-6">
                    <h3 className="text-sm font-medium text-ink sm:text-base">
                      {it.title}
                    </h3>
                    <p className="t-body mt-3 text-pretty text-body">
                      {it.body}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </Section>
      )}

      {page.closing.visible !== false && (
        <Section tight className="border-t border-line">
          <div className="surface-panel overflow-hidden px-6 py-12 text-center sm:px-12 md:py-16">
            <h2 className="t-h2 mx-auto max-w-2xl text-balance">
              {page.closing.heading}
            </h2>
            <p className="t-lead mx-auto mt-4 max-w-xl text-pretty text-body">
              {page.closing.body}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/contact">{page.closing.primaryLabel}</Button>
              <Button href="/careers" variant="paper">
                {page.closing.secondaryLabel}
              </Button>
            </div>
          </div>
        </Section>
      )}
    </PageShell>
  );
}

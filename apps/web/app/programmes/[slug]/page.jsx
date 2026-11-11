import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Dot } from "lucide-react";
import { PageShell, Disclaimer } from "@/components/PageShell";
import { Curriculum } from "@/components/Curriculum";
import { Section, Kicker, Reveal, Tag, Button } from "@/components/ui";
import {
  getProgramme,
  getProgrammeSlugs,
  getSiteContent,
} from "@/lib/getContent";

export const revalidate = 60;

// An unpublished slug is not pre-rendered, and is resolved on demand
// as a 404 rather than being served from a stale build.
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await getProgrammeSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getProgramme(slug);
  if (!p) return { title: "Programme not found | POLARSIGHT" };
  return {
    title: p.seoTitle ?? `${p.name} | POLARSIGHT`,
    description: p.seoDescription ?? p.summary,
  };
}

/* Simple titled block so every section on this page shares one rhythm */
function Block({ title, children, className = "" }) {
  return (
    <div className={className}>
      <h2 className="t-h3">{title}</h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Bullets({ items, icon = "check" }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm text-body sm:text-base">
          {icon === "check" ? (
            <Check
              className="mt-1 h-4 w-4 shrink-0 text-accent-ice"
              aria-hidden
            />
          ) : (
            <Dot
              className="mt-0.5 h-5 w-5 shrink-0 text-accent-ice"
              aria-hidden
            />
          )}
          <span className="min-w-0 text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ProgrammePage({ params }) {
  const { slug } = await params;
  // Only a published programme resolves. A draft or archived one is
  // indistinguishable from a slug that never existed.
  const p = await getProgramme(slug);
  if (!p) notFound();

  // Another published programme to offer at the end of the page.
  // Drawn from the published list, so it can never link to a draft.
  const c = await getSiteContent();
  const other =
    c.programmes.items
      .map((x) => ({
        slug: x.href?.replace("/programmes/", ""),
        name: x.name,
        summary: x.summary,
      }))
      .find((x) => x.slug && x.slug !== p.slug) ?? null;

  return (
    <PageShell content={c}>
      {/* Hero */}
      <section className="dotfield relative overflow-hidden border-b border-line">
        <div className="container-page page-hero-pad">
          <Link
            href="/programmes"
            className="inline-flex items-center gap-2 text-sm text-body transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All programmes
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-faint">{p.code}</span>
            <Tag>{p.tag}</Tag>
          </div>

          <h1 className="t-display mt-5 max-w-3xl text-balance">{p.name}</h1>
          <p className="t-lead mt-6 max-w-2xl text-pretty text-body">
            {p.summary}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button href="/contact">Enquire about this programme</Button>
          </div>
        </div>
      </section>

      {/* Overview + at a glance */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
          <Reveal>
            <Kicker>Overview</Kicker>
            <div className="mt-6 space-y-5">
              {p.overview.map((para) => (
                <p
                  key={para.slice(0, 32)}
                  className="t-body max-w-2xl text-pretty text-body"
                >
                  {para}
                </p>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="surface-card p-6 sm:p-7">
              <h2 className="t-label text-accent-ice">At a glance</h2>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-faint">Focus</dt>
                  <dd className="mt-1 text-ink">{p.tag}</dd>
                </div>
                <div>
                  <dt className="text-faint">Modules</dt>
                  <dd className="mt-1 text-ink">
                    {p.curriculum.length} proposed modules
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Practical work</dt>
                  <dd className="mt-1 text-ink">
                    {p.labs.length} lab exercises, {p.projects.length} projects
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Prior experience</dt>
                  <dd className="mt-1 text-ink">{p.prerequisites.at(-1)}</dd>
                </div>
              </dl>
              <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-faint">
                Duration, fees and any form of certification are not published
                here because they are not yet established. Ask us directly and
                we will tell you exactly where things stand.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* Skills */}
      <Section tight className="border-t border-line">
        <Reveal>
          <Block title="Skills you develop">
            <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
              <Bullets items={p.skills} />
            </div>
          </Block>
        </Reveal>
      </Section>

      {/* Curriculum */}
      <Section tight className="border-t border-line">
        <Reveal>
          <Block title="Curriculum">
            <p className="t-body max-w-2xl text-pretty text-body">
              Proposed programme content. Expand a module to see what it covers.
            </p>
            <div className="mt-7">
              <Curriculum modules={p.curriculum} />
            </div>
          </Block>
        </Reveal>
      </Section>

      {/* Tools / Labs */}
      <Section tight className="border-t border-line">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <Block title="Tools and technologies">
              <div className="flex flex-wrap gap-2">
                {p.tools.map((t) => (
                  <span
                    key={t}
                    className="rounded-pill border border-line bg-paper px-3.5 py-2 font-mono text-xs text-body"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Block>
          </Reveal>

          <Reveal delay={0.08}>
            <Block title="Hands-on labs">
              <Bullets items={p.labs} icon="dot" />
            </Block>
          </Reveal>
        </div>
      </Section>

      {/* Projects */}
      <Section tight className="border-t border-line">
        <Reveal>
          <Block title="Projects">
            <div className="grid gap-5 md:grid-cols-3">
              {p.projects.map((proj, i) => (
                <div key={proj} className="surface-card min-w-0 p-6">
                  <span className="font-mono text-xs text-accent-ice">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="t-body mt-4 text-pretty text-body">{proj}</p>
                </div>
              ))}
            </div>
          </Block>
        </Reveal>
      </Section>

      {/* Outcomes + pathways */}
      <Section tight className="border-t border-line">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <Block title="What you can do by the end">
              <Bullets items={p.outcomes} />
            </Block>
          </Reveal>

          <Reveal delay={0.08}>
            <Block title="Roles this prepares you for">
              <div className="flex flex-wrap gap-2">
                {p.pathways.map((r) => (
                  <span
                    key={r}
                    className="rounded-pill border border-line bg-paper px-3.5 py-2 text-xs text-body"
                  >
                    {r}
                  </span>
                ))}
              </div>
              <Disclaimer>
                These are the kinds of roles the programme is aimed at.
                PolarSight does not guarantee employment, placement or an
                interview.
              </Disclaimer>
            </Block>
          </Reveal>
        </div>
      </Section>

      {/* Prerequisites + audience */}
      <Section tight className="border-t border-line">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <Block title="Prerequisites">
              <Bullets items={p.prerequisites} icon="dot" />
            </Block>
          </Reveal>
          <Reveal delay={0.08}>
            <Block title="Who this is for">
              <Bullets items={p.audience} icon="dot" />
            </Block>
          </Reveal>
        </div>
      </Section>

      {/* CTA + other programme */}
      <Section tight className="border-t border-line">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="surface-panel dotfield overflow-hidden p-7 sm:p-10">
            <h2 className="t-h2 max-w-xl text-balance">
              Want to run {p.name} with your batch?
            </h2>
            <p className="t-lead mt-4 max-w-lg text-pretty text-body">
              Send us the details and we will reply with a programme outline and
              what delivery would involve.
            </p>
            <div className="mt-8">
              <Button href="/contact">Enquire now</Button>
            </div>
          </div>

          {other && (
            <Link
              href={`/programmes/${other.slug}`}
              className="surface-card group flex min-w-0 flex-col p-7 transition-shadow duration-500 hover:shadow-lift"
            >
              <span className="t-label text-faint">Other programme</span>
              <h2 className="t-h3 mt-4 group-hover:text-accent-ice">
                {other.name}
              </h2>
              <p className="t-body mt-3 text-pretty text-body">
                {other.summary}
              </p>
              <span className="mt-auto pt-6 text-sm text-ink group-hover:text-accent-ice">
                View programme →
              </span>
            </Link>
          )}
        </div>
      </Section>
    </PageShell>
  );
}

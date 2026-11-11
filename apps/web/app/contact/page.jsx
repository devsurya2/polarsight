import Link from "next/link";
import { Mail, Phone, MapPin, Building2, Briefcase } from "lucide-react";
import { PageShell, PageHero, PreviewBanner } from "@/components/PageShell";
import { ContactEnquiryForm } from "@/components/ContactEnquiryForm";
import { Section, Kicker, Reveal, Button } from "@/components/ui";
import { getPageContent, getSiteContent } from "@/lib/getContent";

export const revalidate = 60;

export async function generateMetadata() {
  const c = await getSiteContent();
  const seo = c.seo?.contact ?? {};
  return {
    title: seo.title ?? "Contact us | POLARSIGHT",
    description:
      seo.description ??
      "Talk to PolarSight about bringing practical cybersecurity training to your institution, collaborating with us, or professional opportunities.",
  };
}

/* One row of the information panel. Returns null when there is no
   value, so an unconfigured detail leaves no empty slot behind. */
function Detail({ icon: Icon, label, value, href, note }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-4 py-5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emph-line bg-canvas/40 text-accent-ice">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="t-label text-faint">{label}</p>
        {href ? (
          <a
            href={href}
            className="mt-1.5 block break-words font-mono text-sm text-ink transition-colors hover:text-accent-ice"
          >
            {value}
          </a>
        ) : (
          <p className="mt-1.5 break-words text-sm text-ink">{value}</p>
        )}
        {note && <p className="mt-1.5 text-xs text-body">{note}</p>}
      </div>
    </div>
  );
}

export default async function ContactPage({ searchParams }) {
  const c = await getSiteContent();
  const { content: page, isPreview } = await getPageContent(
    "contact",
    searchParams,
    c,
  );
  const { contact, brand } = c;

  /* Location prefers the setting an administrator has entered, and
     falls back to the city held as copy. Rendered only when actually
     set, so an unconfigured address leaves no empty slot. */
  const location =
    contact.location ?? [brand.city, brand.state].filter(Boolean).join(", ");

  /* True when there is any way to reach us besides the form. */
  const hasDirectContact = Boolean(
    contact.email ||
    contact.phone ||
    contact.institutionalEmail ||
    contact.businessEmail,
  );

  return (
    <PageShell content={c}>
      {isPreview && <PreviewBanner />}
      <PageHero kicker={page.kicker} title={page.title} body={page.body} />

      {/* Information panel + form */}
      <Section id="enquiry-form">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:gap-10">
          <Reveal>
            <aside className="surface-panel dotfield h-full overflow-hidden bg-emph p-6 sm:p-8">
              <Kicker>{page.panel.kicker}</Kicker>

              {hasDirectContact || location ? (
                <div className="mt-6 divide-y divide-emph-line">
                  <Detail
                    icon={Mail}
                    label="Email"
                    value={contact.email}
                    href={contact.email ? `mailto:${contact.email}` : null}
                  />
                  <Detail
                    icon={Phone}
                    label="Phone"
                    value={contact.phone}
                    href={contact.phone ? `tel:${contact.phoneHref}` : null}
                  />
                  <Detail icon={MapPin} label="Based in" value={location} />
                  <Detail
                    icon={Building2}
                    label="Institutional enquiries"
                    value={contact.institutionalEmail}
                    href={
                      contact.institutionalEmail
                        ? `mailto:${contact.institutionalEmail}`
                        : null
                    }
                    note="Colleges, universities and placement cells."
                  />
                  <Detail
                    icon={Briefcase}
                    label="General business enquiries"
                    value={contact.businessEmail}
                    href={
                      contact.businessEmail
                        ? `mailto:${contact.businessEmail}`
                        : null
                    }
                    note="Partnerships, corporate training and everything else."
                  />
                </div>
              ) : (
                /* Nothing configured. Say so plainly instead of
                   printing an address we do not own. */
                <p className="t-body mt-6 text-pretty text-body">
                  Our published contact details are not live yet. The form
                  beside this reaches us directly and is the fastest way to get
                  in touch.
                </p>
              )}

              {page.panel.note && (
                <div className="mt-8 border-t border-emph-line pt-6">
                  <p className="t-body text-pretty text-body">
                    {page.panel.note}
                  </p>
                </div>
              )}
            </aside>
          </Reveal>

          <Reveal delay={0.08}>
            <ContactEnquiryForm />
          </Reveal>
        </div>
      </Section>

      {/* Institutional partnerships */}
      <Section tight className="border-t border-line">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <span className="t-label text-accent-ice">For institutions</span>
            <h2 className="t-h2 mt-5 text-balance">
              Bring Practical Cybersecurity Training to Your Institution.
            </h2>
            <div className="mt-6 space-y-4">
              <p className="t-body max-w-xl text-pretty text-body">
                Colleges, universities and placement cells can talk to us about
                running cybersecurity training for their students, on campus or
                online. We will work through what your batch needs, how it fits
                your semester calendar and what delivery would involve.
              </p>
              <p className="t-body max-w-xl text-pretty text-body">
                Tell us your batch size, the departments involved and roughly
                when you would want to run it. We will come back with a
                programme outline rather than a brochure.
              </p>
            </div>
            <div className="mt-8">
              <Button href="#enquiry-form">
                Start an institutional enquiry
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="surface-card h-full min-w-0 p-6 sm:p-8">
              <p className="t-label text-faint">What to include</p>
              <ul className="mt-5 space-y-4">
                {[
                  "Institution name and the departments involved",
                  "Approximate batch size and year of study",
                  "Which programme interests you, if you know",
                  "Your semester calendar or preferred window",
                  "Whether you want campus-based, online, or both",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-body">
                    <span
                      aria-hidden
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-ice"
                    />
                    <span className="min-w-0 text-pretty">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* Trainer collaboration */}
      <Section tight className="border-t border-line">
        <div className="surface-panel dotfield overflow-hidden p-7 sm:p-10 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
            <div className="min-w-0">
              <span className="t-label text-accent-ice">For practitioners</span>
              <h2 className="t-h2 mt-5 max-w-2xl text-balance">
                Are You a Cybersecurity Professional?
              </h2>
              <p className="t-lead mt-5 max-w-2xl text-pretty text-body">
                We are building a network of security practitioners, trainers
                and mentors who can deliver this material. If you have done the
                work — security operations, AI security, cloud, or anything
                adjacent — we would like to talk to you about collaborating.
              </p>
              <p className="t-body mt-4 max-w-2xl text-pretty text-body">
                Open positions, what each one asks for and the application form
                are on the Careers page.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-3">
              <Button href="/careers" target="_blank" rel="noopener noreferrer">
                View open positions
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* Quick links out */}
      <Section tight className="border-t border-line">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Programmes",
              body: "What we teach and how it is structured.",
              href: "/programmes",
            },
            {
              label: "Outcomes",
              body: "What a participant can do by the end.",
              href: "/outcomes",
            },
            {
              label: "About us",
              body: "Who PolarSight is and how we work.",
              href: "/about",
              newTab: true,
            },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              {...(l.newTab
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="surface-card group min-w-0 p-6 transition-shadow duration-500 hover:shadow-lift"
            >
              <p className="t-h3 group-hover:text-accent-ice">{l.label}</p>
              <p className="t-body mt-2 text-pretty text-body">{l.body}</p>
            </Link>
          ))}
        </div>
      </Section>
    </PageShell>
  );
}

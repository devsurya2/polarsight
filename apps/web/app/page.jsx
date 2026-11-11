import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Intro } from "@/components/home/Intro";
import { Programmes } from "@/components/home/Programmes";
import { Approach } from "@/components/home/Approach";
import { Outcomes } from "@/components/home/Outcomes";
import { Institutions } from "@/components/home/Institutions";
import { Team } from "@/components/home/Team";
import { Closing } from "@/components/home/Closing";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { PreviewBanner } from "@/components/PageShell";
import { CursorGlow } from "@/components/CursorGlow";
import { getPageContent, getSiteContent } from "@/lib/getContent";

// Regenerated at most once a minute rather than on every request, so
// the page stays fast and an API outage cannot slow the site down.
// Next requires this to be a literal, so it is kept in step with
// REVALIDATE_SECONDS in lib/api.js by hand.
export const revalidate = 60;

export default async function Home({ searchParams }) {
  // Published content from the API, falling back key by key to the
  // copy shipped in lib/content.js if anything is missing.
  const c = await getSiteContent();
  const { content: h, isPreview } = await getPageContent(
    "home",
    searchParams,
    c,
  );

  return (
    <>
      {isPreview && <PreviewBanner />}

      {/* ── First interface: navbar + hero ───────────────────────
          Deliberately unchanged. Everything below is the redesign;
          nothing in it may alter the height, layout, animation or
          behaviour of the two components above. */}
      <Nav nav={c.nav} />
      <main id="main">
        <Hero hero={c.hero} />

        {/* ── Redesigned sections ───────────────────────────────
            Each takes its copy from the CMS when something is
            published, and from lib/home.js otherwise. A section an
            administrator has hidden is not rendered at all. */}
        {h.intro.visible && <Intro content={h.intro} />}
        {h.programmes.visible && <Programmes content={h.programmes} />}
        {h.approach.visible && <Approach content={h.approach} />}
        {h.outcomes.visible && <Outcomes content={h.outcomes} />}
        {h.institutions.visible && <Institutions content={h.institutions} />}
        {h.team.visible && <Team content={h.team} />}
        {h.closing.visible && <Closing content={h.closing} />}
      </main>
      <Footer
        footer={c.footer}
        brand={c.brand}
        contact={c.contact}
        social={c.social}
      />
      <BackToTop />
      <CursorGlow />
    </>
  );
}

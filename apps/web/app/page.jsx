import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Programmes } from "@/components/Programmes";
import { Outcomes } from "@/components/Outcomes";
import { Why } from "@/components/Why";
import { Shift } from "@/components/Shift";
import { MarqueeStrip } from "@/components/MarqueeStrip";
import { Coverage } from "@/components/Coverage";
import { Faq } from "@/components/Faq";
import { Cta } from "@/components/Cta";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { CursorGlow } from "@/components/CursorGlow";
import { getSiteContent } from "@/lib/getContent";

// Regenerated at most once a minute rather than on every request, so
// the page stays fast and an API outage cannot slow the site down.
// Next requires this to be a literal, so it is kept in step with
// REVALIDATE_SECONDS in lib/api.js by hand.
export const revalidate = 60;

export default async function Home() {
  // Published content from the API, falling back key by key to the
  // copy shipped in lib/content.js if anything is missing.
  const c = await getSiteContent();

  return (
    <>
      <Nav nav={c.nav} />
      <main id="main">
        <Hero hero={c.hero} />
        <Programmes programmes={c.programmes} />
        <Outcomes outcomes={c.outcomes} />
        <Why why={c.why} />
        <Shift shift={c.shift} />
        <MarqueeStrip marquee={c.marquee} />
        <Coverage coverage={c.coverage} />
        <Faq faq={c.faq} />
        <About about={c.about} />
        <Cta cta={c.cta} brand={c.brand} />
      </main>
      <Footer footer={c.footer} brand={c.brand} />
      <BackToTop />
      <CursorGlow />
    </>
  );
}

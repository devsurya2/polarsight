/**
 * Resolves the content the pages render.
 *
 * Shape is identical to content.js, so components need no knowledge of
 * where the values came from. Anything the API does not supply falls
 * back to the built-in copy, key by key, which means a partially
 * populated database still renders a complete page.
 */

import * as fallback from "./content.js";
import { fetchPublishedSite } from "./api.js";

/** Prefer a live value, but only when it is actually present. */
const pick = (live, backup) =>
  live === undefined || live === null || live === "" ? backup : live;

const arr = (live, backup) =>
  Array.isArray(live) && live.length > 0 ? live : backup;

export async function getSiteContent() {
  const site = await fetchPublishedSite();

  // No API: hand back the built-in content unchanged.
  if (!site) return { ...fallback, source: "static" };

  const c = site.content ?? {};

  const hero = {
    ...fallback.hero,
    kicker: pick(c["hero.kicker"], fallback.hero.kicker),
    lines: arr(c["hero.headline"], fallback.hero.lines),
    accent: pick(c["hero.accent"], fallback.hero.accent),
    body: pick(c["hero.body"], fallback.hero.body),
    primary: pick(c["hero.primaryCta"], fallback.hero.primary),
    secondary: pick(c["hero.secondaryCta"], fallback.hero.secondary),
    chips: arr(c["hero.chips"], fallback.hero.chips),
  };

  const about = {
    ...fallback.about,
    kicker: pick(c["about.kicker"], fallback.about.kicker),
    lead: pick(c["about.lead"], fallback.about.lead),
    cta: pick(c["about.cta"], fallback.about.cta),
  };

  const why = {
    ...fallback.why,
    kicker: pick(c["why.kicker"], fallback.why.kicker),
    title: pick(c["why.title"], fallback.why.title),
    body: pick(c["why.body"], fallback.why.body),
    items: arr(c["why.items"], fallback.why.items),
  };

  const shift = {
    ...fallback.shift,
    kicker: pick(c["shift.kicker"], fallback.shift.kicker),
    title: pick(c["shift.title"], fallback.shift.title),
    items: arr(c["shift.items"], fallback.shift.items),
  };

  const coverage = {
    ...fallback.coverage,
    kicker: pick(c["coverage.kicker"], fallback.coverage.kicker),
    title: pick(c["coverage.title"], fallback.coverage.title),
    body: pick(c["coverage.body"], fallback.coverage.body),
    cities: arr(c["coverage.cities"], fallback.coverage.cities),
    // Process steps are managed as career content in the admin portal.
    steps:
      site.career?.length > 0
        ? site.career.map((s) => ({ title: s.title, body: s.body }))
        : fallback.coverage.steps,
  };

  const cta = {
    ...fallback.cta,
    kicker: pick(c["cta.kicker"], fallback.cta.kicker),
    title: pick(c["cta.title"], fallback.cta.title),
    body: pick(c["cta.body"], fallback.cta.body),
  };

  const brand = {
    ...fallback.brand,
    name: pick(c["brand.name"], fallback.brand.name),
    email: pick(c["brand.email"], fallback.brand.email),
    phone: pick(c["brand.phone"], fallback.brand.phone),
    city: pick(c["brand.city"], fallback.brand.city),
    state: pick(c["brand.state"], fallback.brand.state),
  };

  const footer = {
    ...fallback.footer,
    blurb: pick(c["footer.blurb"], fallback.footer.blurb),
    columns: arr(c["footer.columns"], fallback.footer.columns),
  };

  const outcomes = {
    ...fallback.outcomes,
    kicker: pick(c["outcomes.kicker"], fallback.outcomes.kicker),
    title: pick(c["outcomes.title"], fallback.outcomes.title),
    body: pick(c["outcomes.body"], fallback.outcomes.body),
    // Only published statistics reach this point; when none are
    // published the section keeps its built-in illustrative cards,
    // which carry their own "replace before publishing" caveat.
    items:
      site.statistics?.length > 0
        ? site.statistics.map((s) => ({
            tag: "Figure",
            name: s.label,
            detail: s.label,
            metric: s.value,
          }))
        : fallback.outcomes.items,
  };

  const programmes = {
    ...fallback.programmes,
    items:
      site.programmes?.length > 0
        ? site.programmes.map((p) => ({
            code: p.code,
            name: p.name,
            tag: p.tag,
            duration: p.durationWeeks ? `${p.durationWeeks} weeks` : "",
            level: p.level ?? "",
            summary: p.summary,
            points: p.points ?? [],
            // The mock panel is a design asset, matched by position.
            mock: fallback.programmes.items[
              site.programmes.indexOf(p) % fallback.programmes.items.length
            ]?.mock,
          }))
        : fallback.programmes.items,
  };

  const faq = {
    ...fallback.faq,
    items:
      site.faqs?.length > 0
        ? site.faqs.map((f) => ({ q: f.question, a: f.answer }))
        : fallback.faq.items,
  };

  return {
    ...fallback,
    source: "api",
    brand, hero, about, why, shift, coverage, cta, footer,
    outcomes, programmes, faq,
    nav: arr(c["nav.items"], fallback.nav),
    marquee: arr(c["marquee.items"], fallback.marquee),
  };
}

/**
 * Resolves the content every page renders.
 *
 * The shape handed back is exactly what the components already expect,
 * so no component needs to know whether a value came from the database
 * or from the copy built into the site. Anything the API does not
 * supply falls back key by key, which means:
 *
 *  - a partially populated database still renders a complete page
 *  - an API outage changes nothing a visitor can see
 *  - a fresh clone with no database at all still builds
 *
 * Routing and layout are never taken from the API. Navigation links,
 * footer link columns and component structure are decided in code, so
 * no edit in the admin portal can point the site at a dead URL or
 * remove a section the page depends on.
 */

import * as fallback from "./content.js";
import * as homeFallback from "./home.js";
import { aboutPage, careersPage, outcomesPage } from "./pages.js";
import {
  programmesIntro,
  programmes as programmeFallback,
} from "./programmes.js";
import {
  contact as buildTimeContact,
  social as buildTimeSocial,
} from "./siteConfig.js";
import { fetchPublishedSite } from "./api.js";
import {
  arr,
  mergeAbout,
  mergeCareers,
  mergeContact,
  mergeContactPage,
  mergeHome,
  mergeOutcomes,
  mergeProgramme,
  mergeProgrammesIntro,
  mergeSocial,
  pick,
} from "./merge.js";

/**
 * Everything the site renders, merged and ready.
 *
 * One call per request path, cached by Next for REVALIDATE_SECONDS.
 */
export async function getSiteContent() {
  const site = await fetchPublishedSite();

  // No API, or nothing published: hand back the built-in content.
  const c = site?.content ?? {};
  const pages = site?.pages ?? {};
  const settings = site?.settings ?? {};

  /* ── Homepage first interface ───────────────────────────────
   *
   * The hero's copy is editable as content blocks, but its layout,
   * video, animation and the navigation above it are not represented
   * in the CMS at all. Nothing below can change them.
   */
  const hero = {
    ...fallback.hero,
    kicker: pick(c["hero.kicker"], fallback.hero.kicker),
    lines: arr(c["hero.headline"], fallback.hero.lines),
    accent: pick(c["hero.accent"], fallback.hero.accent),
    body: pick(c["hero.body"], fallback.hero.body),
    // A button's words are editable; where it goes is not, so only the
    // label is taken from the CMS and the href stays in code.
    primary: {
      ...fallback.hero.primary,
      label: pick(c["hero.primaryCta"], fallback.hero.primary?.label),
    },
    secondary: {
      ...fallback.hero.secondary,
      label: pick(c["hero.secondaryCta"], fallback.hero.secondary?.label),
    },
  };

  const brand = {
    ...fallback.brand,
    name: pick(c["brand.name"], fallback.brand.name),
    city: pick(c["brand.city"], fallback.brand.city),
    state: pick(c["brand.state"], fallback.brand.state),
  };

  // `columns` is deliberately not read from the database. Like nav, it
  // is routing rather than editorial copy. The blurb is prose, so that
  // one stays overridable.
  const footer = {
    ...fallback.footer,
    blurb: pick(c["footer.blurb"], fallback.footer.blurb),
  };

  const contact = mergeContact(settings, buildTimeContact);
  const social = mergeSocial(settings, buildTimeSocial);

  /* ── Programme cards ────────────────────────────────────── */

  const programmes = {
    items:
      site?.programmes?.length > 0
        ? site.programmes.map((p) => ({
            code: p.code,
            name: p.name,
            tag: p.tag,
            href: `/programmes/${p.slug}`,
            // Duration and level appear only when actually set.
            meta: [
              p.durationWeeks ? `${p.durationWeeks} weeks` : null,
              p.level || null,
            ]
              .filter(Boolean)
              .join(" · "),
            summary: p.summary,
            points: p.points ?? [],
            image: p.image ?? null,
          }))
        : // No API. The built-in programme detail is the only copy of
          // this data in the site, so the cards are derived from it
          // rather than duplicated.
          programmeFallback.map((p) => ({
            code: p.code,
            name: p.name,
            tag: p.tag,
            href: `/programmes/${p.slug}`,
            meta: "",
            summary: p.summary,
            points: p.skills?.slice(0, 4) ?? [],
            image: null,
          })),
  };

  return {
    source: site ? "api" : "static",

    // First interface, and site chrome
    hero,
    brand,
    footer,
    // Routing, decided in code. Never read from the database, so no
    // edit in the portal can point the site at a URL that does not
    // exist.
    nav: fallback.nav,
    contact,
    social,

    // Shared collections
    programmes,
    jobs: site?.jobs ?? [],
    // Kept so a preview can rebuild the homepage cards the same way.
    programmesRaw: site?.programmes ?? [],

    // Page documents, merged over their built-in copy
    pages: {
      home: homeWithLiveProgrammes(
        mergeHome(pages.home?.content, homeFallback),
        site?.programmes,
      ),
      about: mergeAbout(pages.about?.content, aboutPage),
      outcomes: mergeOutcomes(pages.outcomes?.content, outcomesPage),
      careers: mergeCareers(pages.careers?.content, careersPage, site?.jobs),
      programmes: mergeProgrammesIntro(
        pages.programmes?.content,
        programmesIntro,
      ),
      contact: mergeContactPage(pages.contact?.content),
    },

    // SEO metadata set per page in the admin portal
    seo: Object.fromEntries(
      Object.entries(pages).map(([key, page]) => [
        key,
        {
          title: page?.seoTitle ?? null,
          description: page?.seoDescription ?? null,
        },
      ]),
    ),
  };
}

/**
 * Puts the published programmes into the homepage's programme cards.
 *
 * The cards' illustrations are design assets held in the site, not
 * content, so they are matched by position rather than fetched. A
 * programme with its own cover image uses that instead.
 */
function homeWithLiveProgrammes(home, live) {
  if (!Array.isArray(live) || live.length === 0) return home;

  const builtIn = homeFallback.programmes.items;

  return {
    ...home,
    programmes: {
      ...home.programmes,
      items: live.map((p, i) => ({
        ...(builtIn[i % builtIn.length] ?? {}),
        code: p.code,
        name: p.name,
        tag: p.tag,
        href: `/programmes/${p.slug}`,
        body: p.summary,
        areas: arr(p.points, builtIn[i % builtIn.length]?.areas ?? []),
        image: p.image?.url
          ? {
              src: p.image.url,
              alt: p.image.alt ?? "",
              width: p.image.width ?? 1200,
              height: p.image.height ?? 750,
            }
          : (builtIn[i % builtIn.length]?.image ?? null),
      })),
    },
  };
}

/**
 * Resolves a page's content, honouring an editor's preview link.
 *
 * `searchParams` comes from the admin portal's "Preview draft" button
 * and carries a signed, ten-minute token. The API verifies it and
 * returns the draft; without a valid token it returns nothing and this
 * falls through to the published content, exactly as it would for a
 * visitor who guessed the URL.
 *
 * Returns `{ content, isPreview }` so a page can say plainly that it
 * is showing unpublished work.
 */
export async function getPageContent(key, searchParams, site) {
  const content = site ?? (await getSiteContent());
  const published = content.pages?.[key] ?? null;

  const params = (await searchParams) ?? {};
  const token = params.token;
  const expires = params.expires;
  const previewing =
    params.preview === "1" && typeof token === "string" && expires;

  if (!previewing) return { content: published, isPreview: false };

  const { fetchPreview } = await import("./api.js");
  const result = await fetchPreview(key, token, expires);
  const draft = result?.item?.content;
  if (!draft) return { content: published, isPreview: false };

  // The same merge the published path uses, so a preview renders
  // through exactly the code a visitor will get.
  const merged = {
    home: () =>
      homeWithLiveProgrammes(
        mergeHome(draft, homeFallback),
        content.programmesRaw,
      ),
    about: () => mergeAbout(draft, aboutPage),
    outcomes: () => mergeOutcomes(draft, outcomesPage),
    careers: () => mergeCareers(draft, careersPage, content.jobs),
    programmes: () => mergeProgrammesIntro(draft, programmesIntro),
    contact: () => mergeContactPage(draft),
  }[key];

  return { content: merged ? merged() : published, isPreview: true };
}

/**
 * One programme's full detail.
 *
 * Returns null when the slug is not a published programme, so the page
 * can render a 404 rather than an empty shell. A programme that exists
 * in the built-in content but is not published in the database is
 * still treated as missing: the database decides what is public.
 */
export async function getProgramme(slug, site) {
  const content = site ?? (await getSiteContent());
  const builtIn = programmeFallback.find((p) => p.slug === slug) ?? null;

  const { fetchProgramme } = await import("./api.js");
  const result = await fetchProgramme(slug);

  if (result?.item) return mergeProgramme(result.item, builtIn);

  // No API. Fall back to the built-in detail so a local build without
  // a database still renders, but only for a programme the site knows
  // about.
  if (content.source === "static" && builtIn) return builtIn;

  return null;
}

/** Slugs to pre-render, from whichever source is available. */
export async function getProgrammeSlugs() {
  const site = await fetchPublishedSite();
  if (site?.programmes?.length) return site.programmes.map((p) => p.slug);
  return programmeFallback.map((p) => p.slug);
}

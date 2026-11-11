// ─────────────────────────────────────────────────────────────
// Site chrome and the homepage's first screen.
//
// This file holds only what the admin portal cannot change and what
// the site must still render when the API is unreachable:
//
//   brand   — company identity (editable as content blocks)
//   nav     — routing structure (NOT editable: an edit must not be
//             able to point the site at a dead URL)
//   hero    — the first screen's copy (its words are editable as
//             content blocks; its layout, animation and mark are not
//             represented in the CMS at all)
//   footer  — the blurb is editable; the link columns are routing
//
// Everything else the site renders lives with the thing that renders
// it: page documents in lib/pages.js and lib/home.js, programme
// detail in lib/programmes.js, contact details in lib/siteConfig.js.
// Copy is not duplicated here as a second copy to fall back to.
// ─────────────────────────────────────────────────────────────

export const brand = {
  name: "Polarsight",
  // Email and phone are NOT here. They live in configuration, with
  // no fallback, so an unset value shows nothing rather than a made
  // up address. See lib/siteConfig.js and .env.example.
  city: "Chennai",
  state: "Tamil Nadu",
};

// Site routes. `newTab` opens the entry in its own browser tab.
// This is routing structure rather than editorial copy, so it is NOT
// overridable from the admin portal.
export const nav = [
  { label: "Home", href: "/" },
  { label: "Programmes", href: "/programmes" },
  { label: "Outcomes", href: "/outcomes" },
  { label: "About us", href: "/about", newTab: true },
  { label: "Careers", href: "/careers", newTab: true },
  { label: "Contact us", href: "/contact" },
];

// The homepage's first screen. Each field below has a matching
// content block in the database (hero.kicker, hero.headline,
// hero.accent, hero.body, hero.primaryCta, hero.secondaryCta); the
// button destinations deliberately have none.
export const hero = {
  kicker: "Cybersecurity Training · Campus Placement · India",
  lines: ["Building the next", "generation of"],
  accent: "cybersecurity professionals.",
  body: "Structured cybersecurity training, practical security environments and career-focused development designed to build industry-ready professionals.",
  primary: { label: "Talk to us", href: "#contact" },
  secondary: { label: "See our tracks", href: "#programmes" },
};

export const footer = {
  blurb:
    "Polarsight runs hands-on cybersecurity training built around the practical work security roles actually involve.",
  // Link columns are routing, like nav, and are not editable.
  columns: [
    {
      title: "Programmes",
      links: [
        { label: "SOC Analyst", href: "/programmes/soc-analyst" },
        { label: "AI Security Engineer", href: "/programmes/ai-security-engineer" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Outcomes", href: "/outcomes" },
        { label: "About us", href: "/about", newTab: true },
        { label: "Careers", href: "/careers", newTab: true },
        { label: "Contact us", href: "/contact" },
      ],
    },
  ],
};

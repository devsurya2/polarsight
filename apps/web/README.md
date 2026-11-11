# Polarsight website

The public site. Next.js 16 (App Router), React 19, Tailwind CSS 4,
Framer Motion and lucide-react. Every route is statically prerendered
and revalidated once a minute.

Content comes from the admin portal through the API, falling back key
by key to the copy in `lib/` — so a partially populated database still
renders a complete page, an API outage changes nothing a visitor can
see, and a fresh clone with no database at all still builds.

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

The API's address comes from `API_URL` in the repository-root `.env`.
Without it the site renders entirely from the built-in copy.

## Where the content lives

| File | Holds |
|---|---|
| `lib/content.js` | Site chrome: brand, nav, the hero, the footer |
| `lib/home.js` | Every homepage section after the hero |
| `lib/pages.js` | The About, Outcomes and Careers pages |
| `lib/programmes.js` | Programme detail, and the programmes intro |
| `lib/siteConfig.js` | Contact details and social URLs, from the environment |

Each of those is the **fallback** for one editable surface in the
portal. Copy is never duplicated between them: if a page renders it,
exactly one module holds it.

`lib/getContent.js` resolves what a page actually renders, and
`lib/merge.js` layers the published document over the built-in copy
field by field. When a component gains or loses a field, change it in
the component, in `lib/merge.js`, in the API's
`modules/pages/schema.ts` and in the seed — those four move together.

### What the portal cannot change

Navigation links, footer link columns and every button's destination
are decided in code and never read from the database, so no edit can
point the site at a URL that does not exist.

The homepage's **first screen** — the hero's layout, its animated mark
and the navigation above it — has no representation in the CMS at all.
The hero's words are editable as content blocks; nothing else about it
is.

## Structure

| File | Purpose |
|---|---|
| `app/globals.css` | Design tokens, base styles, the cursor |
| `app/layout.jsx` | Fonts, metadata, skip link |
| `app/page.jsx` | The homepage's section order |
| `app/api/revalidate/` | On-demand ISR, called by the API on publish |
| `components/ui.jsx` | Section, Kicker, Heading, Button, Tag, Reveal, Hairline |
| `components/Hero.jsx`, `HeroMark.jsx` | The first screen |
| `components/home/` | One component per homepage section |
| `components/PageShell.jsx` | Chrome for every page other than the homepage |

Homepage order: hero, intro, programmes, approach, outcomes,
institutions, team, closing. A section an administrator has hidden is
not rendered at all.

## Design notes

Type is Michroma for display, Space Grotesk for body and JetBrains
Mono for the small uppercase labels and technical details.

Colour is defined as tokens in `app/globals.css` under `@theme`. There
is one accent hue: `--color-accent` for fills, indicators and marks,
and `--color-accent-ice` as the text-safe variant, because electric
blue does not clear 4.5:1 as small text on these surfaces. Re-check
contrast before changing either.

The hero mark is a canvas point cloud: three artwork layers are
sampled into dots at runtime and projected by hand each frame, so
there is no data file to ship. It holds still under
`prefers-reduced-motion`.

Accessibility in place: a skip link, visible focus rings, correct
`aria-expanded`/`aria-controls` on the curriculum accordions, labelled
form errors announced with `role="alert"`, text alternatives for every
illustration, and `prefers-reduced-motion` honoured globally.

## Claims

Nothing in `lib/` asserts a statistic, a testimonial, an existing
college or industry partnership, a placement rate, a fee, a
certification or an employment guarantee, because none of those are
established. Keep it that way: a figure may only go on the site once
an administrator has verified it in the portal.

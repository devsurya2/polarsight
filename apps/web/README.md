# Polarsight

Marketing site for Polarsight, a campus cybersecurity training programme that
runs hands-on labs inside colleges and connects graduates to hiring teams.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Framer Motion
and lucide-react. The whole page prerenders as static HTML.

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

## Editing the content

**All site copy lives in `lib/content.js`.** Change the text there and the page
updates. You should not need to touch a component to change wording, section
headings, track names, FAQ entries or contact details.

Anything marked `PLACEHOLDER` in that file is invented and must be replaced
before the site goes live:

| What | Where |
|---|---|
| Email and phone number | `brand` |
| Partner institutions and cohort figures | `outcomes` |

The `outcomes.note` line is rendered on the page as a visible caveat. Delete it
once the figures are real.

## Structure

| File | Purpose |
|---|---|
| `app/globals.css` | Design tokens, base styles, keyframes |
| `app/layout.jsx` | Fonts, metadata, skip link |
| `app/page.jsx` | Section order |
| `lib/content.js` | Every piece of copy |
| `components/ui.jsx` | Section, Heading, Button, Chip, Reveal primitives |
| `components/mocks/` | The small illustrative UI panels |
| `components/DotShield.jsx` | Hero dot-matrix illustration |

Sections render in this order: hero, about, who we serve, programmes, outcomes,
why us, what changes, marquee, coverage, FAQ, closing call to action, footer.

## Design notes

Type is Space Grotesk for everything structural and JetBrains Mono for the
small uppercase labels, numbers and technical details.

Colour is defined as tokens in `app/globals.css` under `@theme`. There is one
action colour, `--color-leaf`, with `--color-leaf-deep` as its accessible text
variant. Every text and background pair in the palette meets WCAG AA at 4.5:1
or better, the lowest being 4.58:1. If you change `--color-leaf-deep` or
`--color-faint`, re-check contrast before shipping.

Accessibility work already in place: a skip link, visible focus rings, arrow-key
navigation on the audience tabs, proper `aria-expanded` and `aria-controls` on
the FAQ, text alternatives for the animated marquee and illustrations, and
`prefers-reduced-motion` honoured globally.

## Attribution

The layout follows common marketing-site conventions. All copy, the logo, the
dot-matrix illustration and the UI panels are original to this project.

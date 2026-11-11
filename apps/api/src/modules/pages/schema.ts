/**
 * Shapes of the editable page documents.
 *
 * Every field here corresponds to something the public site actually
 * renders, and every editable thing the site renders appears here.
 * That correspondence is the point: a field an editor can fill in but
 * which changes nothing is worse than no field at all, and copy on the
 * page that cannot be reached from the portal is just as bad.
 *
 * What is deliberately NOT here:
 *
 *  - Routes and link targets. A CTA's label is editable, its `href` is
 *    not, so an edit cannot point the site at a URL that does not
 *    exist. The same reasoning keeps navigation and footer link
 *    columns out of the CMS entirely.
 *  - The homepage's first screen. The hero, navigation and video are
 *    the site's first interface, not content; they have no region
 *    here, so nothing done in the portal can alter them. (The hero's
 *    words are editable as keyed content blocks, which is a separate,
 *    narrower surface.)
 *
 * When a component gains or loses a field, change it here too — and
 * the seed, and `apps/web/lib/merge.js`. Those three move together.
 */

import { z } from "zod";
import { requiredSafeText, safeText, safeTextList } from "../../lib/sanitize.js";

/* ── Field helpers ────────────────────────────────────────── */

const heading = (max = 300) => safeText(max, "Heading");
const body = (max = 4_000) => safeText(max, "Body");
/** The small label above a heading. */
const kicker = () => safeText(80, "Eyebrow label");
/** A button's words. Its destination is fixed in code. */
const ctaLabel = () => safeText(80, "Button label");

/** An optional reference to an uploaded image, with its alt text. */
const imageRef = z
  .object({
    mediaId: z.string().min(1).nullish(),
    alt: safeText(300, "Alt text").nullish(),
  })
  .nullish();

/** A titled item: the shape of every "card" list on the site. */
const titledItem = z
  .object({
    title: requiredSafeText(240, "Title"),
    body: body(2_000).optional(),
  })
  .strict();

/** Common to every section: a heading, a blurb, and a visibility flag. */
const section = {
  kicker: kicker(),
  heading: heading(),
  body: body(),
  visible: z.boolean().default(true),
  /** Lower numbers appear first. Fixed by the page's design. */
  order: z.coerce.number().int().min(0).max(99).default(0),
};

/* ── Homepage ─────────────────────────────────────────────────
 *
 * The sections below the first screen, in the order the page renders
 * them. Each mirrors exactly one component in components/home/.
 */

export const homeSchema = z
  .object({
    // components/home/Intro.jsx
    intro: z
      .object({
        ...section,
        /** Rendered as a second paragraph under the body. */
        support: body(2_000),
        ctaLabel: ctaLabel(),
        image: imageRef,
      })
      .strict(),

    // components/home/Programmes.jsx — the cards come from the
    // Programme table, not from here.
    programmes: z.object(section).strict(),

    // components/home/Approach.jsx
    approach: z
      .object({
        ...section,
        items: z.array(titledItem).max(12).default([]),
        image: imageRef,
      })
      .strict(),

    // components/home/Outcomes.jsx
    outcomes: z
      .object({
        ...section,
        ctaLabel: ctaLabel(),
        items: z.array(titledItem).max(12).default([]),
      })
      .strict(),

    // components/home/Institutions.jsx
    institutions: z
      .object({
        ...section,
        points: safeTextList(12, 200, "Point").default([]),
        ctaLabel: ctaLabel(),
        image: imageRef,
      })
      .strict(),

    // components/home/Team.jsx
    team: z
      .object({
        ...section,
        roles: safeTextList(12, 120, "Role").default([]),
        ctaLabel: ctaLabel(),
        image: imageRef,
      })
      .strict(),

    // components/home/Closing.jsx — two buttons, labels only.
    closing: z
      .object({
        ...section,
        primaryLabel: ctaLabel(),
        secondaryLabel: ctaLabel(),
      })
      .strict(),
  })
  .strict();

/* ── About ──────────────────────────────────────────────────── */

export const aboutSchema = z
  .object({
    // The page's opening block.
    hero: z
      .object({
        kicker: kicker(),
        title: heading(),
        visible: z.boolean().default(true),
        order: z.coerce.number().int().min(0).max(99).default(0),
      })
      .strict(),

    whoWeAre: z
      .object({
        ...section,
        paragraphs: z.array(requiredSafeText(2_000, "Paragraph")).max(12).default([]),
      })
      .strict(),

    mission: z.object(section).strict(),
    vision: z.object(section).strict(),

    approach: z
      .object({ ...section, items: z.array(titledItem).max(12).default([]) })
      .strict(),

    focus: z
      .object({ ...section, items: z.array(titledItem).max(12).default([]) })
      .strict(),

    // The closing block at the foot of the page.
    closing: z
      .object({
        ...section,
        primaryLabel: ctaLabel(),
        secondaryLabel: ctaLabel(),
      })
      .strict(),
  })
  .strict();

/* ── Outcomes ───────────────────────────────────────────────── */

export const outcomesSchema = z
  .object({
    hero: z
      .object({
        kicker: kicker(),
        title: heading(),
        body: body(),
        visible: z.boolean().default(true),
        order: z.coerce.number().int().min(0).max(99).default(0),
      })
      .strict(),

    sections: z
      .array(
        z
          .object({
            id: z
              .string()
              .trim()
              .min(1)
              .max(80)
              .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only"),
            heading: requiredSafeText(300, "Heading"),
            body: body(),
            /** Titled cards. A section uses these or `examples`, not both. */
            points: z.array(titledItem).max(20).default([]),
            /** A numbered list of concrete examples. */
            examples: safeTextList(30, 300, "Example").default([]),
            visible: z.boolean().default(true),
          })
          .strict()
      )
      .max(12)
      .default([]),

    pathways: z
      .object({
        ...section,
        groups: z
          .array(
            z
              .object({
                programme: requiredSafeText(160, "Programme"),
                /** Links to /programmes/<slug> when it matches one. */
                slug: safeText(140, "Slug").nullish(),
                roles: safeTextList(20, 160, "Role").default([]),
              })
              .strict()
          )
          .max(12)
          .default([]),
        /** The qualifier under the pathways. */
        note: body(1_000),
      })
      .strict(),
  })
  .strict();

/* ── Programmes landing ─────────────────────────────────────── */

export const programmesPageSchema = z
  .object({
    // The programme cards themselves come from the Programme table.
    // This page owns only its opening block.
    hero: z
      .object({
        kicker: kicker(),
        title: heading(),
        body: body(),
        visible: z.boolean().default(true),
        order: z.coerce.number().int().min(0).max(99).default(0),
      })
      .strict(),
  })
  .strict();

/* ── Careers ────────────────────────────────────────────────── */

export const careersPageSchema = z
  .object({
    hero: z
      .object({
        kicker: kicker(),
        title: heading(),
        body: body(),
        ctaLabel: ctaLabel(),
        visible: z.boolean().default(true),
        order: z.coerce.number().int().min(0).max(99).default(0),
      })
      .strict(),

    why: z
      .object({ ...section, items: z.array(titledItem).max(12).default([]) })
      .strict(),

    // Open positions come from the JobOpening table.
    positions: z.object(section).strict(),

    employmentTypes: z
      .object({ ...section, items: safeTextList(12, 120, "Type").default([]) })
      .strict(),

    eligibility: z
      .object({ ...section, items: safeTextList(20, 300, "Requirement").default([]) })
      .strict(),

    process: z
      .object({ ...section, steps: z.array(titledItem).max(12).default([]) })
      .strict(),

    apply: z.object(section).strict(),
  })
  .strict();

/* ── Contact ────────────────────────────────────────────────── */

export const contactPageSchema = z
  .object({
    hero: z
      .object({
        kicker: kicker(),
        title: heading(),
        body: body(),
        visible: z.boolean().default(true),
        order: z.coerce.number().int().min(0).max(99).default(0),
      })
      .strict(),

    // Contact details come from Settings, not from page copy, so one
    // change updates the footer and this page at once.
    //
    // The enquiry form's own words — its labels, validation messages
    // and confirmation — stay in code: they are interface text tied to
    // behaviour, not page copy, and one of them interpolates the
    // address the visitor typed.
    panel: z
      .object({
        kicker: kicker(),
        note: body(600),
        visible: z.boolean().default(true),
        order: z.coerce.number().int().min(0).max(99).default(0),
      })
      .strict(),
  })
  .strict();

/* ── Registry ───────────────────────────────────────────────── */

/** Every editable page, by route key. */
export const PAGE_SCHEMAS = {
  home: homeSchema,
  about: aboutSchema,
  outcomes: outcomesSchema,
  programmes: programmesPageSchema,
  careers: careersPageSchema,
  contact: contactPageSchema,
} as const;

export type PageKey = keyof typeof PAGE_SCHEMAS;

export const PAGE_KEYS = Object.keys(PAGE_SCHEMAS) as PageKey[];

export const PAGE_LABELS: Record<PageKey, string> = {
  home: "Homepage",
  about: "About us",
  outcomes: "Outcomes",
  programmes: "Programmes",
  careers: "Careers",
  contact: "Contact",
};

/** The public route each page key corresponds to. */
export const PAGE_ROUTES: Record<PageKey, string> = {
  home: "/",
  about: "/about",
  outcomes: "/outcomes",
  programmes: "/programmes",
  careers: "/careers",
  contact: "/contact",
};

/** A one-line description of what each page's editor controls. */
export const PAGE_DESCRIPTIONS: Record<PageKey, string> = {
  home: "Everything below the homepage's first screen. The hero, navigation and video are not editable.",
  about: "Who we are, mission, vision, approach and focus areas.",
  outcomes: "What the programmes are built to achieve, and the career pathways.",
  programmes: "The opening block of the programmes listing. The cards themselves come from Programmes.",
  careers: "The careers page copy. Open positions come from Job openings.",
  contact: "The contact page copy. Addresses and social links come from Settings.",
};

export const isPageKey = (value: string): value is PageKey => value in PAGE_SCHEMAS;

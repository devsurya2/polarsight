/**
 * POLARSIGHT database seed.
 *
 * Idempotent: safe to run repeatedly. Everything upserts on a natural
 * key, and anything an administrator can edit is only filled in when
 * it is still empty, so re-running never clobbers work done in the
 * admin portal.
 *
 * The website copy is read from the public site's own content modules,
 * so the database starts out matching exactly what is on the page
 * today. Content that is already public is seeded PUBLISHED; anything
 * not currently on the site, or not yet verified, is seeded DRAFT.
 */

import { PrismaClient, PublishStatus, ContentType, SettingType } from "@prisma/client";
import bcrypt from "bcryptjs";

// The existing site's copy. Importing it keeps one source of truth
// rather than retyping the text here.
// @ts-expect-error — plain JavaScript module from apps/web, no types
import * as site from "../../web/lib/content.js";
// @ts-expect-error — plain JavaScript module from apps/web, no types
import * as home from "../../web/lib/home.js";
// @ts-expect-error — plain JavaScript module from apps/web, no types
import * as pages from "../../web/lib/pages.js";
// @ts-expect-error — plain JavaScript module from apps/web, no types
import { programmes as programmeDetail, programmesIntro } from "../../web/lib/programmes.js";

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

/* ── Permissions ──────────────────────────────────────────── */

const PERMISSIONS: Array<{ key: string; group: string; description: string }> = [
  { key: "admin:read", group: "Administrators", description: "View admin accounts" },
  { key: "admin:write", group: "Administrators", description: "Create and edit admin accounts" },
  { key: "admin:delete", group: "Administrators", description: "Disable or remove admin accounts" },
  { key: "role:read", group: "Administrators", description: "View roles and permissions" },
  { key: "role:write", group: "Administrators", description: "Create roles and change permissions" },

  { key: "page:read", group: "Website pages", description: "View page content" },
  { key: "page:write", group: "Website pages", description: "Edit page drafts and SEO" },
  { key: "page:publish", group: "Website pages", description: "Publish and unpublish pages" },

  { key: "content:read", group: "Website content", description: "View content blocks" },
  { key: "content:write", group: "Website content", description: "Edit content blocks" },
  { key: "content:publish", group: "Website content", description: "Publish content blocks" },

  { key: "programme:read", group: "Programmes", description: "View programmes and curriculum" },
  { key: "programme:write", group: "Programmes", description: "Create and edit programmes and curriculum" },
  { key: "programme:delete", group: "Programmes", description: "Delete programmes" },
  { key: "programme:publish", group: "Programmes", description: "Publish, unpublish and archive programmes" },


  { key: "job:read", group: "Recruitment", description: "View job openings" },
  { key: "job:write", group: "Recruitment", description: "Create and edit job openings" },
  { key: "job:delete", group: "Recruitment", description: "Delete job openings" },
  { key: "job:publish", group: "Recruitment", description: "Publish and close job openings" },
  { key: "application:read", group: "Recruitment", description: "View trainer applications and resumes" },
  { key: "application:write", group: "Recruitment", description: "Update status, notes and assignment" },
  { key: "application:delete", group: "Recruitment", description: "Permanently delete an application" },
  { key: "application:export", group: "Recruitment", description: "Export applications" },

  { key: "enquiry:read", group: "Enquiries", description: "View enquiries" },
  { key: "enquiry:write", group: "Enquiries", description: "Update status, notes, assignment and follow-ups" },
  { key: "enquiry:export", group: "Enquiries", description: "Export enquiries" },
  { key: "enquiry:delete", group: "Enquiries", description: "Permanently delete an enquiry" },

  { key: "media:read", group: "Media", description: "View the media library" },
  { key: "media:write", group: "Media", description: "Upload and edit media" },
  { key: "media:delete", group: "Media", description: "Delete media" },

  // Listing versions is covered by the entity's own read permission;
  // only putting one back into a draft needs its own grant.
  { key: "version:restore", group: "Publishing", description: "Restore an earlier version into a draft" },

  { key: "setting:read", group: "Settings", description: "View website settings and integration health" },
  { key: "setting:write", group: "Settings", description: "Change website settings" },

  { key: "audit:read", group: "Audit", description: "View the audit log" },
];

const keys = PERMISSIONS.map((p) => p.key);
const matching = (...prefixes: string[]) =>
  keys.filter((k) => prefixes.some((p) => k.startsWith(`${p}:`)));

const CONTENT_KEYS = matching("page", "content", "programme", "media", "version");
const RECRUITMENT_KEYS = matching("job", "application");
const ENQUIRY_KEYS = matching("enquiry");

const ROLES: Array<{ name: string; description: string; permissions: string[] | "ALL" }> = [
  {
    name: "Super Admin",
    description: "Full access, including administrator, role and settings management.",
    permissions: "ALL",
  },
  {
    name: "Administrator",
    description:
      "Every operational module: content, programmes, recruitment, enquiries and media. Cannot manage administrators, roles or settings.",
    permissions: [
      ...CONTENT_KEYS,
      ...RECRUITMENT_KEYS,
      ...ENQUIRY_KEYS,
      "audit:read",
      "setting:read",
      "admin:read",
      "role:read",
    ],
  },
  {
    name: "Content Manager",
    description: "Manages website pages, programmes, curriculum and media.",
    permissions: [...CONTENT_KEYS, "enquiry:read"],
  },
  {
    name: "Recruitment Manager",
    description: "Manages job openings and the trainer application pipeline.",
    permissions: [
      ...RECRUITMENT_KEYS,
      "media:read",
      "media:write",
      "enquiry:read",
    ],
  },
  {
    name: "Enquiry Manager",
    description: "Handles contact enquiries and follow-ups. Read-only on website content.",
    permissions: [...ENQUIRY_KEYS, "content:read", "programme:read", "page:read"],
  },
];

/* ── Settings ─────────────────────────────────────────────── */

const SETTINGS: Array<{
  key: string;
  group: string;
  label: string;
  type: SettingType;
  value: string;
  hint?: string;
  isLocked?: boolean;
}> = [
  // General
  { key: "site.name", group: "general", label: "Company display name", type: SettingType.TEXT, value: "POLARSIGHT" },
  {
    key: "site.description",
    group: "general",
    label: "Website description",
    type: SettingType.LONG_TEXT,
    value:
      "A cybersecurity-focused training and workforce-readiness initiative developing practical security capabilities.",
  },
  { key: "site.logo", group: "general", label: "Logo", type: SettingType.MEDIA, value: "", hint: "Upload to the media library first." },
  { key: "site.favicon", group: "general", label: "Favicon", type: SettingType.MEDIA, value: "" },

  // SEO
  { key: "seo.defaultTitle", group: "seo", label: "Default page title", type: SettingType.TEXT, value: "POLARSIGHT" },
  {
    key: "seo.defaultDescription",
    group: "seo",
    label: "Default meta description",
    type: SettingType.LONG_TEXT,
    value:
      "Practical cybersecurity training in security operations and AI security, built around real investigative work.",
  },
  { key: "seo.socialImage", group: "seo", label: "Social sharing image", type: SettingType.MEDIA, value: "" },

  // Contact. Blank by default: an invented address is worse than none.
  { key: "contact.email", group: "contact", label: "Official email", type: SettingType.EMAIL, value: "", hint: "Leave blank and the website omits it entirely." },
  { key: "contact.phone", group: "contact", label: "Public phone number", type: SettingType.TEXT, value: "", hint: "Leave blank and the website omits it entirely." },
  { key: "contact.location", group: "contact", label: "Business location", type: SettingType.TEXT, value: "" },
  { key: "contact.institutionalEmail", group: "contact", label: "Institutional enquiries email", type: SettingType.EMAIL, value: "" },
  { key: "social.linkedin", group: "contact", label: "LinkedIn URL", type: SettingType.URL, value: "" },
  { key: "social.instagram", group: "contact", label: "Instagram URL", type: SettingType.URL, value: "" },
  { key: "social.github", group: "contact", label: "GitHub URL", type: SettingType.URL, value: "" },
  {
    key: "footer.copyright",
    group: "contact",
    label: "Copyright text",
    type: SettingType.TEXT,
    value: `© ${new Date().getFullYear()} PolarSight. All rights reserved.`,
  },

  // Security. Read-only here on purpose: these are enforced from the
  // server environment, and showing them as editable would imply the
  // admin portal can change how authentication works. It cannot.
  {
    key: "security.sessionPolicy",
    group: "security",
    label: "Session policy",
    type: SettingType.TEXT,
    value: "15-minute access token, 7-day rotating refresh token",
    hint: "Configured by JWT_ACCESS_TTL and JWT_REFRESH_TTL on the server.",
    isLocked: true,
  },
  {
    key: "security.loginPolicy",
    group: "security",
    label: "Login policy",
    type: SettingType.TEXT,
    value: "Account locks for 15 minutes after 8 consecutive failures",
    hint: "Configured on the server; changing it requires a deployment.",
    isLocked: true,
  },
  {
    key: "security.passwordPolicy",
    group: "security",
    label: "Password policy",
    type: SettingType.TEXT,
    value: "At least 12 characters, with upper case, lower case and a digit",
    isLocked: true,
  },
];

/* ── Helpers ──────────────────────────────────────────────── */

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** True when a string is a serialised object or array. */
function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * Creates a content block, or updates only its metadata.
 *
 * `value` is written on create but not on update, so an edit made in
 * the admin portal survives a re-seed.
 *
 * The exception is a block whose stored *shape* no longer matches what
 * the site expects — a value kept as JSON where the site now wants
 * plain text, for instance. That is a structural correction rather
 * than an editorial one, and leaving it alone renders the raw JSON on
 * the page, so it is rewritten.
 */
async function content(
  key: string,
  section: string,
  label: string,
  value: unknown,
  sortOrder = 0,
  opts: { type?: ContentType; locked?: boolean } = {}
) {
  // A key the site's content module no longer exports would otherwise
  // be written as an undefined value and fail at the database.
  if (value === undefined || value === null) {
    console.warn(`  skipped "${key}": the site's content module no longer provides it`);
    return;
  }

  const serialised = typeof value === "string" ? value : JSON.stringify(value);
  const resolvedType =
    typeof value === "string" ? (opts.type ?? ContentType.TEXT) : ContentType.JSON;

  const existing = await prisma.websiteContent.findUnique({
    where: { key },
    select: { type: true, value: true },
  });

  // The stored shape disagrees with the site's: repair it.
  //
  // Two ways that shows up: the recorded type differs, or a plain-text
  // block still holds a serialised object from when it carried one.
  // The second renders the raw JSON on the page, so it matters.
  const typeChanged = existing !== null && existing.type !== resolvedType;
  const staleStructure =
    existing !== null && resolvedType === ContentType.TEXT && looksLikeJson(existing.value);
  const wrongShape = typeChanged || staleStructure;

  if (wrongShape) {
    console.warn(
      `  repaired "${key}": ` +
        (staleStructure
          ? "held a serialised object where the site now reads plain text"
          : `recorded as ${existing!.type}, the site expects ${resolvedType}`)
    );
  }

  await prisma.websiteContent.upsert({
    where: { key },
    update: {
      section,
      label,
      type: resolvedType,
      sortOrder,
      isLocked: opts.locked ?? false,
      ...(wrongShape ? { value: serialised, draftValue: null } : {}),
    },
    create: {
      key,
      section,
      label,
      type: resolvedType,
      value: serialised,
      sortOrder,
      isLocked: opts.locked ?? false,
      status: PublishStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
}

/**
 * A page section in the shape the page schemas expect.
 *
 * Every field below corresponds to something a component renders; see
 * the comment at the top of modules/pages/schema.ts.
 */
const section = (
  kicker: string,
  heading: string,
  body: string,
  order: number,
  extra: Record<string, unknown> = {}
) => ({
  kicker: kicker ?? "",
  heading: heading ?? "",
  body: body ?? "",
  visible: true,
  order,
  ...extra,
});

/** A list of { title, body } items, as every card list is stored. */
const cards = (items: Array<{ title: string; body?: string }>) =>
  items.map((i) => ({ title: i.title, body: i.body ?? "" }));

/** An image region. `mediaId` is null until somebody picks one in the
 *  portal; the site falls back to its built-in illustration. */
const image = (alt: string) => ({ mediaId: null, alt });

/**
 * Creates an editable page with its draft and published document
 * identical, because this copy is already live on the site.
 *
 * `force` rewrites a page whose stored document no longer matches the
 * schema — needed when the editable regions change, since a document
 * written against the old shape would be refused on publish.
 */
async function page(
  key: string,
  title: string,
  document: unknown,
  seo: { seoTitle: string; seoDescription: string },
  force = false
) {
  const existing = await prisma.sitePage.findUnique({
    where: { key },
    select: { id: true, draft: true },
  });

  if (existing && !force) return "kept";

  if (existing) {
    await prisma.sitePage.update({
      where: { key },
      data: {
        title,
        draft: document as object,
        published: document as object,
        status: PublishStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    return "rewritten";
  }

  await prisma.sitePage.create({
    data: {
      key,
      title,
      seoTitle: seo.seoTitle,
      seoDescription: seo.seoDescription,
      draft: document as object,
      published: document as object,
      status: PublishStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
  return "created";
}

/**
 * True when a page's stored document no longer matches the editable
 * regions the site has. Re-seeding rewrites those, and only those.
 */
async function pageNeedsRewrite(key: string, expected: object): Promise<boolean> {
  const existing = await prisma.sitePage.findUnique({
    where: { key },
    select: { draft: true },
  });
  if (!existing) return false;

  const stored = Object.keys((existing.draft as object) ?? {}).sort();
  const wanted = Object.keys(expected).sort();
  return stored.join(",") !== wanted.join(",");
}

/* ── Seed ─────────────────────────────────────────────────── */

async function main() {
  console.log("→ permissions");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description, group: p.group },
      create: p,
    });
  }
  // Remove permissions that no longer exist in code, so a role cannot
  // hold a capability nothing enforces any more.
  const removed = await prisma.permission.deleteMany({ where: { key: { notIn: keys } } });
  if (removed.count) console.log(`  removed ${removed.count} obsolete permission(s)`);

  console.log("→ roles");
  const allPermissions = await prisma.permission.findMany();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description, isSystem: true },
      create: { name: r.name, description: r.description, isSystem: true },
    });

    const wanted =
      r.permissions === "ALL"
        ? allPermissions
        : allPermissions.filter((p) => (r.permissions as string[]).includes(p.key));

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  console.log("→ first administrator");
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env");
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }
  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { name: "Super Admin" } });
  // The password is set on create only: a re-seed must not reset a
  // password the administrator has since changed.
  await prisma.adminUser.upsert({
    where: { email },
    update: { roleId: superAdmin.id, isActive: true },
    create: {
      email,
      name: "Super Admin",
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      roleId: superAdmin.id,
    },
  });

  console.log("→ settings");
  for (const s of SETTINGS) {
    await prisma.siteSetting.upsert({
      where: { key: s.key },
      // Value is not updated: it is the administrator's to own.
      update: {
        group: s.group,
        label: s.label,
        type: s.type,
        hint: s.hint ?? null,
        isLocked: s.isLocked ?? false,
      },
      create: {
        key: s.key,
        group: s.group,
        label: s.label,
        type: s.type,
        value: s.value,
        hint: s.hint ?? null,
        isLocked: s.isLocked ?? false,
      },
    });
  }

  console.log("→ website content blocks");

  /*
   * Only the blocks the website actually reads.
   *
   * These are the hero's words and the footer's blurb and brand
   * details — everything else on the site is managed as a page
   * document or as a database record, so a keyed block for it would be
   * a field that changes nothing.
   *
   * Navigation links and footer link columns are deliberately NOT
   * here: they are routing, decided in code, so an edit cannot point
   * the site at a URL that does not exist.
   */
  const { hero, footer, brand } = site as any;

  await content("hero.kicker", "hero", "Eyebrow label", hero.kicker, 0);
  await content("hero.headline", "hero", "Headline lines", hero.lines, 1);
  await content("hero.accent", "hero", "Highlighted words", hero.accent, 2);
  await content("hero.body", "hero", "Supporting paragraph", hero.body, 3);
  await content("hero.primaryCta", "hero", "Primary button label", hero.primary?.label, 4);
  await content("hero.secondaryCta", "hero", "Secondary button label", hero.secondary?.label, 5);

  await content("footer.blurb", "footer", "Footer blurb", footer.blurb, 0);

  await content("brand.name", "brand", "Company name", brand.name, 0);
  await content("brand.city", "brand", "City", brand.city, 1);
  await content("brand.state", "brand", "State", brand.state, 2);

  // Blocks from an earlier version of the site. The sections they fed
  // no longer exist, so they are removed rather than left in the
  // portal as copy an administrator could edit to no effect.
  const liveKeys = [
    "hero.kicker", "hero.headline", "hero.accent", "hero.body",
    "hero.primaryCta", "hero.secondaryCta",
    "footer.blurb",
    "brand.name", "brand.city", "brand.state",
  ];
  const retiredBlocks = await prisma.websiteContent.deleteMany({
    where: { key: { notIn: liveKeys } },
  });
  if (retiredBlocks.count) {
    console.log(`  removed ${retiredBlocks.count} block(s) the site no longer reads`);
  }

  console.log("→ editable pages");

  const ap = pages.aboutPage;
  const op = pages.outcomesPage;
  const cp = pages.careersPage;

  // Each document below mirrors exactly one page's components. When a
  // component gains or loses a field, change it here, in
  // modules/pages/schema.ts and in apps/web/lib/merge.js together.
  const documents: Record<string, { title: string; doc: object; seo: { seoTitle: string; seoDescription: string } }> = {
    /* Homepage — the sections BELOW the first screen. The hero,
       navigation and video are deliberately absent. */
    home: {
      title: "Homepage",
      doc: {
        intro: section(home.intro.kicker, home.intro.title, home.intro.body, 0, {
          support: home.intro.support,
          ctaLabel: home.intro.cta.label,
          image: image(home.intro.image.alt),
        }),
        programmes: section(
          home.programmes.kicker,
          home.programmes.title,
          home.programmes.body,
          1
        ),
        approach: section(home.approach.kicker, home.approach.title, home.approach.body, 2, {
          items: cards(home.approach.items),
          image: image(home.approach.image.alt),
        }),
        outcomes: section(home.outcomes.kicker, home.outcomes.title, home.outcomes.body, 3, {
          ctaLabel: home.outcomes.cta.label,
          items: cards(home.outcomes.items),
        }),
        institutions: section(
          home.institutions.kicker,
          home.institutions.title,
          home.institutions.body,
          4,
          {
            points: home.institutions.points,
            ctaLabel: home.institutions.cta.label,
            image: image(home.institutions.image.alt),
          }
        ),
        team: section(home.team.kicker, home.team.title, home.team.body, 5, {
          roles: home.team.roles,
          ctaLabel: home.team.cta.label,
          image: image(home.team.image.alt),
        }),
        closing: section("", home.closing.title, home.closing.body, 6, {
          primaryLabel: home.closing.primary.label,
          secondaryLabel: home.closing.secondary.label,
        }),
      },
      seo: {
        seoTitle: "POLARSIGHT",
        seoDescription:
          "Practical cybersecurity training in security operations and AI security.",
      },
    },

    about: {
      title: "About us",
      doc: {
        hero: { kicker: ap.kicker, title: ap.title, visible: true, order: 0 },
        whoWeAre: section("", ap.whoWeAre.heading, "", 1, {
          paragraphs: ap.whoWeAre.paragraphs,
        }),
        mission: section("", ap.mission.heading, ap.mission.body, 2),
        vision: section("", ap.vision.heading, ap.vision.body, 3),
        approach: section("", ap.approach.heading, "", 4, { items: cards(ap.approach.items) }),
        focus: section("", ap.focus.heading, "", 5, { items: cards(ap.focus.items) }),
        closing: section(
          "",
          "Want to talk to us about working together?",
          "Colleges, employers and practitioners are all welcome to get in touch.",
          6,
          { primaryLabel: "Contact us", secondaryLabel: "See open positions" }
        ),
      },
      seo: {
        seoTitle: "About us | POLARSIGHT",
        seoDescription: String(ap.mission.body).slice(0, 300),
      },
    },

    outcomes: {
      title: "Outcomes",
      doc: {
        hero: { kicker: op.kicker, title: op.title, body: op.body, visible: true, order: 0 },
        sections: (op.sections as any[]).map((sec) => ({
          id: sec.id,
          heading: sec.heading,
          body: sec.body ?? "",
          points: cards(sec.points ?? []),
          examples: sec.examples ?? [],
          visible: true,
        })),
        pathways: section("", op.pathways.heading, op.pathways.body, 1, {
          groups: (op.pathways.groups as any[]).map((g) => ({
            programme: g.programme,
            slug: g.slug,
            roles: g.roles,
          })),
          note: op.pathways.note,
        }),
      },
      seo: {
        seoTitle: "Outcomes | POLARSIGHT",
        seoDescription: String(op.body).slice(0, 300),
      },
    },

    programmes: {
      title: "Programmes",
      doc: {
        hero: {
          kicker: programmesIntro.kicker,
          title: programmesIntro.title,
          body: programmesIntro.body,
          visible: true,
          order: 0,
        },
      },
      seo: {
        seoTitle: "Programmes | POLARSIGHT",
        seoDescription: String(programmesIntro.body).slice(0, 300),
      },
    },

    careers: {
      title: "Careers",
      doc: {
        hero: {
          kicker: cp.hero.kicker,
          title: cp.hero.title,
          body: cp.hero.body,
          ctaLabel: cp.hero.cta.label,
          visible: true,
          order: 0,
        },
        why: section("", cp.why.heading, cp.why.body, 1, { items: cards(cp.why.items) }),
        positions: section("Open positions", cp.positions.heading, cp.positions.body, 2),
        employmentTypes: section(
          "",
          cp.employmentTypes.heading,
          cp.employmentTypes.body,
          3,
          { items: cp.employmentTypes.items }
        ),
        eligibility: section("", cp.eligibility.heading, cp.eligibility.body, 4, {
          items: cp.eligibility.items,
        }),
        process: section("", cp.process.heading, "", 5, { steps: cards(cp.process.steps) }),
        apply: section("Apply", cp.apply.heading, cp.apply.body, 6),
      },
      seo: {
        seoTitle: "Careers | POLARSIGHT",
        seoDescription: String(cp.hero.body).slice(0, 300),
      },
    },

    contact: {
      title: "Contact",
      doc: {
        hero: {
          kicker: "Contact us",
          title: "Let's Start a Conversation.",
          body:
            "Whether you're looking to bring industry-oriented cybersecurity training to your " +
            "institution, collaborate with PolarSight, or explore professional opportunities, " +
            "we'd love to hear from you.",
          visible: true,
          order: 0,
        },
        panel: {
          kicker: "Reach us",
          note:
            "Every message goes to the same queue and is read by a person. " +
            "We aim to reply within two working days.",
          visible: true,
          order: 1,
        },
      },
      seo: {
        seoTitle: "Contact us | POLARSIGHT",
        seoDescription:
          "Talk to PolarSight about bringing practical cybersecurity training to your institution, collaborating with us, or professional opportunities.",
      },
    },
  };

  const results: string[] = [];
  for (const [key, { title, doc, seo }] of Object.entries(documents)) {
    // Rewrite a page whose stored regions no longer match the ones the
    // site has; otherwise leave the administrator's copy alone.
    const stale = await pageNeedsRewrite(key, doc);
    results.push(await page(key, title, doc, seo, stale));
  }

  // Pages the site no longer has. Removed rather than left in the
  // portal as something an administrator could edit to no effect.
  const retiredPages = await prisma.sitePage.deleteMany({
    where: { key: { notIn: Object.keys(documents) } },
  });
  if (retiredPages.count) {
    console.log(`  removed ${retiredPages.count} page(s) the site no longer has`);
  }

  console.log(
    `  ${results.filter((r) => r === "created").length} created, ` +
      `${results.filter((r) => r === "rewritten").length} updated to match the site, ` +
      `${results.filter((r) => r === "kept").length} left as the administrator has them`
  );

  console.log("→ programmes and curriculum");
  for (const [i, p] of (programmeDetail as any[]).entries()) {
    const existing = await prisma.programme.findUnique({ where: { slug: p.slug } });

    const detail = {
      objectives: p.skills ?? [],
      targetAudience: p.audience ?? [],
      prerequisites: p.prerequisites ?? [],
      tools: p.tools ?? [],
      exercises: p.labs ?? [],
      projects: p.projects ?? [],
      learningOutcomes: p.outcomes ?? [],
      careerPathways: p.pathways ?? [],
      body: (p.overview ?? []).join("\n\n"),
      seoTitle: `${p.name} | POLARSIGHT`,
      seoDescription: String(p.summary).slice(0, 300),
    };

    const programme = existing
      ? await prisma.programme.update({
          where: { slug: p.slug },
          // Only fill fields that are still empty: anything an editor
          // has already written is theirs.
          data: {
            ...(existing.objectives.length === 0 ? { objectives: detail.objectives } : {}),
            ...(existing.targetAudience.length === 0 ? { targetAudience: detail.targetAudience } : {}),
            ...(existing.prerequisites.length === 0 ? { prerequisites: detail.prerequisites } : {}),
            ...(existing.tools.length === 0 ? { tools: detail.tools } : {}),
            ...(existing.exercises.length === 0 ? { exercises: detail.exercises } : {}),
            ...(existing.projects.length === 0 ? { projects: detail.projects } : {}),
            ...(existing.learningOutcomes.length === 0 ? { learningOutcomes: detail.learningOutcomes } : {}),
            ...(existing.careerPathways.length === 0 ? { careerPathways: detail.careerPathways } : {}),
            ...(existing.body ? {} : { body: detail.body }),
            ...(existing.seoTitle ? {} : { seoTitle: detail.seoTitle }),
            ...(existing.seoDescription ? {} : { seoDescription: detail.seoDescription }),
          },
        })
      : await prisma.programme.create({
          data: {
            slug: p.slug,
            code: p.code,
            name: p.name,
            tag: p.tag,
            summary: p.summary,
            points: (p.skills ?? []).slice(0, 5),
            sortOrder: i,
            status: PublishStatus.PUBLISHED,
            publishedAt: new Date(),
            ...detail,
          },
        });

    // Curriculum modules, created only when the programme has none.
    const moduleCount = await prisma.curriculumModule.count({
      where: { programmeId: programme.id },
    });
    if (moduleCount === 0) {
      for (const [m, mod] of ((p.curriculum ?? []) as any[]).entries()) {
        await prisma.curriculumModule.create({
          data: {
            programmeId: programme.id,
            title: mod.title,
            summary: mod.body,
            sortOrder: m,
            status: PublishStatus.PUBLISHED,
          },
        });
      }
      console.log(`  ${p.slug}: ${(p.curriculum ?? []).length} module(s)`);
    }
  }

  console.log("→ job openings");
  // Seeded PUBLISHED, because these five roles are already listed on
  // the public careers page today. Nothing here states a salary, a
  // start date or a headcount, none of which is established.
  const DEPARTMENTS: Record<string, string> = {
    "Security Operations": "Security Operations",
    "AI Security": "AI Security",
    "Cloud Security": "Cloud Security",
    Mentoring: "Training and Mentoring",
    Content: "Technical Content",
  };

  for (const [i, pos] of (pages.careersPage.positions.items as any[]).entries()) {
    const slug = slugify(pos.title);
    const exists = await prisma.jobOpening.findUnique({ where: { slug }, select: { id: true } });
    if (exists) continue;

    await prisma.jobOpening.create({
      data: {
        slug,
        title: pos.title,
        department: DEPARTMENTS[pos.area] ?? pos.area,
        // Several arrangements are open for every role; the specific
        // one is agreed during the process, so the opening records
        // the most general option rather than inventing a term.
        employmentType: "CONTRACT",
        location: "India",
        workMode: "HYBRID",
        description:
          `PolarSight is accepting applications for ${pos.title}. ` +
          `This role contributes to practical cybersecurity training in ${pos.area}: ` +
          `developing material, delivering sessions and mentoring participants. ` +
          `Arrangements — full-time, part-time, contract or guest — are discussed during the process.`,
        requiredSkills: pos.expertise ?? [],
        preferredQualifications: pages.careersPage.eligibility.items ?? [],
        responsibilities: [
          "Deliver training sessions, on campus or online",
          "Develop practical exercises and lab material",
          "Mentor participants through applied technical work",
          "Keep material current with industry practice",
        ],
        applicationInstructions:
          "Apply through the form on the careers page, including a resume and a short note on your practical experience.",
        sortOrder: i,
        status: PublishStatus.PUBLISHED,
        publishedAt: new Date(),
        seoTitle: `${pos.title} | Careers | POLARSIGHT`,
        seoDescription: `Apply to join PolarSight as a ${pos.title}.`,
      },
    });
  }

  const counts = {
    permissions: await prisma.permission.count(),
    roles: await prisma.role.count(),
    admins: await prisma.adminUser.count(),
    settings: await prisma.siteSetting.count(),
    pages: await prisma.sitePage.count(),
    contentBlocks: await prisma.websiteContent.count(),
    programmes: await prisma.programme.count(),
    curriculumModules: await prisma.curriculumModule.count(),
    jobOpenings: await prisma.jobOpening.count(),
    enquiries: await prisma.enquiry.count(),
    applications: await prisma.trainerApplication.count(),
  };

  console.log("\nSeed complete:", counts);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

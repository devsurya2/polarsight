/**
 * POLARSIGHT database seed.
 *
 * Idempotent: safe to run repeatedly. Everything upserts on a natural
 * key, so re-running will not duplicate rows or clobber edits made in
 * the admin portal beyond the fields it owns.
 *
 * The website copy is read from the live site's content module, so the
 * database starts out matching exactly what is on the page today.
 */

import { PrismaClient, PublishStatus, ContentType } from "@prisma/client";
import bcrypt from "bcryptjs";

// The existing site's copy. Importing it keeps one source of truth for
// the initial migration rather than retyping the text here.
// @ts-expect-error — plain JavaScript module from apps/web, no types
import * as site from "../../web/lib/content.js";

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

/* ── Permissions ──────────────────────────────────────────── */

const PERMISSIONS: Array<{ key: string; group: string; description: string }> = [
  { key: "admin:read", group: "Administrators", description: "View admin accounts" },
  { key: "admin:write", group: "Administrators", description: "Create and edit admin accounts" },
  { key: "admin:delete", group: "Administrators", description: "Disable or remove admin accounts" },
  { key: "role:read", group: "Administrators", description: "View roles and permissions" },
  { key: "role:write", group: "Administrators", description: "Change role permissions" },

  { key: "content:read", group: "Website content", description: "View website content" },
  { key: "content:write", group: "Website content", description: "Edit website content" },

  { key: "programme:read", group: "Programmes", description: "View programmes" },
  { key: "programme:write", group: "Programmes", description: "Create and edit programmes" },
  { key: "programme:delete", group: "Programmes", description: "Delete programmes" },
  { key: "programme:publish", group: "Programmes", description: "Publish and unpublish programmes" },

  { key: "statistic:read", group: "Statistics", description: "View statistics" },
  { key: "statistic:write", group: "Statistics", description: "Edit statistics" },

  { key: "audience:read", group: "Audiences", description: "View audience entries" },
  { key: "audience:write", group: "Audiences", description: "Edit audience entries" },

  { key: "career:read", group: "Careers", description: "View career content" },
  { key: "career:write", group: "Careers", description: "Edit career content" },

  { key: "faq:read", group: "FAQs", description: "View FAQs" },
  { key: "faq:write", group: "FAQs", description: "Edit FAQs" },

  { key: "enquiry:read", group: "Enquiries", description: "View enquiries" },
  { key: "enquiry:write", group: "Enquiries", description: "Update status and add notes" },
  { key: "enquiry:export", group: "Enquiries", description: "Export enquiries" },

  { key: "media:read", group: "Media", description: "View media library" },
  { key: "media:write", group: "Media", description: "Upload media" },
  { key: "media:delete", group: "Media", description: "Delete media" },

  { key: "audit:read", group: "Audit", description: "View the audit log" },
];

const CONTENT_KEYS = PERMISSIONS.map((p) => p.key).filter((k) =>
  /^(content|programme|statistic|audience|career|faq|media):/.test(k)
);

const ROLES: Array<{
  name: string;
  description: string;
  permissions: string[] | "ALL";
}> = [
  {
    name: "Super Admin",
    description: "Full access, including administrator and role management.",
    permissions: "ALL",
  },
  {
    name: "Content Manager",
    description: "Manages website content, programmes, FAQs and media.",
    permissions: [...CONTENT_KEYS, "enquiry:read"],
  },
  {
    name: "Enquiry Manager",
    description: "Handles contact enquiries. Read-only on website content.",
    permissions: ["enquiry:read", "enquiry:write", "enquiry:export", "content:read", "programme:read"],
  },
];

/* ── Helpers ──────────────────────────────────────────────── */

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function content(
  key: string,
  section: string,
  label: string,
  value: unknown,
  sortOrder = 0,
  type: ContentType = ContentType.TEXT
) {
  const serialised = typeof value === "string" ? value : JSON.stringify(value);
  const resolvedType = typeof value === "string" ? type : ContentType.JSON;
  await prisma.websiteContent.upsert({
    where: { key },
    update: { section, label, type: resolvedType, sortOrder },
    create: {
      key,
      section,
      label,
      type: resolvedType,
      value: serialised,
      sortOrder,
      status: PublishStatus.PUBLISHED,
    },
  });
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

  console.log("→ roles");
  const allPermissions = await prisma.permission.findMany();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
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
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.adminUser.upsert({
    where: { email },
    update: { roleId: superAdmin.id, isActive: true },
    create: { email, name: "Super Admin", passwordHash, roleId: superAdmin.id },
  });

  console.log("→ website content");
  const { hero, about, why, shift, coverage, cta, footer, brand, nav, marquee, outcomes } =
    site as any;

  await content("brand.name", "brand", "Company name", brand.name, 0);
  await content("brand.email", "brand", "Contact email", brand.email, 1);
  await content("brand.phone", "brand", "Contact phone", brand.phone, 2);
  await content("brand.city", "brand", "City", brand.city, 3);
  await content("brand.state", "brand", "State", brand.state, 4);

  await content("hero.kicker", "hero", "Eyebrow label", hero.kicker, 0);
  await content("hero.headline", "hero", "Headline lines", hero.lines, 1);
  await content("hero.accent", "hero", "Highlighted words", hero.accent, 2);
  await content("hero.body", "hero", "Supporting paragraph", hero.body, 3);
  await content("hero.primaryCta", "hero", "Primary button", hero.primary, 4);
  await content("hero.secondaryCta", "hero", "Secondary button", hero.secondary, 5);
  await content("hero.chips", "hero", "Supporting badges", hero.chips, 6);

  await content("nav.items", "navigation", "Navigation links", nav, 0);
  await content("marquee.items", "navigation", "Scrolling strip", marquee, 1);

  await content("about.kicker", "about", "Eyebrow label", about.kicker, 0);
  await content("about.lead", "about", "Lead statement", about.lead, 1);
  await content("about.cta", "about", "Link", about.cta, 2);

  await content("why.kicker", "why", "Eyebrow label", why.kicker, 0);
  await content("why.title", "why", "Heading", why.title, 1);
  await content("why.body", "why", "Intro", why.body, 2);
  await content("why.items", "why", "Reasons", why.items, 3);

  await content("shift.kicker", "shift", "Eyebrow label", shift.kicker, 0);
  await content("shift.title", "shift", "Heading", shift.title, 1);
  await content("shift.items", "shift", "Before and after pairs", shift.items, 2);

  await content("coverage.kicker", "coverage", "Eyebrow label", coverage.kicker, 0);
  await content("coverage.title", "coverage", "Heading", coverage.title, 1);
  await content("coverage.body", "coverage", "Intro", coverage.body, 2);
  await content("coverage.cities", "coverage", "Cities", coverage.cities, 3);

  await content("cta.kicker", "contact", "Eyebrow label", cta.kicker, 0);
  await content("cta.title", "contact", "Heading", cta.title, 1);
  await content("cta.body", "contact", "Intro", cta.body, 2);

  await content("footer.blurb", "footer", "Footer blurb", footer.blurb, 0);
  await content("footer.columns", "footer", "Footer link columns", footer.columns, 1);
  await content("outcomes.kicker", "outcomes", "Eyebrow label", outcomes.kicker, 0);
  await content("outcomes.title", "outcomes", "Heading", outcomes.title, 1);
  await content("outcomes.body", "outcomes", "Intro", outcomes.body, 2);

  console.log("→ programmes");
  for (const [i, p] of (site as any).programmes.items.entries()) {
    const slug = slugify(p.name);
    await prisma.programme.upsert({
      where: { slug },
      update: {
        code: p.code,
        name: p.name,
        tag: p.tag,
        summary: p.summary,
        points: p.points,
        durationWeeks: parseInt(String(p.duration), 10) || null,
        level: p.level,
        sortOrder: i,
      },
      create: {
        slug,
        code: p.code,
        name: p.name,
        tag: p.tag,
        summary: p.summary,
        points: p.points,
        durationWeeks: parseInt(String(p.duration), 10) || null,
        level: p.level,
        sortOrder: i,
        status: PublishStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  }

  console.log("→ audiences (draft: this section is not on the site today)");
  for (const [i, a] of ((site as any).serve?.tabs ?? []).entries()) {
    await prisma.audience.upsert({
      where: { slug: a.id },
      update: { name: a.name, heading: a.heading, blurb: a.blurb, outcome: a.outcome, sortOrder: i },
      create: {
        slug: a.id,
        name: a.name,
        heading: a.heading,
        blurb: a.blurb,
        outcome: a.outcome,
        bullets: a.flow ?? [],
        sortOrder: i,
        status: PublishStatus.DRAFT,
      },
    });
  }

  console.log("→ FAQs");
  const existingFaqs = await prisma.fAQ.count();
  if (existingFaqs === 0) {
    await prisma.fAQ.createMany({
      data: (site as any).faq.items.map((f: any, i: number) => ({
        question: f.q,
        answer: f.a,
        sortOrder: i,
        status: PublishStatus.PUBLISHED,
      })),
    });
  }

  console.log("→ career content");
  for (const [i, s] of (coverage.steps ?? []).entries()) {
    await prisma.careerContent.upsert({
      where: { key: `process.${i + 1}` },
      update: { title: s.title, body: s.body, sortOrder: i },
      create: {
        key: `process.${i + 1}`,
        title: s.title,
        body: s.body,
        sortOrder: i,
        status: PublishStatus.PUBLISHED,
      },
    });
  }

  // The reference figures in the site content are explicitly marked as
  // illustrative. They are seeded as DRAFT so they can never reach the
  // public site until someone replaces them with audited numbers.
  console.log("→ statistics (draft: placeholder figures, not published)");
  for (const [i, o] of ((site as any).outcomes?.items ?? []).entries()) {
    await prisma.statistic.upsert({
      where: { key: slugify(o.name) },
      update: { label: o.detail, value: o.metric, sortOrder: i },
      create: {
        key: slugify(o.name),
        label: o.detail,
        value: o.metric,
        sortOrder: i,
        status: PublishStatus.DRAFT,
      },
    });
  }

  const counts = {
    permissions: await prisma.permission.count(),
    roles: await prisma.role.count(),
    admins: await prisma.adminUser.count(),
    content: await prisma.websiteContent.count(),
    programmes: await prisma.programme.count(),
    audiences: await prisma.audience.count(),
    faqs: await prisma.fAQ.count(),
    career: await prisma.careerContent.count(),
    statistics: await prisma.statistic.count(),
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

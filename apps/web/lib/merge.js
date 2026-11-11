/**
 * Merges published CMS content over the copy built into the site.
 *
 * Two rules hold throughout:
 *
 *  1. The built-in copy is the floor. Anything the CMS does not supply
 *     falls back to it, key by key, so a partially filled database
 *     still renders a complete page and an API outage changes nothing.
 *  2. Nothing structural comes from the CMS. Routes, link targets,
 *     component choices and layout are decided in code; the CMS
 *     supplies words and images only. That is why an editor cannot
 *     break a page.
 *
 * Each `merge*` function below corresponds to one page schema in
 * apps/api/src/modules/pages/schema.ts, and produces exactly the shape
 * that page's components already expect. The three move together: when
 * a component gains or loses an editable field, change the schema, the
 * seed and the matching function here.
 */

/** Prefers a live value, but only when it is actually present. */
export const pick = (live, backup) =>
  live === undefined || live === null || live === "" ? backup : live;

/** Prefers a live array, but only when it has something in it. */
export const arr = (live, backup) =>
  Array.isArray(live) && live.length > 0 ? live : backup;

/** A region is rendered unless the CMS has explicitly hidden it. */
export const visible = (region) => !region || region.visible !== false;

/**
 * Merges a region's kicker, heading and body over a static section.
 *
 * `titleKey` exists because the site's own content modules are not
 * consistent: some sections call it `title`, others `heading`.
 */
function base(region, fallback, titleKey = "title") {
  if (!region) return { ...fallback, visible: true };
  return {
    ...fallback,
    kicker: pick(region.kicker, fallback.kicker),
    [titleKey]: pick(region.heading, fallback[titleKey]),
    body: pick(region.body, fallback.body),
    visible: visible(region),
  };
}

/**
 * Merges a list of { title, body } items, keeping any extra keys the
 * static item carries — the numbering on an ordered list, for
 * instance, which is presentation rather than content.
 */
function items(live, fallback = []) {
  if (!Array.isArray(live) || live.length === 0) return fallback;
  return live.map((item, i) => ({
    ...(fallback[i] ?? {}),
    // Numbering follows position, so reordering in the CMS does not
    // leave "03" above "01".
    ...(fallback[i]?.n !== undefined
      ? { n: String(i + 1).padStart(2, "0") }
      : {}),
    title: pick(item.title, fallback[i]?.title ?? ""),
    body: pick(item.body, fallback[i]?.body ?? ""),
  }));
}

/**
 * Resolves an image region.
 *
 * The site's illustrations are design assets, not content, so a region
 * with no `mediaId` keeps the built-in one. Picking a file in the
 * portal replaces it; the alt text is editable either way, because an
 * image published without one is an accessibility defect.
 */
function picture(region, fallback) {
  if (!region) return fallback;
  const alt = pick(region.alt, fallback?.alt ?? "");
  if (!region.mediaId || !region.url)
    return fallback ? { ...fallback, alt } : null;
  return {
    src: region.url,
    alt,
    width: region.width ?? fallback?.width ?? 1200,
    height: region.height ?? fallback?.height ?? 900,
  };
}

/** Keeps a CTA's destination from code and its words from the CMS. */
function cta(label, fallback) {
  if (!fallback) return fallback;
  return { ...fallback, label: pick(label, fallback.label) };
}

/* ── Homepage ─────────────────────────────────────────────────
 *
 * The hero, navigation and video are NOT represented here. They are
 * the site's first interface, they have no region in the CMS, and
 * nothing in this file can change them.
 */

export function mergeHome(cms, fallback) {
  const c = cms ?? {};

  return {
    intro: {
      ...base(c.intro, fallback.intro),
      support: pick(c.intro?.support, fallback.intro.support),
      cta: cta(c.intro?.ctaLabel, fallback.intro.cta),
      image: picture(c.intro?.image, fallback.intro.image),
    },

    programmes: base(c.programmes, fallback.programmes),

    approach: {
      ...base(c.approach, fallback.approach),
      items: items(c.approach?.items, fallback.approach.items),
      image: picture(c.approach?.image, fallback.approach.image),
    },

    outcomes: {
      ...base(c.outcomes, fallback.outcomes),
      cta: cta(c.outcomes?.ctaLabel, fallback.outcomes.cta),
      items: items(c.outcomes?.items, fallback.outcomes.items),
    },

    institutions: {
      ...base(c.institutions, fallback.institutions),
      points: arr(c.institutions?.points, fallback.institutions.points),
      cta: cta(c.institutions?.ctaLabel, fallback.institutions.cta),
      image: picture(c.institutions?.image, fallback.institutions.image),
    },

    team: {
      ...base(c.team, fallback.team),
      roles: arr(c.team?.roles, fallback.team.roles),
      cta: cta(c.team?.ctaLabel, fallback.team.cta),
      image: picture(c.team?.image, fallback.team.image),
    },

    closing: {
      ...base(c.closing, fallback.closing),
      primary: cta(c.closing?.primaryLabel, fallback.closing.primary),
      secondary: cta(c.closing?.secondaryLabel, fallback.closing.secondary),
    },
  };
}

/* ── About ────────────────────────────────────────────────── */

export function mergeAbout(cms, fallback) {
  const c = cms ?? {};

  return {
    ...fallback,
    kicker: pick(c.hero?.kicker, fallback.kicker),
    title: pick(c.hero?.title, fallback.title),

    whoWeAre: {
      heading: pick(c.whoWeAre?.heading, fallback.whoWeAre.heading),
      paragraphs: arr(c.whoWeAre?.paragraphs, fallback.whoWeAre.paragraphs),
      visible: visible(c.whoWeAre),
    },

    mission: base(c.mission, fallback.mission, "heading"),
    vision: base(c.vision, fallback.vision, "heading"),

    approach: {
      heading: pick(c.approach?.heading, fallback.approach.heading),
      items: items(c.approach?.items, fallback.approach.items),
      visible: visible(c.approach),
    },

    focus: {
      heading: pick(c.focus?.heading, fallback.focus.heading),
      items: items(c.focus?.items, fallback.focus.items),
      visible: visible(c.focus),
    },

    closing: {
      heading: pick(
        c.closing?.heading,
        "Want to talk to us about working together?",
      ),
      body: pick(
        c.closing?.body,
        "Colleges, employers and practitioners are all welcome to get in touch.",
      ),
      primaryLabel: pick(c.closing?.primaryLabel, "Contact us"),
      secondaryLabel: pick(c.closing?.secondaryLabel, "See open positions"),
      visible: visible(c.closing),
    },
  };
}

/* ── Outcomes ─────────────────────────────────────────────── */

export function mergeOutcomes(cms, fallback) {
  const c = cms ?? {};

  const sections =
    Array.isArray(c.sections) && c.sections.length > 0
      ? c.sections
          .filter((s) => s.visible !== false)
          .map((s, i) => {
            const prior = fallback.sections[i] ?? {};
            return {
              ...prior,
              id: pick(s.id, prior.id ?? `section-${i + 1}`),
              heading: pick(s.heading, prior.heading ?? ""),
              body: pick(s.body, prior.body ?? ""),
              // A section renders points or examples, never both, so
              // an empty list must stay empty rather than fall back.
              points:
                Array.isArray(s.points) && s.points.length > 0
                  ? items(s.points)
                  : undefined,
              examples:
                Array.isArray(s.examples) && s.examples.length > 0
                  ? s.examples
                  : undefined,
            };
          })
      : fallback.sections;

  return {
    ...fallback,
    kicker: pick(c.hero?.kicker, fallback.kicker),
    title: pick(c.hero?.title, fallback.title),
    body: pick(c.hero?.body, fallback.body),
    sections,
    pathways: {
      ...fallback.pathways,
      heading: pick(c.pathways?.heading, fallback.pathways.heading),
      body: pick(c.pathways?.body, fallback.pathways.body),
      note: pick(c.pathways?.note, fallback.pathways.note),
      groups:
        Array.isArray(c.pathways?.groups) && c.pathways.groups.length > 0
          ? c.pathways.groups.map((g, i) => ({
              ...(fallback.pathways.groups[i] ?? {}),
              programme: pick(
                g.programme,
                fallback.pathways.groups[i]?.programme ?? "",
              ),
              slug: pick(g.slug, fallback.pathways.groups[i]?.slug ?? ""),
              roles: arr(g.roles, fallback.pathways.groups[i]?.roles ?? []),
            }))
          : fallback.pathways.groups,
      visible: visible(c.pathways),
    },
  };
}

/* ── Programmes landing ───────────────────────────────────── */

export function mergeProgrammesIntro(cms, fallback) {
  const c = cms ?? {};
  return {
    ...fallback,
    kicker: pick(c.hero?.kicker, fallback.kicker),
    title: pick(c.hero?.title, fallback.title),
    body: pick(c.hero?.body, fallback.body),
  };
}

/* ── Careers ──────────────────────────────────────────────── */

const EMPLOYMENT_LABELS = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  GUEST_TRAINER: "Guest Trainer",
  INDUSTRY_EXPERT: "Industry Expert",
};

const WORK_MODE_LABELS = {
  ON_CAMPUS: "On-campus",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

const employmentLabel = (value) => EMPLOYMENT_LABELS[value] ?? value;
const workModeLabel = (value) => WORK_MODE_LABELS[value] ?? value;

/**
 * Merges the careers page.
 *
 * Open positions come from the database rather than the page document:
 * the CMS owns the surrounding copy, and the JobOpening records own
 * what is actually being recruited for. When no opening is published,
 * the page falls back to the built-in list so the section is never
 * empty — but those entries carry no `id`, so they cannot be applied
 * to and the form offers a free-text position instead.
 */
export function mergeCareers(cms, fallback, jobs) {
  const c = cms ?? {};

  const positions =
    Array.isArray(jobs) && jobs.length > 0
      ? jobs.map((j) => ({
          id: j.id,
          slug: j.slug,
          title: j.title,
          area: j.department,
          location: j.location,
          employmentType: employmentLabel(j.employmentType),
          workMode: workModeLabel(j.workMode),
          description: j.description,
          expertise: arr(j.requiredSkills, []),
          responsibilities: arr(j.responsibilities, []),
          preferred: arr(j.preferredQualifications, []),
          certifications: arr(j.certifications, []),
          experienceMinYears: j.experienceMinYears ?? null,
          experienceNote: j.experienceNote ?? null,
          applicationInstructions: j.applicationInstructions ?? null,
          applicationDeadline: j.applicationDeadline ?? null,
        }))
      : fallback.positions.items.map((p) => ({ ...p, id: null }));

  return {
    ...fallback,
    hero: {
      ...fallback.hero,
      kicker: pick(c.hero?.kicker, fallback.hero.kicker),
      title: pick(c.hero?.title, fallback.hero.title),
      body: pick(c.hero?.body, fallback.hero.body),
      cta: cta(c.hero?.ctaLabel, fallback.hero.cta),
    },

    why: {
      ...base(c.why, fallback.why, "heading"),
      items: items(c.why?.items, fallback.why.items),
    },

    positions: {
      ...base(c.positions, fallback.positions, "heading"),
      items: positions,
      // True when these came from the database and can be applied to.
      live: Array.isArray(jobs) && jobs.length > 0,
    },

    employmentTypes: {
      ...base(c.employmentTypes, fallback.employmentTypes, "heading"),
      items: arr(c.employmentTypes?.items, fallback.employmentTypes.items),
    },

    eligibility: {
      ...base(c.eligibility, fallback.eligibility, "heading"),
      items: arr(c.eligibility?.items, fallback.eligibility.items),
    },

    process: {
      ...base(c.process, fallback.process, "heading"),
      steps: items(c.process?.steps, fallback.process.steps),
    },

    apply: base(c.apply, fallback.apply, "heading"),
  };
}

/* ── Contact ──────────────────────────────────────────────── */

const CONTACT_FALLBACK = {
  kicker: "Contact us",
  title: "Let's Start a Conversation.",
  body:
    "Whether you're looking to bring industry-oriented cybersecurity training to your " +
    "institution, collaborate with PolarSight, or explore professional opportunities, " +
    "we'd love to hear from you.",
  panelKicker: "Reach us",
  panelNote:
    "Every message goes to the same queue and is read by a person. " +
    "We aim to reply within two working days.",
};

export function mergeContactPage(cms) {
  const c = cms ?? {};
  return {
    kicker: pick(c.hero?.kicker, CONTACT_FALLBACK.kicker),
    title: pick(c.hero?.title, CONTACT_FALLBACK.title),
    body: pick(c.hero?.body, CONTACT_FALLBACK.body),
    panel: {
      kicker: pick(c.panel?.kicker, CONTACT_FALLBACK.panelKicker),
      note: pick(c.panel?.note, CONTACT_FALLBACK.panelNote),
      visible: visible(c.panel),
    },
  };
}

/* ── Programme detail ─────────────────────────────────────── */

/**
 * Merges one published programme over the built-in detail.
 *
 * A programme published with none of its detail arrays filled in falls
 * back to the built-in content for those sections, so migrating a
 * programme into the CMS can be done field by field.
 */
export function mergeProgramme(live, fallback) {
  if (!live) return fallback;
  const prior = fallback ?? {};

  return {
    slug: live.slug,
    code: pick(live.code, prior.code),
    name: pick(live.name, prior.name),
    tag: pick(live.tag, prior.tag),
    summary: pick(live.summary, prior.summary),

    overview: live.body
      ? String(live.body)
          .split(/\n{2,}/)
          .map((s) => s.trim())
          .filter(Boolean)
      : (prior.overview ?? []),

    skills: arr(live.objectives, prior.skills ?? []),
    audience: arr(live.targetAudience, prior.audience ?? []),
    eligibility: arr(live.eligibility, []),
    prerequisites: arr(live.prerequisites, prior.prerequisites ?? []),
    tools: arr(live.tools, prior.tools ?? []),
    labs: arr(live.exercises, prior.labs ?? []),
    projects: arr(live.projects, prior.projects ?? []),
    outcomes: arr(live.learningOutcomes, prior.outcomes ?? []),
    pathways: arr(live.careerPathways, prior.pathways ?? []),

    // Only published modules reach the public API, so an unfinished
    // module is absent rather than shown as a gap.
    curriculum:
      Array.isArray(live.modules) && live.modules.length > 0
        ? live.modules.map((m) => ({
            title: m.title,
            body: m.summary ?? "",
            topics: Array.isArray(m.topics) ? m.topics : [],
          }))
        : (prior.curriculum ?? []),

    image: live.image ?? null,
    gallery: Array.isArray(live.gallery) ? live.gallery : [],
    seoTitle: live.seoTitle ?? null,
    seoDescription: live.seoDescription ?? null,
  };
}

/* ── Contact details and social links ─────────────────────── */

/**
 * Contact details, preferring the CMS settings and falling back to
 * build-time configuration.
 *
 * Neither source has a default: an address that is wrong is worse than
 * one that is missing, because it sends people somewhere we do not
 * control. Every consumer must treat null as "omit this entirely".
 */
export function mergeContact(settings, buildTime) {
  const s = settings ?? {};
  const clean = (v) => {
    const text = (v ?? "").trim();
    return text === "" ? null : text;
  };

  const email = clean(s["contact.email"]) ?? buildTime.email;
  const phone = clean(s["contact.phone"]) ?? buildTime.phone;

  return {
    email,
    phone,
    phoneHref: phone ? phone.replace(/[^\d+]/g, "") : null,
    institutionalEmail:
      clean(s["contact.institutionalEmail"]) ?? buildTime.institutionalEmail,
    businessEmail: buildTime.businessEmail,
    location: clean(s["contact.location"]),
    copyright: clean(s["footer.copyright"]),
  };
}

/** Social profiles, dropping any platform with no URL configured. */
export function mergeSocial(settings, buildTime) {
  const s = settings ?? {};
  const clean = (v) => {
    const text = (v ?? "").trim();
    return text === "" ? null : text;
  };

  const byIcon = Object.fromEntries(
    buildTime.map((entry) => [entry.icon, entry.href]),
  );

  return [
    {
      label: "LinkedIn",
      icon: "linkedin",
      href: clean(s["social.linkedin"]) ?? byIcon.linkedin ?? null,
    },
    {
      label: "Instagram",
      icon: "instagram",
      href: clean(s["social.instagram"]) ?? byIcon.instagram ?? null,
    },
    {
      label: "GitHub",
      icon: "github",
      href: clean(s["social.github"]) ?? byIcon.github ?? null,
    },
  ].filter((entry) => entry.href);
}

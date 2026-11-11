/**
 * Contact details and social profiles, read from configuration.
 *
 * Nothing here has a fallback value, deliberately. An address or a
 * phone number that is wrong is worse than one that is missing: it
 * sends people somewhere we do not control. Every consumer of this
 * module must therefore handle `null` by omitting the field rather
 * than rendering an empty link.
 *
 * Set these in the repository-root .env — see .env.example. They are
 * NEXT_PUBLIC_*, so they are inlined into the client bundle at build
 * time and are public by definition. Never put a secret here.
 *
 * Each value is read as a literal `process.env.NEXT_PUBLIC_…`
 * expression because that is what Next replaces at build time; a
 * dynamic lookup would come back undefined in the browser.
 */

const clean = (value) => {
  const s = (value ?? "").trim();
  return s === "" ? null : s;
};

const email = clean(process.env.NEXT_PUBLIC_CONTACT_EMAIL);
const phone = clean(process.env.NEXT_PUBLIC_CONTACT_PHONE);

export const contact = {
  email,
  phone,
  // tel: needs the number without spaces or punctuation.
  phoneHref: phone ? phone.replace(/[^\d+]/g, "") : null,
  institutionalEmail: clean(process.env.NEXT_PUBLIC_INSTITUTIONAL_EMAIL),
  businessEmail: clean(process.env.NEXT_PUBLIC_BUSINESS_EMAIL),
};

/** True when there is at least one way to reach us besides the form. */
export const hasDirectContact = Boolean(
  contact.email || contact.phone || contact.institutionalEmail || contact.businessEmail
);

/* Social profiles. An entry with no URL is dropped, so an
   unconfigured platform shows nothing at all rather than a dead
   link to an account that may belong to somebody else. */
export const social = [
  {
    label: "LinkedIn",
    icon: "linkedin",
    href: clean(process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN),
  },
  {
    label: "Instagram",
    icon: "instagram",
    href: clean(process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM),
  },
  {
    label: "GitHub",
    icon: "github",
    href: clean(process.env.NEXT_PUBLIC_SOCIAL_GITHUB),
  },
].filter((s) => s.href);

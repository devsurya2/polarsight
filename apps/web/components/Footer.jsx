import { Globe } from "lucide-react";
import { Logo } from "./Logo";
import {
  LinkedinIcon,
  InstagramIcon,
  XIcon,
  YoutubeIcon,
  GithubIcon,
} from "./SocialIcons";
import { footer as staticFooter, brand as staticBrand } from "@/lib/content";
import {
  contact as buildTimeContact,
  social as buildTimeSocial,
} from "@/lib/siteConfig";

/* Icons available to a social entry. An unrecognised `icon` falls
   back to a generic globe rather than rendering nothing, so adding a
   platform in content.js never produces an empty link. */
const SOCIAL_ICONS = {
  linkedin: LinkedinIcon,
  instagram: InstagramIcon,
  x: XIcon,
  twitter: XIcon,
  youtube: YoutubeIcon,
  github: GithubIcon,
};

export function Footer({
  footer = staticFooter,
  brand = staticBrand,
  contact: liveContact,
  social: liveSocial,
}) {
  // Settings from the admin portal when they are set, build-time
  // configuration otherwise. Neither carries a made-up default: a
  // blank value means the field is omitted entirely, because an
  // address that is wrong is worse than one that is missing.
  const contact = liveContact ?? buildTimeContact;
  const social = liveSocial ?? buildTimeSocial;

  return (
    <footer className="border-t border-line py-14">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="t-body mt-5 max-w-sm text-pretty text-body">
              {footer.blurb}
            </p>
            <p className="mt-5 font-mono text-xs text-faint">
              {brand.city}, {brand.state}
            </p>

            {social.length > 0 && (
              <ul className="mt-6 flex flex-wrap items-center gap-2.5">
                {social.map((s) => {
                  const Icon = SOCIAL_ICONS[s.icon] ?? Globe;
                  return (
                    <li key={s.label}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer me"
                        aria-label={`Polarsight on ${s.label}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-body shadow-card transition-all duration-200 hover:border-accent hover:text-accent-ice hover:shadow-lift"
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {footer.columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="t-label text-faint">{col.title}</h2>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(l.newTab
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="text-sm text-body transition-colors hover:text-accent-ice"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-faint">
            © 2026 {brand.name}. All rights reserved.
          </p>
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="font-mono text-xs text-faint transition-colors hover:text-accent-ice"
            >
              {contact.email}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

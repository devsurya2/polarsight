import { Logo } from "./Logo";
import { footer as staticFooter, brand as staticBrand } from "@/lib/content";

export function Footer({ footer = staticFooter, brand = staticBrand }) {
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
          </div>

          {footer.columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="t-label text-faint">
                {col.title}
              </h2>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
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
          <a
            href={`mailto:${brand.email}`}
            className="font-mono text-xs text-faint transition-colors hover:text-accent-ice"
          >
            {brand.email}
          </a>
        </div>
      </div>
    </footer>
  );
}

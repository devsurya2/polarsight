import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { BackToTop } from "./BackToTop";
import { CursorGlow } from "./CursorGlow";
import { Kicker } from "./ui";

/* Chrome shared by every page other than the homepage, which has its
   own full-screen hero. */
export function PageShell({ children, content }) {
  return (
    <>
      <Nav nav={content?.nav} />
      <main id="main">{children}</main>
      <Footer
        footer={content?.footer}
        brand={content?.brand}
        contact={content?.contact}
        social={content?.social}
      />
      <BackToTop />
      <CursorGlow />
    </>
  );
}

/* Opening block for an inner page. Deliberately not the homepage
   hero: that one owns the first screen and is left untouched. */
export function PageHero({ kicker, title, body, children }) {
  return (
    <section className="dotfield relative overflow-hidden border-b border-line">
      <div className="container-page page-hero-pad">
        <div className="max-w-3xl">
          {kicker && <Kicker>{kicker}</Kicker>}
          <h1 className="t-display mt-6 text-balance">{title}</h1>
          {body && (
            <p className="t-lead mt-6 max-w-2xl text-pretty text-body">
              {body}
            </p>
          )}
          {children && <div className="mt-8">{children}</div>}
        </div>
      </div>
    </section>
  );
}

/* Short, factual qualifier used where a claim could otherwise be
   read as a guarantee. */
export function Disclaimer({ children }) {
  return (
    <p className="t-body mt-6 max-w-3xl rounded-card border border-line bg-paper/40 px-4 py-3 text-faint">
      {children}
    </p>
  );
}

/* Shown when an editor is viewing unpublished work through a preview
   link. Deliberately loud and fixed to the viewport: a preview that
   looks like the live site is worse than no preview at all. */
export function PreviewBanner() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] bg-accent px-4 py-2 text-center text-sm font-medium text-white"
    >
      Previewing unpublished content. Visitors still see the published page.
    </div>
  );
}

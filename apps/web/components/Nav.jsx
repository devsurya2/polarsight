"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui";
import { nav as staticNav } from "@/lib/content";

/* Attributes for an entry that opens in its own tab. noopener and
   noreferrer are required: without them the opened page can reach
   back through window.opener. */
const tabProps = (item) =>
  item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

export function Nav({ nav = staticNav }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /* Active state follows the route. Entries that are only an anchor
     never claim it, so "Contact us" does not fight "Home". */
  const isActive = (item) => {
    if (item.href.includes("#")) return false;
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the sheet when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 pt-4">
      <div className="container-page">
        <div
          className={`flex items-center justify-between rounded-panel border px-4 py-2.5 transition-all duration-500 sm:px-5 xl:grid xl:grid-cols-[1fr_auto_1fr] ${
            scrolled
              ? "border-glass-line bg-glass shadow-nav backdrop-blur-xl"
              : "border-glass-line bg-glass-soft shadow-card backdrop-blur-md"
          }`}
        >
          <a href="/" aria-label="Polarsight home" className="justify-self-start rounded-pill">
            <Logo />
          </a>

          <nav aria-label="Primary" className="hidden justify-self-center xl:block">
            <ul className="flex items-center gap-8">
              {nav.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      {...tabProps(item)}
                      aria-current={active ? "page" : undefined}
                      className={`relative block py-2 text-sm transition-colors duration-200 ${
                        active ? "text-ink" : "text-body hover:text-ink"
                      }`}
                    >
                      {item.label}
                      <span
                        aria-hidden
                        className={`absolute left-1/2 top-[calc(100%-2px)] h-1 w-1 -translate-x-1/2 rounded-full bg-accent transition-all duration-300 ${
                          active ? "scale-100 opacity-100" : "scale-0 opacity-0"
                        }`}
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center justify-self-end gap-2">
            <span className="hidden sm:block">
              <Button href="/contact">Contact us</Button>
            </span>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper text-ink shadow-card transition-all duration-200 hover:shadow-lift xl:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="container-page">
          <div
            id="mobile-menu"
            className="mt-2 rounded-panel border border-glass-line bg-glass p-4 shadow-lift backdrop-blur-xl xl:hidden"
          >
            <nav aria-label="Mobile">
              <ul className="flex flex-col gap-1">
                {nav.map((item) => {
                  const active = isActive(item);
                  return (
                    <li key={item.label}>
                      <a
                        href={item.href}
                        {...tabProps(item)}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={`flex items-center justify-between rounded-inner px-4 py-3 text-base transition-colors hover:bg-canvas hover:text-ink ${
                          active ? "bg-canvas text-ink" : "text-body"
                        }`}
                      >
                        {item.label}
                        {item.newTab && (
                          <span aria-hidden className="text-xs text-faint">
                            ↗
                          </span>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-3 border-t border-line pt-3">
              <Button href="/contact" className="w-full justify-between" onClick={() => setOpen(false)}>
                Contact us
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

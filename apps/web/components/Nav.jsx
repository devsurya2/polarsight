"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui";
import { nav as staticNav } from "@/lib/content";

export function Nav({ nav = staticNav }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("main");

  /* Sections the nav tracks, in document order */
  const watched = useMemo(
    () =>
      nav
        .map((n) => n.href)
        .filter((h) => h.startsWith("#"))
        .map((h) => h.slice(1)),
    [nav]
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Scroll spy. Tracks which section is in the upper third.

     Two things this has to get right:
     - "main" wraps the whole page, so it is the fallback when no real
       section is in view, never something to observe.
     - The observer only reports sections whose state just changed, so
       the full picture is kept in `onScreen`. Reading `entries` alone
       lets one late callback win while an earlier section is still
       on screen, which left Programmes lit at the top of the page. */
  useEffect(() => {
    const ids = watched.filter((id) => id !== "main");
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return;

    const onScreen = new Set();

    const resolve = () => {
      // Near the top the hero owns the screen, so Home is correct.
      if (window.scrollY < 40) {
        setActive("main");
        return;
      }
      const topmost = els
        .filter((el) => onScreen.has(el.id))
        .sort(
          (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
        )[0];
      setActive(topmost ? topmost.id : "main");
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onScreen.add(e.target.id);
          else onScreen.delete(e.target.id);
        }
        resolve();
      },
      { rootMargin: "-18% 0px -72% 0px", threshold: 0 }
    );

    els.forEach((el) => io.observe(el));
    window.addEventListener("scroll", resolve, { passive: true });
    resolve();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", resolve);
    };
  }, [watched]);

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
        <a href="#main" aria-label="Polarsight home" className="justify-self-start rounded-pill">
          <Logo />
        </a>

        <nav aria-label="Primary" className="hidden justify-self-center xl:block">
          <ul className="flex items-center gap-8">
            {nav.map((item) => {
              const id = item.href.slice(1);
              const isActive = active === id;
              return (
                <li key={item.label}>
                  <a
                    href={item.href}
                    aria-current={isActive ? "true" : undefined}
                    className={`relative block py-2 text-sm transition-colors duration-200 ${
                      isActive ? "text-ink" : "text-body hover:text-ink"
                    }`}
                  >
                    {item.label}
                    <span
                      aria-hidden
                      className={`absolute left-1/2 top-[calc(100%-2px)] h-1 w-1 -translate-x-1/2 rounded-full bg-accent transition-all duration-300 ${
                        isActive ? "scale-100 opacity-100" : "scale-0 opacity-0"
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
            <Button href="#contact">Contact us</Button>
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
              {nav.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-inner px-4 py-3 text-base text-body transition-colors hover:bg-canvas hover:text-ink"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <Button href="#contact" className="w-full justify-between" onClick={() => setOpen(false)}>
              Contact us
            </Button>
          </div>
        </div>
        </div>
      )}
    </header>
  );
}

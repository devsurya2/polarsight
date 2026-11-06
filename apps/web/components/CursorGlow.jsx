"use client";

import { useEffect, useRef } from "react";

/* ───────────────────────────────────────────────────────────
   A soft glow that trails the pointer, sitting under the star
   cursor itself. It eases rather than tracking exactly, which
   is what gives it weight, and it widens over anything
   clickable. Purely decorative, so it never takes pointer
   events and is hidden on touch and under reduced motion.
   ─────────────────────────────────────────────────────────── */

const HOT = 'a, button, [role="tab"], summary, label, .lift';

export function CursorGlow() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let x = tx;
    let y = ty;
    let raf = 0;
    let alive = true;

    const onMove = (e) => {
      tx = e.clientX;
      ty = e.clientY;
      el.dataset.active = "true";
      el.dataset.hot = e.target?.closest?.(HOT) ? "true" : "false";
    };

    const onLeave = () => {
      el.dataset.active = "false";
    };

    const frame = () => {
      if (!alive) return;
      // Trail behind the real cursor by easing toward it
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(frame);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frame();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <div ref={ref} className="cursor-glow" aria-hidden="true" />;
}

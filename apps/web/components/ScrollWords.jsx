"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

/* ───────────────────────────────────────────────────────────
   Progressive word reveal. Words warm from grey to ink as the
   block travels up the viewport.

   The unrevealed grey clears 3:1 against the
   canvas, so the sentence stays readable at every point in the
   animation rather than relying on the reveal to become legible.
   ─────────────────────────────────────────────────────────── */

/* The unrevealed grey clears 3:1 against the canvas, so the sentence
   reads at every point of the animation rather than relying on the
   reveal to become legible. The accent is the text-safe ice blue,
   not the electric blue, which falls below 4.5:1 here. */
const DIM = "#5E6878";
const LIT = "#F3F5F8";
const ACCENT = "#8CCFFF";

export function ScrollWords({ text, className = "", accent = [] }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "start 0.35"],
  });

  const words = text.split(" ");

  if (reduce) {
    return (
      <p className={className} style={{ color: LIT }}>
        {text}
      </p>
    );
  }

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => {
        const start = i / words.length;
        const end = start + 1 / words.length;
        const isAccent = accent.some((a) =>
          word.toLowerCase().replace(/[^a-z]/g, "").includes(a)
        );
        return (
          <Word key={i} progress={scrollYProgress} range={[start, end]} accent={isAccent}>
            {word}
          </Word>
        );
      })}
    </p>
  );
}

function Word({ children, progress, range, accent }) {
  const color = useTransform(
    progress,
    range,
    accent ? [DIM, ACCENT] : [DIM, LIT]
  );

  return (
    <>
      <motion.span style={{ color }}>{children}</motion.span>{" "}
    </>
  );
}

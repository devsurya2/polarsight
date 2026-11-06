"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Button, Chip, Kicker } from "./ui";
import { HeroMark } from "./HeroMark";
import { hero as staticHero } from "@/lib/content";

export function Hero({ hero = staticHero }) {
  const reduce = useReducedMotion();

  const rise = (delay) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
        };

  return (
    <section className="hero-section">
      {/* Background layer, behind everything in the hero. Absolute
          with inset 0 so it covers the section edge to edge whatever
          the content height turns out to be. */}
      <div aria-hidden className="hero-dots" />

      <div className="container-page hero-grid relative z-10">
        <div className="w-full max-w-[540px]">
          <motion.div {...rise(0)}>
            <Kicker>{hero.kicker}</Kicker>
          </motion.div>

          <motion.h1
            {...rise(0.07)}
            className="t-display mt-6 text-balance"
          >
            {hero.lines.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
            <span className="block text-accent-ice">{hero.accent}</span>
          </motion.h1>

          <motion.p
            {...rise(0.14)}
            className="t-lead mt-6 text-pretty text-body"
          >
            {hero.body}
          </motion.p>

          <motion.div {...rise(0.21)} className="mt-8 flex flex-wrap items-center gap-3">
            <Button href={hero.primary.href}>{hero.primary.label}</Button>
            <Button href={hero.secondary.href} variant="paper">
              {hero.secondary.label}
            </Button>
          </motion.div>

          <motion.div {...rise(0.28)} className="mt-7 flex flex-wrap gap-2.5">
            {hero.chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </motion.div>
        </div>

        {/* Brand mark */}
        <motion.div
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, scale: 0.92 },
                animate: { opacity: 1, scale: 1 },
                transition: { duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] },
              })}
          className="relative mx-auto aspect-square w-full max-w-[15.5rem] sm:max-w-[22rem] lg:max-w-[33rem] xl:max-w-[37rem]"
        >
          <HeroMark className="h-full w-full" />
        </motion.div>
      </div>
    </section>
  );
}

import { marquee as staticMarquee } from "@/lib/content";

export function MarqueeStrip({ marquee = staticMarquee }) {
  const row = [...marquee, ...marquee, ...marquee];

  return (
    <section aria-label="What the programme stands for" className="border-y border-line py-6">
      <div
        className="overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      >
        <ul
          aria-hidden="true"
          className="flex w-max items-center gap-10 pr-10 motion-safe:[animation:ps-marquee_28s_linear_infinite]"
        >
          {row.map((item, i) => (
            <li key={i} className="flex shrink-0 items-center gap-10">
              <span className="text-lg font-medium tracking-tight text-ink sm:text-xl">
                {item}
              </span>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">{marquee.join(". ")}.</p>
    </section>
  );
}

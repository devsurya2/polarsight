import { MapPin, Video, Cloud, GraduationCap } from "lucide-react";
import { Section, Heading, Reveal } from "./ui";
import { coverage as staticCoverage } from "@/lib/content";

/* Abstract dot-field with campus markers. Positions are a layout
   composition, not a cartographic map. */
const MARKERS = [
  { x: 46, y: 18, label: "Pune" },
  { x: 62, y: 24, label: "Hyderabad" },
  { x: 72, y: 36, label: "Vijayawada" },
  { x: 50, y: 48, label: "Bengaluru" },
  { x: 38, y: 58, label: "Kochi" },
  { x: 64, y: 54, label: "Vellore" },
  { x: 54, y: 66, label: "Coimbatore" },
  { x: 48, y: 78, label: "Madurai" },
  { x: 74, y: 68, label: "Chennai", hq: true },
  { x: 60, y: 86, label: "Trichy" },
];

const STEP_ICONS = [Video, Cloud, GraduationCap, MapPin];

export function Coverage({ coverage = staticCoverage }) {
  return (
    <Section>
      <div className="surface-panel overflow-hidden">
        <div className="grid gap-12 p-7 sm:p-10 lg:grid-cols-[1fr_0.85fr] lg:gap-16 lg:p-12">
          <div>
            <Reveal>
              <Heading
                kicker={coverage.kicker}
                title={coverage.title}
                body={coverage.body}
              />
            </Reveal>

            <Reveal delay={0.06}>
              <ul className="mt-9 flex flex-wrap gap-2">
                {coverage.cities.map((c) => (
                  <li
                    key={c}
                    className="rounded-pill border border-line bg-canvas px-3.5 py-1.5 text-xs text-body"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.1}>
              <dl className="mt-10 grid gap-6 sm:grid-cols-2">
                {coverage.steps.map((s, i) => {
                  const Icon = STEP_ICONS[i];
                  return (
                    <div key={s.title}>
                      <dt className="flex items-center gap-2.5 text-sm font-medium">
                        <Icon className="h-4 w-4 shrink-0 text-accent-ice" aria-hidden />
                        {s.title}
                      </dt>
                      <dd className="t-body mt-2 text-pretty text-body">
                        {s.body}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Reveal>
          </div>

          {/* Marker field */}
          <Reveal delay={0.12}>
            <div className="dotfield relative aspect-[4/5] w-full rounded-card border border-line bg-canvas/50">
              {MARKERS.map((m) => (
                <div
                  key={m.label}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                >
                  {m.hq ? (
                    <span className="flex items-center gap-2 whitespace-nowrap rounded-pill bg-invert px-3 py-1.5 text-[0.6875rem] font-medium text-on-invert shadow-card">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      {m.label}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-paper px-2.5 py-1 text-[0.625rem] text-body">
                      <span className="h-1 w-1 rounded-full bg-accent-ice" />
                      {m.label}
                    </span>
                  )}
                </div>
              ))}

              <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-x-4 gap-y-1.5 rounded-inner border border-line bg-paper/90 px-3 py-2.5 backdrop-blur">
                {coverage.legend.map((l, i) => (
                  <span
                    key={l}
                    className="flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-faint"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        i === 0 ? "bg-accent-ice" : i === 1 ? "bg-invert" : "bg-line"
                      }`}
                    />
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

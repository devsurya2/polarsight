import { Kicker, ArrowLink, Reveal } from "./ui";
import { ScrollWords } from "./ScrollWords";
import { about as staticAbout } from "@/lib/content";

export function About({ about = staticAbout }) {
  return (
    <section
      id="about"
      className="relative py-20 md:py-28"
    >
      <div className="container-page relative">
        <Reveal>
          <Kicker>{about.kicker}</Kicker>
        </Reveal>

        <div className="mt-8 lg:pl-[14%]">
          <ScrollWords
            text={about.lead}
            accent={["labs", "mentoring", "placement"]}
            className="t-h2 max-w-4xl text-balance"
          />

          <Reveal delay={0.1}>
            <div className="mt-10">
              <ArrowLink href={about.cta.href}>{about.cta.label}</ArrowLink>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

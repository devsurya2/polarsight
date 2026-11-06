import { Mail, Phone } from "lucide-react";
import { Section, Reveal, Kicker } from "./ui";
import { ContactForm } from "./ContactForm";
import { cta as staticCta, brand as staticBrand } from "@/lib/content";

export function Cta({ cta = staticCta, brand = staticBrand }) {
  return (
    <Section id="contact">
      <Reveal>
        <div className="surface-panel dotfield overflow-hidden px-7 py-16 text-center shadow-lift sm:px-12 md:py-20">
          <div className="flex justify-center">
            <Kicker>{cta.kicker}</Kicker>
          </div>

          <h2 className="t-h2 mx-auto mt-6 max-w-2xl text-balance">
            {cta.title}
          </h2>

          <p className="t-lead mx-auto mt-5 max-w-xl text-pretty text-body">
            {cta.body}
          </p>

          <div className="mx-auto mt-10 max-w-2xl">
            <ContactForm email={brand.email} />
          </div>

          <div className="mt-12 flex flex-col items-center justify-center gap-4 border-t border-line pt-8 sm:flex-row sm:gap-10">
            <a
              href={`mailto:${brand.email}`}
              className="flex items-center gap-2.5 text-sm transition-colors hover:text-accent-ice"
            >
              <Mail className="h-4 w-4 shrink-0 text-accent-ice" aria-hidden />
              <span className="font-mono">{brand.email}</span>
            </a>
            <a
              href={`tel:${brand.phoneHref}`}
              className="flex items-center gap-2.5 text-sm transition-colors hover:text-accent-ice"
            >
              <Phone className="h-4 w-4 shrink-0 text-accent-ice" aria-hidden />
              <span className="font-mono">{brand.phone}</span>
            </a>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

import { Section, Reveal, Button } from "../ui";
import { closing as builtIn } from "@/lib/home";

/* Carries id="contact" so the hero's "Talk to us" button, which is
   part of the untouched first interface, still has somewhere to land. */
export function Closing({ content }) {
  // Published content when the CMS has it, the built-in
  // copy otherwise. The markup below is identical either way.
  const closing = content ?? builtIn;

  return (
    <Section id="contact" className="border-t border-line">
      <Reveal>
        <div className="surface-panel dotfield overflow-hidden px-6 py-20 text-center shadow-lift sm:px-12 md:py-28">
          <h2 className="t-display mx-auto max-w-3xl text-balance">
            {closing.title}
          </h2>
          <p className="t-lead mx-auto mt-7 max-w-xl text-pretty text-body">
            {closing.body}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button href={closing.primary.href}>{closing.primary.label}</Button>
            <Button href={closing.secondary.href} variant="paper">
              {closing.secondary.label}
            </Button>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

import Image from "next/image";
import mark from "@/public/polarsight-mark.png";

export function Logo({ className = "", showWordmark = true }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src={mark}
        alt=""
        priority
        className="h-9 w-auto shrink-0 object-contain"
        sizes="36px"
      />
      {showWordmark && (
        <span className="font-display text-[0.95rem] tracking-[-0.01em] text-ink">
          POLARSIGHT
        </span>
      )}
    </span>
  );
}

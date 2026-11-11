/**
 * Image frame for the homepage sections.
 *
 * A plain <img> rather than next/image: every asset here is an SVG
 * drawn for this site, and Next's image optimiser refuses SVG without
 * `dangerouslyAllowSVG`. There is nothing to optimise in a vector file
 * anyway. Width and height are always passed so the browser reserves
 * the right box before the file arrives and the layout does not shift.
 *
 * Below the fold by definition — the hero owns the first screen — so
 * everything is lazily loaded and asynchronously decoded.
 */
export function Figure({
  image,
  className = "",
  ratio = "4/3",
  priority = false,
}) {
  return (
    <figure
      className={`relative overflow-hidden rounded-panel border border-line bg-paper ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <img
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-cover"
      />
      {/* Hairline inset: keeps the artwork from meeting the frame edge
          flatly, matching the surface treatment used site-wide. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-panel ring-1 ring-inset ring-white/[0.04]"
      />
    </figure>
  );
}

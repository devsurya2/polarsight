/**
 * Content safety for editable copy.
 *
 * Website copy is stored and served as plain text, and the public site
 * renders it as text — React escapes it, and nothing in the frontend
 * calls dangerouslySetInnerHTML on database content. That is the real
 * defence against stored XSS.
 *
 * These helpers are the second line: they stop markup and scripting
 * constructs from being *stored* in the first place, so a future
 * template that does render HTML cannot be exploited retroactively,
 * and so an editor cannot quietly break a page's structure by pasting
 * a stray tag into a heading.
 */

import { BadRequestError } from "./errors.js";
import { z } from "zod";

/** Patterns that have no business in marketing copy. */
const DANGEROUS = [
  { re: /<\s*script/i, what: "a <script> tag" },
  { re: /<\s*\/?\s*(iframe|object|embed|form|input|style|link|meta|base|svg|math)\b/i, what: "an unsafe HTML tag" },
  { re: /javascript\s*:/i, what: "a javascript: URL" },
  { re: /data\s*:\s*text\/html/i, what: "a data: HTML URL" },
  { re: /\son[a-z]+\s*=/i, what: "an inline event handler" },
  // Template-injection style constructs, which some renderers evaluate.
  { re: /\{\{.*?\}\}/s, what: "a template expression" },
];

/**
 * Rejects copy containing script or structural markup. Returns the
 * value unchanged when it is safe, so it reads naturally in a parse
 * chain.
 */
export function assertSafeText(value: string, field = "value"): string {
  for (const { re, what } of DANGEROUS) {
    if (re.test(value)) {
      throw new BadRequestError(
        `${field} contains ${what}, which is not allowed in website content. Use plain text.`
      );
    }
  }
  return value;
}


/**
 * A Zod string that trims, enforces a length, and refuses script or
 * markup. This is the type every editable copy field should use.
 */
export const safeText = (max: number, field = "value") =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => assertSafeText(v, field));

/**
 * A name or title: one line, no control characters. Names reach email
 * subjects and headers, where a line break is a header injection.
 */
export const singleLineText = (max: number, field = "value") =>
  z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(max)
    .refine((v) => !/[\r\n\t\0\x0b\x0c]/.test(v), `${field} must be a single line`)
    .transform((v) => assertSafeText(v, field));

/** Same, but also requires a non-empty value. */
export const requiredSafeText = (max: number, field = "value") =>
  z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(max)
    .transform((v) => assertSafeText(v, field));

/** A list of safe one-line strings, e.g. bullet points. */
export const safeTextList = (maxItems: number, maxLength = 300, field = "item") =>
  z.array(requiredSafeText(maxLength, field)).max(maxItems);

/**
 * An external URL an editor may publish.
 *
 * Only http(s) is accepted, which rules out javascript:, data: and
 * file: — the schemes that turn a link into an attack.
 */
export const externalUrl = z
  .string()
  .trim()
  .url("Enter a full URL including https://")
  .max(500)
  .refine(
    (v) => /^https?:\/\//i.test(v),
    "Only http:// and https:// addresses are allowed"
  );

/**
 * Recursively checks a JSON content document. Page bodies are stored
 * as JSON, so every string inside one has to be screened, not just the
 * top level.
 */
export function assertSafeJson(value: unknown, path = "content"): void {
  if (typeof value === "string") {
    assertSafeText(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertSafeJson(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      assertSafeJson(v, `${path}.${k}`);
    }
  }
}

/** Depth and size guard, so a page document cannot be used to exhaust memory. */
export function assertReasonableDocument(value: unknown, maxBytes = 256 * 1024): void {
  const serialised = JSON.stringify(value ?? null);
  if (serialised.length > maxBytes) {
    throw new BadRequestError(
      `That content is too large (${Math.round(serialised.length / 1024)} KB; limit ${Math.round(maxBytes / 1024)} KB)`
    );
  }

  const depth = (v: unknown, d = 0): number => {
    if (d > 20) throw new BadRequestError("That content is nested too deeply");
    if (Array.isArray(v)) return Math.max(d, ...v.map((x) => depth(x, d + 1)));
    if (v && typeof v === "object") {
      return Math.max(d, ...Object.values(v).map((x) => depth(x, d + 1)));
    }
    return d;
  };
  depth(value);
}

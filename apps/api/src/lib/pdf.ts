/**
 * Structural and content policy for uploaded PDFs.
 *
 * A PDF viewer is a large attack surface, and a resume has no business
 * carrying scripts, launch actions, embedded files, forms or
 * encryption. This module refuses any of those before the file is
 * stored, independent of the malware scanner, so a sample the scanner
 * has no signature for is still turned away on structure alone.
 *
 * It is a policy check, not a full parser. It:
 *
 *  - requires the header, an end-of-file marker, objects and a
 *    cross-reference section or stream;
 *  - decompresses FlateDecode streams (bounded, so a decompression
 *    bomb cannot exhaust memory) and inspects their contents too,
 *    because object streams are the usual place to hide an action;
 *  - normalises PDF name escapes before matching, so a name written
 *    with hex escapes is seen for what it is.
 *
 * Anything it cannot decide is a rejection. The cost of refusing an
 * unusual but harmless resume is one email asking for a re-export; the
 * cost of accepting an unusual harmful one is a reviewer's workstation.
 */

import zlib from "node:zlib";

export type PdfVerdict = { ok: true } | { ok: false; reason: string };

/** Dictionary keys and action types that have no place in a document upload. */
const FORBIDDEN_NAMES = [
  "JavaScript",
  "JS",
  "Launch",
  "EmbeddedFile",
  "EmbeddedFiles",
  "RichMedia",
  "XFA",
  "AcroForm",
  "SubmitForm",
  "ImportData",
  "GoToR",
  "GoToE",
  "Movie",
  "Sound",
  "Encrypt",
  "AA",
] as const;

const MAX_INFLATED_TOTAL = 64 * 1024 * 1024; // across the whole file
const MAX_INFLATED_PER_STREAM = 16 * 1024 * 1024;
const MAX_STREAMS = 2_000;

/** `/Java#53cript` → `/JavaScript`; also collapses whitespace after `/`. */
function normaliseNames(text: string): string {
  return text.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

function findForbidden(text: string): string | null {
  const normalised = normaliseNames(text);
  for (const name of FORBIDDEN_NAMES) {
    // A name token is "/Name" followed by a delimiter or whitespace.
    const re = new RegExp(`/${name}(?=[\\s/<>\\[\\]()%]|$)`);
    if (re.test(normalised)) return name;
  }
  return null;
}

/**
 * Inflates every FlateDecode stream it can find, within hard bounds,
 * and returns their concatenated text for inspection. Streams using
 * other filters are left alone: they are rare in resumes and cannot
 * be inspected cheaply, so the raw-byte check still applies to them.
 */
function inflatedStreams(buf: Buffer): { text: string; bombed: boolean } {
  const latin = buf.toString("latin1");
  const parts: string[] = [];
  let total = 0;
  let count = 0;

  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(latin)) !== null) {
    if (++count > MAX_STREAMS) return { text: parts.join("\n"), bombed: true };

    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;

    // Only bother with Flate-compressed streams; look back at the
    // dictionary that precedes "stream".
    const dictStart = latin.lastIndexOf("<<", m.index);
    const dict = dictStart >= 0 ? latin.slice(dictStart, m.index) : "";
    if (!/FlateDecode/.test(normaliseNames(dict))) continue;

    const raw = buf.subarray(start, end);
    try {
      const out = zlib.inflateSync(raw, { maxOutputLength: MAX_INFLATED_PER_STREAM });
      total += out.length;
      if (total > MAX_INFLATED_TOTAL) return { text: parts.join("\n"), bombed: true };
      parts.push(out.toString("latin1"));
    } catch (err) {
      // RangeError from maxOutputLength means the stream expands past
      // the bound: that is a decompression bomb by definition.
      if (err instanceof RangeError) return { text: parts.join("\n"), bombed: true };
      // Anything else: a stream we cannot inflate (corrupt, or offsets
      // slightly off). Not inspectable, so not trusted below either.
      parts.push("");
    }
  }
  return { text: parts.join("\n"), bombed: false };
}

export function inspectPdf(buf: Buffer): PdfVerdict {
  if (buf.length < 64) return { ok: false, reason: "The file is too small to be a PDF" };

  const head = buf.subarray(0, 8).toString("latin1");
  if (!/^%PDF-1\.[0-7]/.test(head) && !/^%PDF-2\.0/.test(head)) {
    return { ok: false, reason: "The file does not start with a PDF header" };
  }

  const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) {
    return { ok: false, reason: "The PDF is truncated or malformed (no end-of-file marker)" };
  }

  const text = buf.toString("latin1");
  if (!/\d+\s+\d+\s+obj/.test(text) || !text.includes("endobj")) {
    return { ok: false, reason: "The PDF contains no objects" };
  }
  if (!/\btrailer\b/.test(text) && !/\/XRef\b/.test(normaliseNames(text)) && !text.includes("startxref")) {
    return { ok: false, reason: "The PDF has no cross-reference section" };
  }

  const rawHit = findForbidden(text);
  if (rawHit) return { ok: false, reason: `The PDF contains active content (${rawHit}) and was rejected` };

  const { text: inflated, bombed } = inflatedStreams(buf);
  if (bombed) return { ok: false, reason: "The PDF's compressed streams expand beyond the allowed size" };

  const hiddenHit = findForbidden(inflated);
  if (hiddenHit) {
    return { ok: false, reason: `The PDF contains active content (${hiddenHit}) and was rejected` };
  }

  return { ok: true };
}

/**
 * Bounded inspection of Zip containers (.docx), without extraction.
 *
 * Office documents are Zip archives, and a Zip signature proves only
 * that the first four bytes are "PK". This reads the central
 * directory — a table of contents at the end of the file — and checks
 * the archive against the policy below. Nothing is decompressed, so a
 * decompression bomb costs no memory here; its declared sizes and
 * ratios are what get it refused.
 *
 *  - at most MAX_ENTRIES entries
 *  - declared total uncompressed size ≤ MAX_TOTAL
 *  - per-entry compression ratio ≤ MAX_RATIO
 *  - no entry name with "..", a leading "/" or "\", or a drive letter
 *  - no nested archive or executable by name
 *  - for .docx: the two entries every Word document has must exist
 */

export type ZipVerdict = { ok: true; entries: number; total: number } | { ok: false; reason: string };

const MAX_ENTRIES = 500;
const MAX_TOTAL = 64 * 1024 * 1024;
const MAX_RATIO = 100;
const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

const NESTED_OR_EXECUTABLE = /\.(zip|rar|7z|tar|gz|bz2|xz|exe|dll|scr|bat|cmd|com|ps1|vbs|js|jar|msi|sh|docm|dotm|xlsm|pptm)$/i;

export function inspectZip(buf: Buffer, opts: { docx?: boolean } = {}): ZipVerdict {
  if (buf.length < 22) return { ok: false, reason: "The archive is truncated" };

  // The end-of-central-directory record is within the last 64 KB
  // (its comment field is at most 65535 bytes).
  const searchFrom = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= searchFrom; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, reason: "The archive has no central directory" };

  const entries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entries > MAX_ENTRIES) return { ok: false, reason: `The archive has too many entries (${entries})` };
  if (cdOffset + cdSize > buf.length) return { ok: false, reason: "The archive's directory is inconsistent" };

  const names = new Set<string>();
  let total = 0;
  let pos = cdOffset;

  for (let n = 0; n < entries; n += 1) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CD_SIG) {
      return { ok: false, reason: "The archive's directory is corrupt" };
    }
    const compressed = buf.readUInt32LE(pos + 20);
    const uncompressed = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");

    if (name.includes("..") || /^[/\\]/.test(name) || /^[a-zA-Z]:/.test(name) || name.includes("\0")) {
      return { ok: false, reason: "The archive contains an unsafe entry path" };
    }
    if (NESTED_OR_EXECUTABLE.test(name)) {
      return { ok: false, reason: "The archive contains a nested archive or executable" };
    }
    if (compressed > 0 && uncompressed / compressed > MAX_RATIO) {
      return { ok: false, reason: "The archive's compression ratio is suspicious" };
    }
    total += uncompressed;
    if (total > MAX_TOTAL) return { ok: false, reason: "The archive expands beyond the allowed size" };

    names.add(name);
    pos += 46 + nameLen + extraLen + commentLen;
  }

  if (opts.docx) {
    if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
      return { ok: false, reason: "That is not a Word document" };
    }
    // Macro-enabled parts or VBA projects do not belong in a .docx.
    for (const name of names) {
      if (/vbaProject|\.bin$/i.test(name) && name.startsWith("word/")) {
        return { ok: false, reason: "The document contains macros or binary parts and was rejected" };
      }
    }
  }

  return { ok: true, entries, total };
}

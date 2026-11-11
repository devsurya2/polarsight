import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { BadRequestError } from "./errors.js";
import { inspectPdf } from "./pdf.js";
import { inspectZip } from "./zipcheck.js";

/**
 * Two tiers of storage, two directories:
 *
 *   public   — served statically at STORAGE_PUBLIC_URL. Only a file
 *              that has passed validation AND a malware scan is ever
 *              written here.
 *   private  — never served. Applicant resumes live here for good;
 *              every other upload lives here while it waits for its
 *              scan, and is moved to public only on a CLEAN verdict.
 *
 * Keys are random. The original file name is kept as metadata in the
 * database and nowhere else, so nothing about the path on disk is
 * chosen by the uploader.
 */

export type Tier = "public" | "private";

export interface StoredObject {
  storageKey: string;
  tier: Tier;
  /** Null for private objects: there is no URL that reaches them. */
  url: string | null;
  checksum: string;
}

export interface StorageDriver {
  put(buffer: Buffer, mimeType: string, tier: Tier): Promise<StoredObject>;
  /** Moves a scanned object from quarantine into the public tier. */
  release(storageKey: string): Promise<StoredObject>;
  remove(storageKey: string, tier: Tier): Promise<void>;
  /** Reads an object back, for authorised download of a private file. */
  get(storageKey: string, tier: Tier): Promise<Buffer>;
}

export type MediaKind = "image" | "video" | "document";

interface MimeSpec {
  ext: string;
  kind: MediaKind;
  /** Per-type ceiling. Video is allowed to be larger than an icon. */
  maxBytes: number;
}

const MB = 1024 * 1024;

/**
 * The only types that may be uploaded to the media library, checked
 * against real bytes rather than the declared type or the file name.
 */
export const ALLOWED_MIME = new Map<string, MimeSpec>([
  ["image/png", { ext: "png", kind: "image", maxBytes: 8 * MB }],
  ["image/jpeg", { ext: "jpg", kind: "image", maxBytes: 8 * MB }],
  ["image/webp", { ext: "webp", kind: "image", maxBytes: 8 * MB }],
  ["image/avif", { ext: "avif", kind: "image", maxBytes: 8 * MB }],
  ["image/gif", { ext: "gif", kind: "image", maxBytes: 8 * MB }],
  ["image/svg+xml", { ext: "svg", kind: "image", maxBytes: 2 * MB }],
  ["video/mp4", { ext: "mp4", kind: "video", maxBytes: 64 * MB }],
  ["video/webm", { ext: "webm", kind: "video", maxBytes: 64 * MB }],
  ["application/pdf", { ext: "pdf", kind: "document", maxBytes: 16 * MB }],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    { ext: "docx", kind: "document", maxBytes: 16 * MB },
  ],
]);

/** Hard ceiling for multer; per-type limits are applied after sniffing. */
export const MAX_UPLOAD_BYTES = 64 * MB;

export function kindOf(mime: string): MediaKind | null {
  return ALLOWED_MIME.get(mime)?.kind ?? null;
}

/**
 * Magic-number check, so a renamed executable cannot pose as a PNG.
 *
 * `declared` is consulted only for Zip-based formats, where the
 * container signature is genuinely ambiguous; the archive is then
 * inspected structurally before it is accepted as that type.
 */
export function sniffMime(buf: Buffer, declared?: string): string | null {
  const b = (...bytes: number[]) => bytes.every((v, i) => buf[i] === v);

  if (b(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (b(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (b(0x47, 0x49, 0x46, 0x38)) return "image/gif";

  const riff = buf.subarray(0, 4).toString("latin1");
  if (riff === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";

  // Matroska / WebM
  if (b(0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";

  // ISO base media: "ftyp" at offset 4, brand decides the flavour.
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
    return "video/mp4";
  }

  // Zip container. Only accepted when the client declared the one
  // Zip-based type we allow, and only once the archive has been
  // inspected and found to actually be a Word document.
  if (b(0x50, 0x4b, 0x03, 0x04)) {
    if (declared && ALLOWED_MIME.get(declared)?.ext === "docx") {
      const verdict = inspectZip(buf, { docx: true });
      if (!verdict.ok) throw new BadRequestError(verdict.reason);
      return declared;
    }
    return null;
  }

  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "image/svg+xml";

  return null;
}

/** SVG can carry script, so it is screened rather than trusted. */
export function rejectUnsafeSvg(buf: Buffer): void {
  // Decode numeric entities first so an encoded "javascript:" or
  // event handler cannot slip past a textual check.
  const text = buf
    .toString("utf8")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .toLowerCase();
  if (
    /<script|\son[a-z]+\s*=|javascript:|<foreignobject|<iframe|<embed|<object|<set\b|<animate\b|<use[^>]+href\s*=\s*["']?(https?:|\/\/)|href\s*=\s*["']?data:/.test(
      text
    )
  ) {
    throw new BadRequestError("That SVG contains script or external references and was rejected");
  }
}

/** Random, unguessable, says nothing about who uploaded it. */
function randomKey(ext: string): string {
  return `${crypto.randomBytes(16).toString("hex")}.${ext}`;
}

const SAFE_KEY = /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/;

class LocalDriver implements StorageDriver {
  private dirs: Record<Tier, string> = {
    public: path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR),
    private: path.resolve(process.cwd(), env.STORAGE_PRIVATE_DIR),
  };

  /** Resolves a key inside a tier's directory, refusing anything that is not a key we minted. */
  private resolve(storageKey: string, tier: Tier): string {
    if (!SAFE_KEY.test(storageKey)) throw new BadRequestError("Invalid storage key");
    const dir = this.dirs[tier];
    const target = path.join(dir, storageKey);
    if (!target.startsWith(dir + path.sep)) throw new BadRequestError("Invalid storage key");
    return target;
  }

  private describe(key: string, tier: Tier, checksum: string): StoredObject {
    return {
      storageKey: key,
      tier,
      url: tier === "public" ? `${env.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${key}` : null,
      checksum,
    };
  }

  async put(buffer: Buffer, mimeType: string, tier: Tier): Promise<StoredObject> {
    const spec = ALLOWED_MIME.get(mimeType);
    if (!spec) throw new BadRequestError("Unsupported file type");

    const key = randomKey(spec.ext);
    await fs.mkdir(this.dirs[tier], { recursive: true, mode: 0o750 });
    // Owner read/write only. The web server never needs to execute an
    // upload, and nothing else on the host needs to read it.
    await fs.writeFile(this.resolve(key, tier), buffer, { mode: 0o600, flag: "wx" });

    return this.describe(key, tier, crypto.createHash("sha256").update(buffer).digest("hex"));
  }

  async release(storageKey: string): Promise<StoredObject> {
    const from = this.resolve(storageKey, "private");
    const to = this.resolve(storageKey, "public");
    await fs.mkdir(this.dirs.public, { recursive: true, mode: 0o750 });
    const buffer = await fs.readFile(from);
    await fs.rename(from, to);
    await fs.chmod(to, 0o640);
    return this.describe(storageKey, "public", crypto.createHash("sha256").update(buffer).digest("hex"));
  }

  async remove(storageKey: string, tier: Tier): Promise<void> {
    await fs.rm(this.resolve(storageKey, tier), { force: true });
  }

  async get(storageKey: string, tier: Tier): Promise<Buffer> {
    return fs.readFile(this.resolve(storageKey, tier));
  }
}

/**
 * The configured driver. `StorageDriver` is the whole surface the rest
 * of the codebase touches, so a bucket-backed driver can be added here
 * without any other file changing.
 */
export const storage: StorageDriver = new LocalDriver();

export const publicUploadDir = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);
export const privateUploadDir = path.resolve(process.cwd(), env.STORAGE_PRIVATE_DIR);

/**
 * Validates an uploaded buffer for the MEDIA LIBRARY and returns the
 * type to store it as. Throws a BadRequestError describing the problem.
 */
export function validateUpload(
  buffer: Buffer,
  declaredMime: string,
  size: number
): { mimeType: string; kind: MediaKind } {
  if (size === 0) throw new BadRequestError("That file is empty");

  const sniffed = sniffMime(buffer, declaredMime);
  if (!sniffed) throw new BadRequestError("Unrecognised or unsupported file type");

  const spec = ALLOWED_MIME.get(sniffed);
  if (!spec) {
    throw new BadRequestError(`Unsupported file type. Allowed: ${[...ALLOWED_MIME.keys()].join(", ")}`);
  }

  // The declared type must agree with the bytes. Browsers sometimes
  // send an empty or generic type, which is treated as "no claim".
  const vague = !declaredMime || declaredMime === "application/octet-stream";
  if (!vague && declaredMime !== sniffed) {
    throw new BadRequestError(`File contents (${sniffed}) do not match the declared type (${declaredMime})`);
  }

  if (size > spec.maxBytes) {
    throw new BadRequestError(`${spec.ext.toUpperCase()} files may be at most ${Math.round(spec.maxBytes / MB)} MB`);
  }

  if (sniffed === "image/svg+xml") rejectUnsafeSvg(buffer);
  if (sniffed === "application/pdf") {
    const verdict = inspectPdf(buffer);
    if (!verdict.ok) throw new BadRequestError(verdict.reason);
  }

  return { mimeType: sniffed, kind: spec.kind };
}

/**
 * The stricter policy for RESUMES, which arrive from anyone on the
 * internet: PDF only, RESUME_MAX_BYTES at most, a plain file name with
 * exactly one extension, and no active content inside the document.
 * Every layer here is independent of the others.
 */
export function validateResume(
  buffer: Buffer,
  declaredMime: string,
  size: number,
  originalName: string
): { mimeType: "application/pdf" } {
  if (size === 0) throw new BadRequestError("That file is empty");
  if (size > env.RESUME_MAX_BYTES) {
    throw new BadRequestError(`Your resume must be ${Math.round(env.RESUME_MAX_BYTES / MB)} MB or smaller`);
  }

  // 1. File name: one extension, and it must be .pdf. Double
  //    extensions, null bytes and path separators are all refused.
  const name = originalName.trim();
  if (name.includes("\0") || /[\\/]/.test(name) || name.includes("..")) {
    throw new BadRequestError("That file name is not allowed");
  }
  const parts = name.split(".");
  if (parts.length !== 2 || parts[1]!.toLowerCase() !== "pdf" || parts[0]!.length === 0) {
    throw new BadRequestError("Upload your resume as a single .pdf file");
  }

  // 2. Declared type.
  const vague = !declaredMime || declaredMime === "application/octet-stream";
  if (!vague && declaredMime !== "application/pdf") {
    throw new BadRequestError("Upload your resume as a PDF file");
  }

  // 3. Magic bytes.
  const sniffed = sniffMime(buffer, declaredMime);
  if (sniffed !== "application/pdf") throw new BadRequestError("That file is not a PDF");

  // 4. Structure and active content.
  const verdict = inspectPdf(buffer);
  if (!verdict.ok) throw new BadRequestError(verdict.reason);

  return { mimeType: "application/pdf" };
}

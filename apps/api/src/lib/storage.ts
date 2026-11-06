import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { BadRequestError } from "./errors.js";

export interface StoredObject {
  storageKey: string;
  url: string;
  checksum: string;
}

export interface StorageDriver {
  put(buffer: Buffer, filename: string, mimeType: string): Promise<StoredObject>;
  remove(storageKey: string): Promise<void>;
}

/** Only these may be uploaded. Checked against real bytes, not just the declared type. */
export const ALLOWED_MIME = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/svg+xml", "svg"],
  ["application/pdf", "pdf"],
]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Magic-number check, so a renamed executable cannot pose as a PNG. */
export function sniffMime(buf: Buffer): string | null {
  const b = (...bytes: number[]) => bytes.every((v, i) => buf[i] === v);
  if (b(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (b(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  if (buf.subarray(4, 8).toString() === "ftyp" && buf.subarray(8, 12).toString().startsWith("avif"))
    return "image/avif";
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "image/svg+xml";
  return null;
}

/** SVG can carry script, so it is sanitised rather than trusted. */
export function rejectUnsafeSvg(buf: Buffer): void {
  const text = buf.toString("utf8").toLowerCase();
  if (/<script|onload\s*=|onerror\s*=|javascript:|<foreignobject/.test(text)) {
    throw new BadRequestError("That SVG contains script and was rejected");
  }
}

function safeName(original: string, ext: string): string {
  const base = path
    .basename(original, path.extname(original))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "file";
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${base}.${ext}`;
}

class LocalDriver implements StorageDriver {
  private dir = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

  async put(buffer: Buffer, filename: string, mimeType: string): Promise<StoredObject> {
    const ext = ALLOWED_MIME.get(mimeType)!;
    const key = safeName(filename, ext);
    await fs.mkdir(this.dir, { recursive: true });

    const target = path.join(this.dir, key);
    // Belt and braces: the resolved path must stay inside the directory.
    if (!target.startsWith(this.dir + path.sep)) {
      throw new BadRequestError("Invalid upload path");
    }
    await fs.writeFile(target, buffer, { mode: 0o640 });

    return {
      storageKey: key,
      url: `${env.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${key}`,
      checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
    };
  }

  async remove(storageKey: string): Promise<void> {
    const target = path.join(this.dir, path.basename(storageKey));
    await fs.rm(target, { force: true });
  }
}

/**
 * Placeholder for an S3-compatible bucket. Wiring this up needs the
 * AWS SDK and real credentials; the driver boundary exists so that
 * swapping it changes nothing else in the codebase.
 */
class S3Driver implements StorageDriver {
  async put(): Promise<StoredObject> {
    throw new Error(
      "S3 storage driver is not configured. Set STORAGE_DRIVER=local for development, " +
        "or implement S3Driver with real bucket credentials before deploying."
    );
  }
  async remove(): Promise<void> {
    throw new Error("S3 storage driver is not configured.");
  }
}

export const storage: StorageDriver =
  env.STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();

export const localUploadDir = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

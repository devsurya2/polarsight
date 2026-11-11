/**
 * Encryption at rest for small secrets the database must hold — the
 * TOTP seed, specifically. AES-256-GCM with a random 96-bit nonce;
 * the ciphertext carries its nonce and tag, so a row is
 * self-contained.
 *
 * The key comes from MFA_ENCRYPTION_KEY (32 bytes, base64url). When
 * that is unset the key is derived from JWT_REFRESH_SECRET with HKDF,
 * which keeps development simple while still never storing a seed in
 * clear. Production should set a dedicated key so rotating one secret
 * does not force rotating the other.
 */

import crypto from "node:crypto";
import { env } from "../config/env.js";

const VERSION = "v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  if (env.MFA_ENCRYPTION_KEY) {
    const k = Buffer.from(env.MFA_ENCRYPTION_KEY, "base64url");
    if (k.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must decode to exactly 32 bytes");
    cachedKey = k;
  } else {
    cachedKey = Buffer.from(
      crypto.hkdfSync("sha256", env.JWT_REFRESH_SECRET, "polarsight-mfa", "totp-seed-at-rest", 32)
    );
  }
  return cachedKey;
}

export function seal(plain: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce.toString("base64url"), body.toString("base64url"), tag.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [version, nonce, body, tag] = sealed.split(".");
  if (version !== VERSION || !nonce || !body || !tag) throw new Error("Unrecognised sealed value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

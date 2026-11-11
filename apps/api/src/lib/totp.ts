/**
 * Time-based one-time passwords (RFC 6238) and recovery codes.
 *
 * Implemented on node:crypto rather than a dependency: the algorithm
 * is forty lines, and a package that touches the second factor is a
 * package worth not having in the supply chain.
 *
 * Secrets are 20 random bytes, shown once as base32 for authenticator
 * apps. Verification accepts the current 30-second step and one step
 * either side, which covers ordinary clock drift without widening the
 * window far enough to matter against the login rate limit.
 */

import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;

export function base32Encode(bytes: Buffer): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  if (bits.length % 5) out += ALPHABET[parseInt(bits.slice(-(bits.length % 5)).padEnd(5, "0"), 2)];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) bits += ALPHABET.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpAt(secretBase32: string, at = Date.now()): string {
  return hotp(base32Decode(secretBase32), Math.floor(at / 1000 / STEP_SECONDS));
}

/**
 * Verifies a code. Returns the step it matched so the caller can
 * refuse a replay of the same step, which is the one residual
 * weakness of TOTP in the accepted window.
 */
export function verifyTotp(secretBase32: string, code: string, at = Date.now()): number | null {
  const presented = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(presented)) return null;
  const secret = base32Decode(secretBase32);
  const step = Math.floor(at / 1000 / STEP_SECONDS);
  for (let delta = -WINDOW; delta <= WINDOW; delta += 1) {
    const expected = hotp(secret, step + delta);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(presented))) return step + delta;
  }
  return null;
}

/** otpauth:// URI for an authenticator app or QR generator. */
export function otpauthUri(secretBase32: string, account: string, issuer = "POLARSIGHT"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** Eight single-use recovery codes, returned in clear once; stored hashed. */
export function generateRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashes: plain.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");
}

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    issuer: "polarsight-api",
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "polarsight-api" }) as AccessPayload;
}

/**
 * Refresh tokens are opaque random strings. Only their SHA-256 digest
 * is stored, so a database leak cannot be replayed against the API.
 */
export function createRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export const hashRefreshToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Turns "7d" / "15m" / "30s" into milliseconds. */
export function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) throw new Error(`Unsupported TTL format: ${ttl}`);
  const value = Number(m[1]);
  const unit = m[2] as "s" | "m" | "h" | "d";
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return value * factor;
}

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessPayload {
  sub: string;
  email: string;
  role: string;
  /**
   * The refresh-token family this access token was issued with. The
   * auth middleware checks the family is still alive, which is what
   * makes sign-out and session revocation take effect immediately
   * rather than at token expiry.
   */
  sid: string;
  /**
   * "mfa_setup": the account must enrol a second factor before it can
   * do anything else. Issued to a Super Admin without MFA.
   */
  scope: "full" | "mfa_setup";
  /** Issued-at, in seconds. Set by jsonwebtoken. */
  iat?: number;
}

/** Permissions are deliberately NOT in the token: they are read from the role per request. */
export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    issuer: "polarsight-api",
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "polarsight-api" }) as AccessPayload & {
    purpose?: string;
  };
  // An MFA challenge or elevation token is signed with the same key;
  // refuse to treat either as a session.
  if (payload.purpose) throw new Error("not an access token");
  if (typeof payload.sid !== "string") throw new Error("legacy token");
  return payload;
}

/* ── MFA challenge: issued after the password, before the session ── */

export interface MfaChallengePayload {
  sub: string;
  purpose: "mfa";
}

export function signMfaChallenge(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa" } satisfies MfaChallengePayload, env.JWT_ACCESS_SECRET, {
    expiresIn: "5m",
    issuer: "polarsight-api",
  });
}

export function verifyMfaChallenge(token: string): string {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "polarsight-api" }) as MfaChallengePayload;
  if (payload.purpose !== "mfa" || typeof payload.sub !== "string") throw new Error("not a challenge");
  return payload.sub;
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

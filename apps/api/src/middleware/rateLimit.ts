import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env.js";

const shared = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests, slow down" } },
};

/** Baseline limit applied to the whole API. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/**
 * Sign-in is limited per address AND per account, so neither a single
 * host spraying accounts nor a botnet targeting one account gets many
 * attempts.
 */
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  // Keyed on address AND account, so neither one host spraying many
  // accounts nor many hosts targeting one account gets a free pass.
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    return `${req.ip ?? "unknown"}:${email}`;
  },
});

/**
 * Sign-in attempts per address, whatever the account. The per-account
 * limiter above stops a botnet on one account; this stops one host
 * spraying a password across every account.
 */
export const loginIpLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.LOGIN_IP_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
});

/** Public contact form: generous enough for humans, not for scripts. */
export const enquiryLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: env.ENQUIRY_RATE_LIMIT_MAX,
});

/**
 * Public trainer applications. Tighter than the contact form: each
 * submission can carry a resume, so it costs storage as well as a row.
 */
export const applicationLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: env.APPLICATION_RATE_LIMIT_MAX,
});

/** Uploads are expensive, so they get their own ceiling. */
export const uploadLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: env.UPLOAD_RATE_LIMIT_MAX,
});

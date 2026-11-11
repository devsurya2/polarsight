import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Secrets live in one place: the monorepo root .env.
const here = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== "production") {
  loadEnv({ path: path.resolve(here, "../../../../.env") });
}

const bool = z
  .string()
  .transform((v) => v === "true" || v === "1")
  .pipe(z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),

  // Refusing short secrets at boot is cheaper than discovering a weak
  // one in production.
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool.default(false),

  // Only enable behind a reverse proxy that sets X-Forwarded-For. With
  // this on and no proxy in front, any client can forge its address
  // and walk straight past the per-address rate limits.
  TRUST_PROXY: bool.default(false),

  // Roles whose members MUST use a second factor. A member without one
  // gets a restricted session that can only enrol. Defaults to the
  // Super Admin role in production and to nobody in development, so a
  // fresh checkout is usable before anyone owns an authenticator.
  MFA_REQUIRED_ROLES: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? null : v.split(",").map((s) => s.trim()).filter(Boolean))),

  // Encrypts TOTP seeds at rest. 32 bytes, base64url. Unset derives a
  // key from JWT_REFRESH_SECRET, which is acceptable for development.
  MFA_ENCRYPTION_KEY: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(8),
  // Sign-in attempts per address across ALL accounts, so one host
  // cannot spray a password over the whole administrator list.
  LOGIN_IP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // Public form ceilings, per hour per address. Generous enough for a
  // person, tight enough to make scripted abuse pointless. Raise them
  // temporarily when running the integration suite repeatedly.
  ENQUIRY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  APPLICATION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(40),

  // Only the local driver is implemented. Add a value here at the
  // same time as the driver, never before.
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./uploads"),
  // Private files (applicant resumes, and every upload while it is
  // still in quarantine). Never served statically; outside the
  // public directory so no path can reach it through /media.
  STORAGE_PRIVATE_DIR: z.string().default("./private-uploads"),
  STORAGE_PUBLIC_URL: z.string().default("https://polarsight.onrender.com/media"),

  // Resume uploads: PDF only, this many bytes at most.
  RESUME_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  // Malware scanning via clamd. Unset means uploads cannot be scanned:
  // resumes stay quarantined and cannot be downloaded, and public media
  // uploads are refused in production (allowed, flagged, in development).
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // Outbound email. Leave SMTP_HOST unset and the API reports email
  // as unconfigured and records every message as "not sent" rather
  // than pretending it was delivered.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Where recruitment notifications to staff are sent.
  MAIL_REPLY_TO: z.string().optional(),

  // Base URL of the public website, used to build links in emails and
  // to tell it when published content has changed.
  WEB_URL: z.string().url().default("https://polarsight.vercel.app"),

  // Shared with the website's /api/revalidate route. Unset means a
  // publish simply waits for the site's own one-minute refresh.
  REVALIDATE_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";

/** Resolved MFA policy: explicit setting, else Super Admin in production only. */
export const MFA_REQUIRED_ROLES: readonly string[] =
  env.MFA_REQUIRED_ROLES ?? (isProd ? ["Super Admin"] : []);

// A production boot with development defaults is a security incident
// waiting to happen, so refuse it outright.
if (isProd) {
  const problems: string[] = [];
  if (!env.COOKIE_SECURE) problems.push("COOKIE_SECURE must be true in production");
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  if (!env.MFA_ENCRYPTION_KEY)
    problems.push("MFA_ENCRYPTION_KEY must be set in production (32 random bytes, base64url)");
  if (problems.length) {
    console.error("Unsafe production configuration:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }

  // Local disk is the only storage driver implemented. That is
  // workable for a single instance writing to a persistent volume and
  // wrong for anything else, but the API cannot tell which it is in —
  // so this says so loudly rather than refusing a boot that may be
  // perfectly correct.
  console.warn(
    `Storage: uploads are written to ${env.STORAGE_LOCAL_DIR} on this instance's own disk. ` +
      "Ensure that path is a persistent volume, and that only one instance writes to it. " +
      "Object storage is not implemented; add a StorageDriver before scaling out."
  );
}

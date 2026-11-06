import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Secrets live in one place: the monorepo root .env.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../../.env") });

const bool = z
  .string()
  .transform((v) => v === "true" || v === "1")
  .pipe(z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(5000),
  API_URL: z.string().url().default("http://localhost:5000"),

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

  COOKIE_DOMAIN: z.string().default("localhost"),
  COOKIE_SECURE: bool.default(false),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(8),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./uploads"),
  STORAGE_PUBLIC_URL: z.string().default("http://localhost:5000/media"),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
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

// A production boot with development defaults is a security incident
// waiting to happen, so refuse it outright.
if (isProd) {
  const problems: string[] = [];
  if (!env.COOKIE_SECURE) problems.push("COOKIE_SECURE must be true in production");
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  if (env.STORAGE_DRIVER === "local")
    problems.push("STORAGE_DRIVER must not be 'local' in production");
  if (problems.length) {
    console.error("Unsafe production configuration:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
}

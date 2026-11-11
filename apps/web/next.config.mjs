import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..", "..");

/* One .env for the whole monorepo. Next only reads .env from the app
   folder, so the root file is loaded here instead, before the config
   object is built. Missing file is fine: every value below has a
   defined, empty default and the site omits what is not set. */
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // No root .env (fresh clone, or CI supplying real environment
  // variables directly). Fall through to whatever is already set.
}

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const isProd = process.env.NODE_ENV === "production";

/* Public contact details, inlined at build time.
   Listed explicitly rather than filtered out of process.env, so it is
   obvious from this file exactly what reaches the browser bundle. An
   unset value becomes "" and lib/siteConfig.js turns that into null,
   which every consumer renders as nothing at all. */
const PUBLIC_ENV = [
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "NEXT_PUBLIC_CONTACT_PHONE",
  "NEXT_PUBLIC_INSTITUTIONAL_EMAIL",
  "NEXT_PUBLIC_BUSINESS_EMAIL",
  "NEXT_PUBLIC_SOCIAL_LINKEDIN",
  "NEXT_PUBLIC_SOCIAL_INSTAGRAM",
  "NEXT_PUBLIC_SOCIAL_GITHUB",
];

/* Where uploaded images are served from, so the CSP can allow them.
   STORAGE_PUBLIC_URL is the API's public media base. */
const mediaOrigin = (() => {
  try {
    return new URL(process.env.STORAGE_PUBLIC_URL ?? `${API_URL}/media`).origin;
  } catch {
    return API_URL;
  }
})();

/**
 * Content Security Policy.
 *
 * Scripts: Next injects inline bootstrap scripts, so 'unsafe-inline'
 * is required unless every one carries a nonce (which needs a
 * middleware; see docs/security/SECURITY_CONFIGURATION_GUIDE.md for
 * the upgrade path). 'unsafe-eval' is development-only, for HMR.
 * Styles: framer-motion and Tailwind write inline styles.
 * Everything else is locked to this origin plus the media host.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${API_URL}${isProd ? "" : " ws: wss:"}`,
  `media-src 'self' ${mediaOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: Object.fromEntries(PUBLIC_ENV.map((k) => [k, process.env[k] ?? ""])),
  turbopack: {
    // Workspace root, not the app folder. npm workspaces hoists
    // dependencies to the monorepo root, and Turbopack refuses to
    // compile files outside the root it is given.
    root: repoRoot,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    // Proxying keeps the contact form on the site's own origin, so
    // there is no CORS preflight and no API host in the markup.
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;

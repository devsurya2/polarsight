import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/**
 * Security headers for the portal.
 *
 * In development Vite serves the app and sets them directly. A
 * production build is static files, so the reverse proxy in front of
 * them must send the same headers (docs/security/nginx.example.conf);
 * the build additionally injects a <meta> CSP as a floor, which
 * browsers honour for everything except frame-ancestors.
 */
function csp(dev: boolean, apiOrigin: string): string {
  // The portal only ever calls a relative /api, which the dev server
  // and the host's rewrite both proxy, so 'self' already covers it.
  // Naming the API origin as well is a convenience for development.
  // A loopback address must never survive into a production policy:
  // it is meaningless to a visitor's browser and advertises how the
  // build was configured, so it is dropped rather than inlined when
  // VITE_API_URL has not been set in the deployment environment.
  const extra = !dev && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(apiOrigin)
    ? ""
    : ` ${apiOrigin}`;

  return [
    "default-src 'self'",
    // React Fast Refresh injects an inline preamble in development only.
    `script-src 'self'${dev ? " 'unsafe-inline'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra}`,
    "font-src 'self' data:",
    `connect-src 'self'${extra}${dev ? " ws: wss:" : ""}`,
    `media-src 'self'${extra}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const headers = (dev: boolean, apiOrigin: string): Record<string, string> => ({
  "Content-Security-Policy": csp(dev, apiOrigin),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cache-Control": "no-store",
});

/** Injects the production CSP into index.html at build time. */
function metaCsp(apiOrigin: string): Plugin {
  return {
    name: "polarsight-meta-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp(false, apiOrigin)}" />`
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // Secrets live in the monorepo root .env, not per app.
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const apiUrl = env.VITE_API_URL ?? "http://localhost:5000";
  const apiOrigin = new URL(apiUrl).origin;
  const dev = mode !== "production";

  return {
    plugins: [react(), tailwindcss(), metaCsp(apiOrigin)],
    // The monorepo keeps one .env at its root, so Vite has to be told
    // where to look for the VITE_* values it inlines.
    envDir: path.resolve(__dirname, "../.."),
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      port: 3001,
      strictPort: true,
      headers: headers(dev, apiOrigin),
      // Proxying keeps the browser on one origin, so the API's
      // httpOnly cookies are first-party and CORS stays simple.
      proxy: {
        "/api": { target: apiUrl, changeOrigin: true, secure: false },
        "/media": { target: apiUrl, changeOrigin: true, secure: false },
      },
    },
    preview: { port: 3001, headers: headers(false, apiOrigin) },
    // Source maps would hand the portal's source to anyone who opens
    // devtools on the production host.
    build: { outDir: "dist", sourcemap: false },
  };
});

import path from "node:path";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Workspace root, not the app folder. npm workspaces hoists
    // dependencies to the monorepo root, and Turbopack refuses to
    // compile files outside the root it is given.
    root: path.join(import.meta.dirname, "..", ".."),
  },
  async rewrites() {
    // Proxying keeps the contact form on the site's own origin, so
    // there is no CORS preflight and no API host in the markup.
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;

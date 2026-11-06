import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Secrets live in the monorepo root .env, not per app.
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const apiUrl = env.VITE_API_URL ?? "http://localhost:5000";

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      port: 3001,
      strictPort: true,
      // Proxying keeps the browser on one origin, so the API's
      // httpOnly cookies are first-party and CORS stays simple.
      proxy: {
        "/api": { target: apiUrl, changeOrigin: true, secure: false },
        "/media": { target: apiUrl, changeOrigin: true, secure: false },
      },
    },
    build: { outDir: "dist", sourcemap: true },
  };
});

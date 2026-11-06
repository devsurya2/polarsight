import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env, isProd } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { localUploadDir } from "./lib/storage.js";

export function createApp() {
  const app = express();

  // Needed for correct client addresses behind a proxy, which the
  // rate limiters depend on.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser callers send no Origin header.
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        logger.warn({ origin }, "blocked by CORS");
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req: { url?: string }) => req.url === "/health" },
      customLogLevel: (_req: unknown, res: { statusCode: number }, err?: unknown) =>
        err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Uploaded files in local development. Served with a restrictive
  // disposition so nothing can be executed in a browser context.
  if (env.STORAGE_DRIVER === "local") {
    app.use(
      "/media",
      express.static(localUploadDir, {
        index: false,
        dotfiles: "deny",
        setHeaders(res) {
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        },
      })
    );
  }

  app.use("/api", apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

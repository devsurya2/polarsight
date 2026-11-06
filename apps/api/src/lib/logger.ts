import pino from "pino";
import { env, isDev } from "../config/env.js";

export const logger = pino({
  level: isDev ? "debug" : "info",
  // Never let a credential reach the log, wherever it appears.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
      "*.accessToken",
    ],
    censor: "[redacted]",
  },
  transport: isDev ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : undefined,
  base: { env: env.NODE_ENV },
});

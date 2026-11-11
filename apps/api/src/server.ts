
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  // Fail at boot rather than on the first request.
  await prisma.$queryRaw`SELECT 1`;
  logger.info("database reachable");

  const app = createApp();

  // Render supplies PORT dynamically. Use API_PORT for local development.
 const rawPort = process.env.PORT?.trim() || String(env.API_PORT);
const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Invalid API port configuration");
  }

  // Bind to all network interfaces so Render can reach the service.
  const server = app.listen(port, "0.0.0.0", () => {
    logger.info(`POLARSIGHT API listening on port ${port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");

    server.close(async (error) => {
      if (error) {
        logger.error({ error }, "error closing HTTP server");
        process.exitCode = 1;
      }

      await prisma.$disconnect();
      process.exit();
    });

    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});

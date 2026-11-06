import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  // Fail at boot rather than on the first request.
  await prisma.$queryRaw`SELECT 1`;
  logger.info("database reachable");

  const app = createApp();
  const server = app.listen(env.API_PORT, () => {
    logger.info(`POLARSIGHT API listening on http://localhost:${env.API_PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
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

import { PrismaClient } from "@prisma/client";
import { isDev } from "../config/env.js";

// A single client for the process. In dev, tsx reloads the module on
// change, so the instance is cached on globalThis to avoid exhausting
// the connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ["warn", "error"] : ["error"],
  });

if (isDev) globalForPrisma.prisma = prisma;

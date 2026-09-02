import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads server modules in dev, which would otherwise open a new
 * connection pool on every change. Cache the client on globalThis in dev.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

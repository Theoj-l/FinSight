import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pgPoolConfig } from "./pg-pool-config";

/**
 * Prisma client singleton.
 *
 * Queries go through node-postgres (@prisma/adapter-pg): one network round trip
 * per query instead of several. See lib/pg-pool-config.ts.
 *
 * Next.js hot-reloads server modules in dev, which would otherwise open a new
 * connection pool on every change. Cache the client on globalThis in dev.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const cached = globalForPrisma.prisma;
const compatible = cached && cached.financial_settings && cached.financial_manual_forecast;
if (cached && !compatible) void cached.$disconnect().catch(() => undefined);

export const prisma =
  (compatible ? cached : undefined) ??
  new PrismaClient({
    adapter: new PrismaPg(pgPoolConfig(process.env.DATABASE_URL)),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (!prisma.financial_settings || !prisma.financial_manual_forecast) {
  throw new Error("Prisma client is outdated. Run npm run db:generate in web, then restart the development server.");
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

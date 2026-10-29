import type { PoolConfig } from "pg";

// Query-string options that only Prisma's own engine understands. node-postgres
// would otherwise forward them to the server as startup parameters.
const PRISMA_ONLY = ["pgbouncer", "connection_limit", "pool_timeout", "sslmode", "schema", "statement_cache_size"];

/**
 * Turns a Prisma-style Postgres URL (the DATABASE_URL format in .env.example)
 * into node-postgres pool settings for @prisma/adapter-pg.
 *
 * Why the adapter: through Supabase's transaction pooler (port 6543,
 * `pgbouncer=true`) Prisma's built-in driver needs several network round trips
 * per query (about 430 ms each from Singapore to the Seoul database). node-postgres
 * sends a query in one round trip (about 75 ms), with no named prepared
 * statements, so it is still safe behind the transaction pooler.
 *
 * - `connection_limit` becomes the pool size (default 10).
 * - `pool_timeout` (seconds) becomes the wait for a free connection.
 * - TLS is on unless `sslmode=disable` or the host is local. The certificate is
 *   not verified, which matches Prisma's default `sslmode=prefer`; Supabase's
 *   certificate is signed by its own CA, not one Node trusts.
 */
export function pgPoolConfig(url: string | undefined): PoolConfig {
  if (!url) return {};
  const parsed = new URL(url);
  const params = parsed.searchParams;
  const max = Number(params.get("connection_limit")) || 10;
  const poolTimeout = Number(params.get("pool_timeout"));
  const sslmode = params.get("sslmode");
  for (const key of PRISMA_ONLY) params.delete(key);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  return {
    connectionString: parsed.toString(),
    max,
    ...(poolTimeout > 0 ? { connectionTimeoutMillis: poolTimeout * 1000 } : {}),
    ssl: sslmode === "disable" || (local && !sslmode) ? false : { rejectUnauthorized: false },
  };
}

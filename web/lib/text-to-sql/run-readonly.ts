// ---------------------------------------------------------------------------
// run-readonly.ts — runs one validated SELECT with the read-only connection.
//
// Uses CHAT_DATABASE_URL (the finsight_chat_ro role), never DATABASE_URL.
// Every query runs in a READ ONLY transaction with a timeout, and is wrapped so
// the row count is capped no matter what the model wrote.
// ---------------------------------------------------------------------------

import { Prisma, PrismaClient } from "@prisma/client";
import { MAX_ROWS, STATEMENT_TIMEOUT } from "./config";

let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  const url = process.env.CHAT_DATABASE_URL;
  if (!url) throw new Error("CHAT_DATABASE_URL is not set. Add the read-only connection string to web/.env.");
  client ??= new PrismaClient({ datasourceUrl: url, log: [] });
  return client;
}

export async function closeReadonlyClient(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

export interface QueryRows {
  rows: Record<string, unknown>[];
  rowCount: number;
  /** More rows matched than MAX_ROWS; the rest were dropped. */
  truncated: boolean;
  ms: number;
}

const MAX_CELL_CHARS = 300;

/** Make a database value safe to put in JSON (numeric, bigint, dates, jsonb) and bounded in size. */
function plain(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
  }
  if (typeof value === "string" && value.length > MAX_CELL_CHARS) return `${value.slice(0, MAX_CELL_CHARS)}…`;
  return value;
}

export async function runReadOnly(sql: string): Promise<QueryRows> {
  const started = performance.now();
  const wrapped = `select * from (${sql}) as q limit ${MAX_ROWS + 1}`;

  const raw = await getClient().$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("set transaction read only");
      await tx.$executeRawUnsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
      return tx.$queryRawUnsafe<Record<string, unknown>[]>(wrapped);
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  const truncated = raw.length > MAX_ROWS;
  const rows = raw.slice(0, MAX_ROWS).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, plain(value)])));
  return { rows, rowCount: rows.length, truncated, ms: Math.round(performance.now() - started) };
}

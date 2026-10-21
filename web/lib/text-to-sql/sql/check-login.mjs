// ---------------------------------------------------------------------------
// check-login.mjs — tests the REAL login of the read-only role (CHAT_DATABASE_URL).
//
// verify-readonly-role.sql proves the permissions. This proves the settings that
// only apply on a real connection: read-only by default and a statement timeout.
// It only reads; it never writes.
//
//   cd web
//   node --env-file=.env lib/text-to-sql/sql/check-login.mjs
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";

const url = process.env.CHAT_DATABASE_URL;
if (!url) {
  console.error("CHAT_DATABASE_URL is not set. Add it to web/.env first.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: url, log: [] });
let failed = false;

function report(ok, text) {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${text}`);
}

async function main() {
  try {
    const [who] = await prisma.$queryRawUnsafe("select current_user as who");
    report(who.who === "finsight_chat_ro", `connected as ${who.who} (expected finsight_chat_ro)`);

    const [ro] = await prisma.$queryRawUnsafe("show default_transaction_read_only");
    report(ro.default_transaction_read_only === "on", `default_transaction_read_only = ${ro.default_transaction_read_only}`);

    const [timeout] = await prisma.$queryRawUnsafe("show statement_timeout");
    report(timeout.statement_timeout === "10s", `statement_timeout = ${timeout.statement_timeout} (expected 10s)`);

    const [rows] = await prisma.$queryRawUnsafe("select count(*)::int as n from public.pbalance");
    report(rows.n > 0, `can read pbalance (${rows.n} rows)`);

    // A 15 second sleep must be cut off at about 10 seconds by the timeout.
    const started = Date.now();
    try {
      await prisma.$queryRawUnsafe("select pg_sleep(15)");
      report(false, "pg_sleep(15) finished: the statement timeout is not applied");
    } catch (error) {
      const seconds = (Date.now() - started) / 1000;
      const timedOut = /statement timeout|canceling statement/i.test(String(error?.message));
      report(timedOut && seconds < 14, `a 15s query was cut off after ${seconds.toFixed(1)}s`);
    }
  } catch (error) {
    failed = true;
    console.error("Could not run the checks:", String(error?.message ?? error).split("\n").slice(-3).join("\n"));
  } finally {
    await prisma.$disconnect();
  }

  console.log(failed ? "\nRESULT: FAILED" : "\nRESULT: ALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}

await main();

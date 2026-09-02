/**
 * Applies prisma/finsight_schema.sql to the database.
 *
 * The schema for the 17 AutoCount tables is hand-authored SQL (source of truth),
 * not Prisma migrations — it carries COMMENT ON COLUMN and RLS that Prisma
 * migrate can't express cleanly. After running this, run `npm run db:pull` to
 * refresh schema.prisma, then `npm run db:generate`.
 *
 * Uses DIRECT_URL (session pooler / direct connection) because DDL needs a real
 * session, not the transaction pooler.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(webDir, ".env");
const sqlPath = path.join(webDir, "prisma", "finsight_schema.sql");

if (!existsSync(envPath)) {
  console.error("web/.env not found. Run `npm run setup` first.");
  process.exit(1);
}

const env = readFileSync(envPath, "utf8");
const match = env.match(/^\s*DIRECT_URL\s*=\s*"?([^"\n]+)"?/m);
if (!match) {
  console.error("DIRECT_URL not set in web/.env");
  process.exit(1);
}

console.log("Applying prisma/finsight_schema.sql via DIRECT_URL …");
execFileSync(
  "npx",
  ["prisma", "db", "execute", "--url", match[1], "--file", sqlPath],
  { cwd: webDir, stdio: "inherit" },
);
console.log("Done. Next: npm run db:pull && npm run db:generate");

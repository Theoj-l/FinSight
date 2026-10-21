// ---------------------------------------------------------------------------
// validate-sql.ts — decides whether model-written SQL may be run.
//
// The SQL is parsed with the real Postgres parser (libpg-query), never matched
// with regular expressions. It is accepted only if it is exactly one SELECT
// that touches only allowed tables and only allowed functions.
//
// This is the second layer. The first is the database role itself
// (finsight_chat_ro, SELECT only), which stays safe even if this has a bug.
// ---------------------------------------------------------------------------

import { parse } from "libpg-query";
import { allowedTables, allowedViews, viewsEnabled } from "./config";
import { viewSources } from "./virtual-views";

export type SqlCheck =
  | {
      ok: true;
      sql: string;
      /** Real tables read, including those behind any virtual view. */
      tables: string[];
      functions: string[];
      /** Virtual views (v_...) the query uses, to be expanded before it runs. */
      virtualViews: string[];
    }
  | { ok: false; reason: string };

const ALLOWED_FUNCTIONS = new Set([
  // aggregates and windows
  "sum", "count", "avg", "min", "max", "stddev", "variance", "string_agg", "array_agg", "bool_and", "bool_or",
  "percentile_cont", "percentile_disc", "row_number", "rank", "dense_rank", "lag", "lead", "first_value",
  "last_value", "ntile",
  // numbers
  "round", "abs", "ceil", "ceiling", "floor", "trunc", "power", "sqrt", "to_number",
  // dates
  "date_trunc", "date_part", "extract", "to_char", "to_date", "make_date", "age", "now", "generate_series",
  // text
  "lower", "upper", "initcap", "concat", "length", "substr", "substring", "trim", "btrim", "ltrim", "rtrim",
  "left", "right", "replace", "position", "strpos", "split_part",
  // json (the ML tables keep reasons as jsonb)
  "jsonb_array_elements_text", "jsonb_array_length", "jsonb_typeof", "jsonb_extract_path_text",
]);

type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);

/** Visit every parse-tree node. Nodes look like { SelectStmt: {...} }, so the key is the node type. */
function walk(node: unknown, visit: (type: string, value: Obj) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (!isObject(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (/^[A-Z]/.test(key) && isObject(value)) visit(key, value);
    walk(value, visit);
  }
}

const stringValue = (node: unknown): string | undefined =>
  isObject(node) && isObject(node.String) && typeof node.String.sval === "string" ? node.String.sval : undefined;

export async function validateSql(rawSql: string): Promise<SqlCheck> {
  const sql = rawSql.trim().replace(/;+\s*$/, "").trim();
  if (!sql) return { ok: false, reason: "The SQL is empty." };

  let tree: unknown;
  try {
    tree = await parse(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : "syntax error";
    return { ok: false, reason: `The SQL does not parse: ${message}` };
  }

  const statements = isObject(tree) && Array.isArray(tree.stmts) ? tree.stmts : [];
  if (statements.length !== 1) return { ok: false, reason: "Exactly one statement is allowed." };

  const top = isObject(statements[0]) && isObject(statements[0].stmt) ? statements[0].stmt : {};
  if (!isObject(top.SelectStmt)) return { ok: false, reason: "Only SELECT statements are allowed." };

  const allowed = new Set(allowedTables());
  const views = new Set(allowedViews());
  const cteNames = new Set<string>();
  walk(top, (type, value) => {
    if (type === "CommonTableExpr" && typeof value.ctename === "string") cteNames.add(value.ctename);
  });

  const tables = new Set<string>();
  const virtualViews = new Set<string>();
  const functions = new Set<string>();
  let problem: string | undefined;
  const reject = (reason: string) => {
    problem ??= reason;
  };

  walk(top, (type, value) => {
    switch (type) {
      case "InsertStmt":
      case "UpdateStmt":
      case "DeleteStmt":
      case "MergeStmt":
        reject("Data-changing statements are not allowed, not even inside a WITH.");
        break;

      case "SelectStmt":
        if (value.intoClause) reject("SELECT ... INTO is not allowed.");
        if (Array.isArray(value.lockingClause) && value.lockingClause.length > 0) reject("Row locking (FOR UPDATE / SHARE) is not allowed.");
        break;

      case "RangeVar": {
        const name = typeof value.relname === "string" ? value.relname : "";
        const schema = typeof value.schemaname === "string" ? value.schemaname : undefined;
        if (!schema && cteNames.has(name)) break;

        // Virtual views are plain names (v_monthly_pl); they are never schema-qualified.
        if (!schema && views.has(name)) {
          virtualViews.add(name);
          tables.add(name);
          for (const source of viewSources(name)) tables.add(source);
          break;
        }
        if (schema && schema !== "public") {
          reject(`The schema "${schema}" is not allowed.`);
          break;
        }
        if (!allowed.has(name)) {
          reject(
            viewsEnabled() && (name === "pbalance" || name === "budget_pbalance")
              ? `The table "${name}" is not allowed directly. Use v_monthly_pl, v_monthly_account or v_budget_variance, which already apply the sign rules.`
              : `The table "${name}" is not allowed.`,
          );
          break;
        }
        tables.add(name);
        break;
      }

      case "FuncCall": {
        const parts = Array.isArray(value.funcname) ? value.funcname.map(stringValue) : [];
        const name = parts.at(-1);
        const schema = parts.length > 1 ? parts[0] : undefined;
        if (!name || (schema && schema !== "pg_catalog")) {
          reject("A function with an unrecognised or non-standard name was used.");
          break;
        }
        if (!ALLOWED_FUNCTIONS.has(name)) {
          reject(`The function "${name}" is not allowed.`);
          break;
        }
        functions.add(name);
        break;
      }

      case "ParamRef":
        reject("Query parameters are not allowed.");
        break;
    }
  });

  if (problem) return { ok: false, reason: problem };
  return { ok: true, sql, tables: [...tables].sort(), functions: [...functions].sort(), virtualViews: [...virtualViews].sort() };
}

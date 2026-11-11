// ---------------------------------------------------------------------------
// config.ts — limits and allowlists for the direct text-to-SQL pipeline.
// ---------------------------------------------------------------------------

import { VIRTUAL_VIEW_NAMES } from "./virtual-views";

/** Same model as the existing classify-then-retrieve pipeline, so the comparison is fair. */
export const GEMINI_MODEL = "gemini-3.5-flash";

/** How many SELECTs the model may plan for one question. */
export const MAX_QUERIES = 3;

/** Rows kept from one query. More are cut off and flagged as truncated. */
export const MAX_ROWS = 200;

/** Server-side cut-off for one query. The role has the same limit as a backstop. */
export const STATEMENT_TIMEOUT = "10s";

/** The 17 ledger tables the read-only role can SELECT from. */
export const LEDGER_TABLES = [
  "acc_type",
  "ar_invoice",
  "branch",
  "budget",
  "budget_pbalance",
  "debtor",
  "dept",
  "fiscal_year",
  "gl_dtl",
  "gl_mast",
  "item",
  "item_group",
  "iv",
  "iv_dtl",
  "pbalance",
  "pl_format",
  "sales_agent",
] as const;

/**
 * Anomaly and forecast results written by the ML service. They are only
 * available once the role has been granted them (see sql/grant-ml-tables.sql)
 * and TEXT_TO_SQL_ML_TABLES=true is set.
 */
export const ML_TABLES = ["anomaly_alert", "anomaly_run", "forecast_run", "forecast_value"] as const;

/**
 * Raw tables the virtual views (virtual-views.ts) replace. With the views on, the
 * model may not query these directly, so it cannot redo the debit/credit arithmetic
 * itself, which it got wrong in testing.
 */
const REPLACED_BY_VIEWS = new Set(["pbalance", "budget_pbalance"]);

export function mlTablesEnabled(): boolean {
  return process.env.TEXT_TO_SQL_ML_TABLES === "true";
}

export function viewsEnabled(): boolean {
  return process.env.TEXT_TO_SQL_VIEWS === "true";
}

/** Tables in the public schema the model may read. */
export function allowedTables(): string[] {
  const tables: string[] = mlTablesEnabled() ? [...LEDGER_TABLES, ...ML_TABLES] : [...LEDGER_TABLES];
  return viewsEnabled() ? tables.filter((table) => !REPLACED_BY_VIEWS.has(table)) : tables;
}

/** Virtual views the model may read (nothing is created in the database). */
export function allowedViews(): string[] {
  return viewsEnabled() ? [...VIRTUAL_VIEW_NAMES] : [];
}

// ---------------------------------------------------------------------------
// pipeline.ts — question in, answer out, with model-written SQL in between.
//
//   Call 1  generateSql   question -> read-only SELECT(s)
//   check   validateSql   parsed; one SELECT, allowed tables and functions only
//   run     runReadOnly   finsight_chat_ro, read-only transaction, timeout, row cap
//   Call 2  writeAnswer   rows -> written answer (same prompt as the old pipeline)
//
// If the SQL is rejected or fails, the model gets the error once and tries again.
// ---------------------------------------------------------------------------

import type { TourScript } from "../../app/components/tour/tour-script";
import { writeAnswer, writeAnswerWithWalkthrough, type ExecutedQuery } from "./answer";
import { sameScope, validateScope, type ChatContext, type ScopeOptions } from "./context";
import { generateSql, type SqlPlan } from "./generate-sql";
import { runReadOnly } from "./run-readonly";
import { validateSql } from "./validate-sql";
import { expandVirtualViews } from "./virtual-views";

export type DirectSqlStatus = "answered" | "declined" | "clarify" | "error";

export interface DirectSqlResult {
  status: DirectSqlStatus;
  reply: string;
  queries: (ExecutedQuery & { tables?: string[] })[];
  attempts: number;
  /** Every table the queries read, across all queries. */
  tablesUsed: string[];
  timings: { generateMs: number; runMs: number; answerMs: number; totalMs: number };
  tokens: { input: number; output: number };
  /** Charts and tables on the dashboard to point at while explaining (only when a dashboard context was given). */
  walkthrough?: TourScript | null;
  /** The dashboard settings the walkthrough is written for. Differs from the user's current ones when the question is about something else. */
  scope?: ChatContext | null;
  /** Why it failed or was declined. */
  detail?: string;
}

export interface DirectSqlOptions {
  /** Today's date, YYYY-MM-DD. */
  today: string;
  /** Newest month with data, YYYYMM. */
  latestPeriod: number;
  /** The dashboard the user has open. When given, the answer also says which panels to highlight. */
  context?: ChatContext | null;
  /** What exists in the data, so a scope proposed by the model can be checked. Without it the dashboard is never moved. */
  scopeOptions?: ScopeOptions;
}

const ms = (from: number) => Math.round(performance.now() - from);
const short = (text: string) => text.replace(/\s+/g, " ").slice(0, 300);

export async function answerWithDirectSql(question: string, options: DirectSqlOptions): Promise<DirectSqlResult> {
  const started = performance.now();
  const timings = { generateMs: 0, runMs: 0, answerMs: 0, totalMs: 0 };
  const tokens = { input: 0, output: 0 };
  const add = (usage: { input: number; output: number }) => {
    tokens.input += usage.input;
    tokens.output += usage.output;
  };
  const finish = (partial: Omit<DirectSqlResult, "timings" | "tokens">): DirectSqlResult => {
    timings.totalMs = ms(started);
    return { ...partial, timings, tokens };
  };

  let feedback: string | undefined;
  let attempts = 0;
  let lastQueries: DirectSqlResult["queries"] = [];
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts = attempt + 1;

    const t1 = performance.now();
    let plan: SqlPlan;
    try {
      plan = await generateSql(question, { ...options, feedback });
    } catch (error) {
      timings.generateMs += ms(t1);
      return finish({ status: "error", reply: "", queries: lastQueries, attempts, tablesUsed: [], detail: `Planning failed: ${short(String(error))}` });
    }
    timings.generateMs += ms(t1);
    add(plan.tokens);

    if (!plan.supported || (plan.queries.length === 0 && !plan.needsClarification)) {
      return finish({
        status: "declined",
        reply: plan.reason || "I can only answer questions about TSH Group's financial data.",
        queries: [],
        attempts,
        tablesUsed: [],
      });
    }
    if (plan.needsClarification) {
      return finish({ status: "clarify", reply: plan.needsClarification, queries: [], attempts, tablesUsed: [] });
    }

    // Check every query before running any of them.
    const checked = await Promise.all(plan.queries.map(async (query) => ({ query, check: await validateSql(query.sql) })));
    const rejected = checked.find(({ check }) => !check.ok);
    lastQueries = checked.map(({ query, check }) => ({ ...query, ...(check.ok ? { tables: check.tables } : { error: check.reason }) }));

    if (rejected && !rejected.check.ok) {
      lastProblem = `Rejected: ${rejected.check.reason}`;
      feedback = `Your previous SQL was rejected by the safety check.\nSQL: ${rejected.query.sql}\nReason: ${rejected.check.reason}\nWrite a corrected plan that follows the rules.`;
      continue;
    }

    // Run them.
    const t2 = performance.now();
    const executed: DirectSqlResult["queries"] = [];
    let failure: { sql: string; message: string } | undefined;
    for (const { query, check } of checked) {
      if (!check.ok) continue;
      try {
        // The model's SQL is what is kept and shown; the virtual views are only added to run it.
        const rows = await runReadOnly(expandVirtualViews(check.sql, check.virtualViews));
        executed.push({ ...query, sql: check.sql, tables: check.tables, ...rows });
      } catch (error) {
        const message = short(error instanceof Error ? error.message.split("\n").filter(Boolean).at(-1) ?? error.message : String(error));
        executed.push({ ...query, sql: check.sql, tables: check.tables, error: message });
        failure = { sql: check.sql, message };
        break;
      }
    }
    timings.runMs += ms(t2);
    lastQueries = executed;

    if (failure) {
      lastProblem = `Database error: ${failure.message}`;
      feedback = `Your previous SQL failed when it ran.\nSQL: ${failure.sql}\nError: ${failure.message}\nWrite a corrected plan.`;
      continue;
    }

    // Answer from the rows.
    const t3 = performance.now();
    try {
      // The scope the question is about, if it is a real one and differs from what is on screen;
      // otherwise the dashboard stays as the user has it.
      const proposed = options.context && options.scopeOptions ? validateScope(plan.scope, options.scopeOptions) : null;
      const target = proposed ?? options.context ?? null;
      const moved = Boolean(proposed && options.context && !sameScope(proposed, options.context));

      const written = target
        ? await writeAnswerWithWalkthrough(question, executed, target, moved)
        : { ...(await writeAnswer(question, executed)), walkthrough: null };
      timings.answerMs += ms(t3);
      add(written.tokens);
      const tablesUsed = [...new Set(executed.flatMap((query) => query.tables ?? []))].sort();
      return finish({
        status: "answered",
        reply: written.reply,
        walkthrough: written.walkthrough,
        scope: written.walkthrough ? target : null,
        queries: executed,
        attempts,
        tablesUsed,
      });
    } catch (error) {
      timings.answerMs += ms(t3);
      return finish({ status: "error", reply: "", queries: executed, attempts, tablesUsed: [], detail: `Writing the answer failed: ${short(String(error))}` });
    }
  }

  return finish({ status: "error", reply: "", queries: lastQueries, attempts, tablesUsed: [], detail: lastProblem || "The SQL could not be made to work." });
}

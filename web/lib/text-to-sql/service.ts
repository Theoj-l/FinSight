// ---------------------------------------------------------------------------
// service.ts — what the /api/chat-sql route calls: one question in, an HTTP-ready
// result out. Kept apart from the route so it can be tested without Next.
// ---------------------------------------------------------------------------

import type { TourScript } from "../../app/components/tour/tour-script";
import type { ChatContext, ScopeOptions } from "./context";
import { answerWithDirectSql } from "./pipeline";
import { runReadOnly } from "./run-readonly";

export type ChatSqlResult =
  | { status: 200; body: { reply: string; walkthrough?: TourScript; scope?: ChatContext } }
  | { status: 502; body: { error: string; details?: string } };

const LATEST_PERIOD_TTL_MS = 10 * 60_000;
let cachedLatest: { period: number; at: number } | null = null;

/** The newest month with ledger data. Cached briefly: it changes at most monthly. */
export async function getLatestPeriod(now = Date.now()): Promise<number> {
  if (cachedLatest && now - cachedLatest.at < LATEST_PERIOD_TTL_MS) return cachedLatest.period;
  const { rows } = await runReadOnly("select max(period_no) as latest from pbalance");
  const raw = (rows[0] as { latest?: unknown } | undefined)?.latest;
  // A month is YYYYMM. Number(null) is 0, so a missing value must be rejected before converting.
  const period = raw === null || raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(period) || period < 100001 || period % 100 < 1 || period % 100 > 12) {
    throw new Error("Could not read the newest period");
  }
  cachedLatest = { period, at: now };
  return period;
}

/** Test hook. */
export function resetLatestPeriodCache() {
  cachedLatest = null;
  cachedScopeOptions = null;
}

let cachedScopeOptions: { options: ScopeOptions; at: number } | null = null;

/** The months, departments and branches that exist, used to check a scope the model proposes. Cached briefly. */
export async function getScopeOptions(now = Date.now()): Promise<ScopeOptions> {
  if (cachedScopeOptions && now - cachedScopeOptions.at < LATEST_PERIOD_TTL_MS) return cachedScopeOptions.options;
  const [periods, units, branches] = await Promise.all([
    runReadOnly("select distinct period_no from pbalance"),
    runReadOnly("select dept_no from dept"),
    runReadOnly("select branch_code from branch"),
  ]);
  const options: ScopeOptions = {
    periods: periods.rows.map((row) => Number((row as { period_no: unknown }).period_no)).filter(Number.isInteger),
    units: units.rows.map((row) => String((row as { dept_no: unknown }).dept_no)),
    branches: branches.rows.map((row) => String((row as { branch_code: unknown }).branch_code)),
  };
  cachedScopeOptions = { options, at: now };
  return options;
}

/** Today's date (YYYY-MM-DD) in Singapore, where TSH Group is, whatever zone the server runs in. */
export function todayInSingapore(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

export async function answerChatQuestion(message: string, context: ChatContext | null): Promise<ChatSqlResult> {
  const verbose = process.env.NODE_ENV !== "production";
  try {
    const result = await answerWithDirectSql(message, {
      today: todayInSingapore(),
      latestPeriod: await getLatestPeriod(),
      context,
      // Only looked up when the dashboard is open: it is what lets the answer move the dashboard.
      ...(context ? { scopeOptions: await getScopeOptions() } : {}),
    });

    if (result.status === "error") {
      console.error("chat-sql pipeline error:", result.detail);
      return { status: 502, body: { error: "Chat request processing failed", ...(verbose ? { details: result.detail } : {}) } };
    }

    // answered, declined and "please clarify" are all normal replies the user should read.
    return {
      status: 200,
      body: {
        reply: result.reply,
        ...(result.walkthrough ? { walkthrough: result.walkthrough } : {}),
        // The dashboard settings the walkthrough is written for; the page applies them before highlighting.
        ...(result.walkthrough && result.scope ? { scope: result.scope } : {}),
      },
    };
  } catch (error) {
    console.error("chat-sql error:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return { status: 502, body: { error: "Chat request processing failed", ...(verbose ? { details } : {}) } };
  }
}

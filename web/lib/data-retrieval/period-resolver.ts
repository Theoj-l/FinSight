// ---------------------------------------------------------------------------
// period-resolver.ts — Converts classifier period tokens into concrete
// YYYYMM period_no values and date ranges.
//
// The pbalance / budget_pbalance tables use an integer period_no encoded as
// YYYYMM (e.g. 202506 = June 2025).  Date-based tables (iv, ar_invoice,
// gl_dtl) use a date column.  This module resolves both.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import type { PeriodInfo } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function yyyymm(year: number, month: number): number {
  return year * 100 + month;
}

function parseYyyymm(p: number): { year: number; month: number } {
  return { year: Math.floor(p / 100), month: p % 100 };
}

function periodLabel(periodNo: number): string {
  const { year, month } = parseYyyymm(periodNo);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function periodLabels(periodNos: number[]): string {
  if (periodNos.length === 1) return periodLabel(periodNos[0]);
  const sorted = [...periodNos].sort((a, b) => a - b);
  return `${periodLabel(sorted[0])} – ${periodLabel(sorted[sorted.length - 1])}`;
}

/** Add `offset` months to a YYYYMM period_no. Handles year rollover. */
function addMonths(periodNo: number, offset: number): number {
  const { year, month } = parseYyyymm(periodNo);
  // Convert to 0-indexed months for arithmetic
  const totalMonths = year * 12 + (month - 1) + offset;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return yyyymm(newYear, newMonth);
}

/** Return the current date's YYYYMM period_no. */
function currentPeriodNo(): number {
  const now = new Date();
  return yyyymm(now.getFullYear(), now.getMonth() + 1);
}

/** Return date range { from, to } for a set of YYYYMM period numbers. */
export function periodNosToDateRange(periodNos: number[]): {
  from: Date;
  to: Date;
} {
  const sorted = [...periodNos].sort((a, b) => a - b);
  const first = parseYyyymm(sorted[0]);
  const last = parseYyyymm(sorted[sorted.length - 1]);

  // UTC midnights: these bound `date` columns in SQL. Local-time dates shift a
  // day on a machine east of UTC (Singapore: 1 Aug local = 31 Jul 16:00 UTC).
  const from = new Date(Date.UTC(first.year, first.month - 1, 1));
  // Last day of the last month
  const to = new Date(Date.UTC(last.year, last.month, 0));
  return { from, to };
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ResolvedPeriod {
  periodNos: number[];
  label: string;
  dateFrom: Date;
  dateTo: Date;
  /** Midnight immediately after the period; use with `<` for timestamp columns. */
  dateToExclusive: Date;
}

/**
 * Resolve a classifier period token into concrete period_no values and dates.
 *
 * Supported formats:
 *   "2026-06"        → single month
 *   "June"           → June of the most recent fiscal year
 *   "2026-Q2"        → quarter (3 months)
 *   "last_month"     → the month before current
 *   "this_month"     → current month
 *   "previous_period"→ the period immediately before a reference period
 *   "past_N_months"  → the last N months ending at current
 *   "YYYY"           → full year (12 months)
 *
 * @returns null when periodToken is null/undefined (meaning "no period filter").
 */
export async function resolvePeriod(
  periodToken: string | null | undefined,
  referencePeriodNo?: number
): Promise<ResolvedPeriod | null> {
  if (!periodToken) return null;

  const token = periodToken.trim().toLowerCase();
  let periodNos: number[];

  // ── "YYYY-MM" format ────────────────────────────────────────────────────
  const yymm = token.match(/^(\d{4})-(\d{2})$/);
  if (yymm) {
    const p = yyyymm(parseInt(yymm[1]), parseInt(yymm[2]));
    periodNos = [p];
    return buildResult(periodNos);
  }

  // ── "YYYY-QN" format ───────────────────────────────────────────────────
  const yyq = token.match(/^(\d{4})-q(\d)$/);
  if (yyq) {
    const year = parseInt(yyq[1]);
    const quarter = parseInt(yyq[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    periodNos = [
      yyyymm(year, startMonth),
      yyyymm(year, startMonth + 1),
      yyyymm(year, startMonth + 2),
    ];
    return buildResult(periodNos);
  }

  // ── "YYYY" — full year ─────────────────────────────────────────────────
  const yyOnly = token.match(/^(\d{4})$/);
  if (yyOnly) {
    const year = parseInt(yyOnly[1]);
    periodNos = Array.from({ length: 12 }, (_, i) => yyyymm(year, i + 1));
    return buildResult(periodNos);
  }

  // ── Relative tokens ────────────────────────────────────────────────────
  const now = currentPeriodNo();

  if (token === "this_month") {
    periodNos = [now];
    return buildResult(periodNos);
  }

  if (token === "next_month") {
    periodNos = [addMonths(now, 1)];
    return buildResult(periodNos);
  }

  if (token === "last_month") {
    periodNos = [addMonths(now, -1)];
    return buildResult(periodNos);
  }

  if (token === "previous_period") {
    const ref = referencePeriodNo ?? now;
    periodNos = [addMonths(ref, -1)];
    return buildResult(periodNos);
  }

  // ── "past_N_months" ────────────────────────────────────────────────────
  const pastN = token.match(/^past_(\d+)_months$/);
  if (pastN) {
    const n = parseInt(pastN[1]);
    // Anchor at the last COMPLETED month — the current month is always partial
    // and pbalance data may not be posted yet. Window: (now-n) ... (now-1).
    const lastCompleted = addMonths(now, -1);
    periodNos = Array.from({ length: n }, (_, i) =>
      addMonths(lastCompleted, -(n - 1 - i))
    );
    return buildResult(periodNos);
  }

  // ── Named month (e.g. "june") without year ─────────────────────────────
  const monthIdx = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === token
  );
  if (monthIdx !== -1) {
    // Resolve to the most recent occurrence of this month
    const month = monthIdx + 1;
    const candidateThisYear = yyyymm(new Date().getFullYear(), month);
    const p = candidateThisYear <= now
      ? candidateThisYear
      : yyyymm(new Date().getFullYear() - 1, month);
    periodNos = [p];
    return buildResult(periodNos);
  }

  // ── Fallback: try to find matching fiscal year ─────────────────────────
  const fy = await prisma.fiscal_year.findFirst({
    where: { fiscal_year_name: { contains: periodToken, mode: "insensitive" } },
  });
  if (fy) {
    const startYear = fy.from_date.getFullYear();
    const startMonth = fy.from_date.getMonth() + 1;
    periodNos = Array.from({ length: 12 }, (_, i) =>
      addMonths(yyyymm(startYear, startMonth), i)
    );
    return buildResult(periodNos);
  }

  // Could not resolve — return null so the caller can handle gracefully
  return null;
}

function buildResult(periodNos: number[]): ResolvedPeriod {
  const { from, to } = periodNosToDateRange(periodNos);
  const last = parseYyyymm(Math.max(...periodNos));
  return {
    periodNos,
    label: periodLabels(periodNos),
    dateFrom: from,
    dateTo: to,
    dateToExclusive: new Date(Date.UTC(last.year, last.month, 1)),
  };
}

/** Convert a ResolvedPeriod to the PeriodInfo shape used in result types. */
export function toPeriodInfo(rp: ResolvedPeriod): PeriodInfo {
  return { periodNos: rp.periodNos, label: rp.label };
}

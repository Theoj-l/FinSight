// ---------------------------------------------------------------------------
// performance-service.ts — Executive performance scorecard.
//
// Handles question_type: "performance_summary"
// e.g. "How did we perform in June 2026?", "Give me an executive summary."
//
// Produces a multi-metric financial scorecard with top positive/negative
// drivers and department-level breakdown.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ClassificationResult } from "@/lib/types/classification";
import { resolvePeriod, toPeriodInfo } from "../period-resolver";
import { resolveFilters, type ResolvedFilters } from "../filter-builder";
import { computeGLMetric, querySales, queryOutstanding } from "./metric-service";
import type {
  PerformanceSummaryResult,
  ScorecardItem,
  VarianceComponent,
} from "../types";

// ── Scorecard metrics to compute ────────────────────────────────────────────

const SCORECARD_METRICS = [
  "revenue",
  "cogs",
  "gross_profit",
  "operating_expense",
  "net_profit",
  "gross_margin",
  "net_margin",
] as const;

async function buildScorecard(
  currentPeriodNos: number[],
  previousPeriodNos: number[],
  filters: ResolvedFilters
): Promise<ScorecardItem[]> {
  const items: ScorecardItem[] = [];

  for (const metric of SCORECARD_METRICS) {
    const currentValue = await computeGLMetric(metric, currentPeriodNos, filters);
    const previousValue = await computeGLMetric(metric, previousPeriodNos, filters);
    const change = currentValue - previousValue;
    const changePct = previousValue !== 0 ? (change / previousValue) * 100 : null;

    items.push({ metric, currentValue, previousValue, change, changePct });
  }

  return items;
}

// ── Department performance ──────────────────────────────────────────────────

async function getDepartmentPerformance(
  currentPeriodNos: number[],
  previousPeriodNos: number[]
): Promise<VarianceComponent[]> {
  const periodListCurrent = Prisma.join(currentPeriodNos);
  const periodListPrevious = Prisma.join(previousPeriodNos);

  // Net profit by department for both periods
  const currentRows = await prisma.$queryRaw<{ label: string; value: number }[]>`
    SELECT dept.description AS label,
      SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE -(pb.home_dr - pb.home_cr) END)::float AS value
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    JOIN dept ON pb.dept_no = dept.dept_no
    WHERE at.is_bs_type = false AND pb.period_no IN (${periodListCurrent})
    GROUP BY dept.description
  `;

  const previousRows = await prisma.$queryRaw<{ label: string; value: number }[]>`
    SELECT dept.description AS label,
      SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE -(pb.home_dr - pb.home_cr) END)::float AS value
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    JOIN dept ON pb.dept_no = dept.dept_no
    WHERE at.is_bs_type = false AND pb.period_no IN (${periodListPrevious})
    GROUP BY dept.description
  `;

  const prevMap = new Map(previousRows.map((r) => [r.label, r.value]));

  return currentRows.map((r) => {
    const prev = prevMap.get(r.label) ?? 0;
    const change = r.value - prev;
    return {
      label: r.label,
      currentValue: r.value,
      previousValue: prev,
      change,
      changePct: prev !== 0 ? (change / prev) * 100 : null,
      contributionPct: null,
    };
  }).sort((a, b) => b.change - a.change);
}

// ── Top positive / negative drivers ─────────────────────────────────────────

async function getAccountDrivers(
  currentPeriodNos: number[],
  previousPeriodNos: number[],
  filters: ResolvedFilters
): Promise<{ positive: VarianceComponent[]; negative: VarianceComponent[] }> {
  const deptCondition =
    filters.deptNos?.length
      ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(filters.deptNos)})`
      : Prisma.empty;

  const periodListCurrent = Prisma.join(currentPeriodNos);
  const periodListPrevious = Prisma.join(previousPeriodNos);

  // Revenue and expense by account for current period
  const currentAccounts = await prisma.$queryRaw<
    { acc_no: string; label: string; credit_pos: boolean; value: number }[]
  >`
    SELECT gm.acc_no, gm.description AS label, pf.credit_as_positive AS credit_pos,
      SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE pb.home_dr - pb.home_cr END)::float AS value
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false AND pb.period_no IN (${periodListCurrent}) ${deptCondition}
    GROUP BY gm.acc_no, gm.description, pf.credit_as_positive
  `;

  const previousAccounts = await prisma.$queryRaw<
    { acc_no: string; value: number }[]
  >`
    SELECT gm.acc_no,
      SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE pb.home_dr - pb.home_cr END)::float AS value
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false AND pb.period_no IN (${periodListPrevious}) ${deptCondition}
    GROUP BY gm.acc_no
  `;

  const prevMap = new Map(previousAccounts.map((r) => [r.acc_no, r.value]));

  const components: VarianceComponent[] = currentAccounts.map((r) => {
    const prev = prevMap.get(r.acc_no) ?? 0;
    const change = r.value - prev;
    // For profit impact: revenue increase is positive, expense increase is negative
    const profitImpact = r.credit_pos ? change : -change;
    return {
      label: r.label,
      currentValue: r.value,
      previousValue: prev,
      change: profitImpact,
      changePct: prev !== 0 ? (change / prev) * 100 : null,
      contributionPct: null,
    };
  });

  const sorted = [...components].sort((a, b) => b.change - a.change);
  const positive = sorted.filter((c) => c.change > 0).slice(0, 3);
  const negative = sorted.filter((c) => c.change < 0).slice(-3).reverse();

  return { positive, negative };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════════════

export async function getPerformanceSummary(
  classification: ClassificationResult
): Promise<PerformanceSummaryResult> {
  const currentPeriod = await resolvePeriod(
    classification.period ?? "last_month"
  );
  if (!currentPeriod) throw new Error("Could not resolve period for performance summary.");

  const previousPeriod = await resolvePeriod(
    classification.comparison_period ?? "previous_period",
    currentPeriod.periodNos[0]
  );
  if (!previousPeriod) throw new Error("Could not resolve comparison period.");

  const filters = await resolveFilters(classification);

  const [scorecard, departmentPerformance, { positive: topPositive, negative: topNegative }] =
    await Promise.all([
      buildScorecard(currentPeriod.periodNos, previousPeriod.periodNos, filters),
      getDepartmentPerformance(currentPeriod.periodNos, previousPeriod.periodNos),
      getAccountDrivers(currentPeriod.periodNos, previousPeriod.periodNos, filters),
    ]);

  return {
    questionType: "performance_summary",
    scorecard,
    topPositive,
    topNegative,
    departmentPerformance,
    currentPeriod: toPeriodInfo(currentPeriod),
    previousPeriod: toPeriodInfo(previousPeriod),
    filters: filters.applied,
  };
}

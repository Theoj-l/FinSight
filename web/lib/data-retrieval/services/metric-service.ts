// ---------------------------------------------------------------------------
// metric-service.ts — Core financial metric queries.
//
// Consolidates: metric value, metric comparison, trend, and top N.
// Exports the computeGLMetric helper for reuse by pl-service and
// performance-service.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ClassificationResult } from "@/lib/types/classification";
import type { ResolvedPeriod } from "../period-resolver";
import { resolvePeriod, toPeriodInfo } from "../period-resolver";
import { resolveFilters, type ResolvedFilters } from "../filter-builder";
import type {
  MetricValueResult,
  MetricComparisonResult,
  TrendResult,
  TrendPoint,
  TopNResult,
  TopNItem,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// SHARED GL HELPERS (exported for reuse by other services)
// ═══════════════════════════════════════════════════════════════════════════

const GL_METRICS = new Set([
  "revenue", "cogs", "total_cost", "operating_expense",
  "gross_profit", "net_profit", "gross_margin", "net_margin",
]);

export { GL_METRICS };

/** Build a Prisma.Sql fragment for dept_no filtering. */
export function buildDeptCondition(
  filters: ResolvedFilters,
  alias = "pb"
): Prisma.Sql {
  return filters.deptNos && filters.deptNos.length > 0
    ? Prisma.sql`AND ${Prisma.raw(alias)}.dept_no IN (${Prisma.join(filters.deptNos)})`
    : Prisma.empty;
}

/**
 * Compute a GL-based metric from pbalance for the given periods and filters.
 * Respects credit_as_positive sign convention from pl_format.
 */
export async function computeGLMetric(
  metric: string,
  periodNos: number[],
  filters: ResolvedFilters
): Promise<number> {
  const periodList = Prisma.join(periodNos);
  const deptCondition = buildDeptCondition(filters);

  if (metric === "revenue") {
    return queryGLBySign(periodList, deptCondition, true);
  }
  if (metric === "cogs") {
    return queryGLByCOGS(periodList, deptCondition);
  }
  if (metric === "total_cost") {
    return queryGLBySign(periodList, deptCondition, false);
  }
  if (metric === "operating_expense") {
    const totalExpense = await queryGLBySign(periodList, deptCondition, false);
    const cogs = await queryGLByCOGS(periodList, deptCondition);
    return totalExpense - cogs;
  }
  if (metric === "gross_profit") {
    const revenue = await queryGLBySign(periodList, deptCondition, true);
    const cogs = await queryGLByCOGS(periodList, deptCondition);
    return revenue - cogs;
  }
  if (metric === "net_profit") {
    const revenue = await queryGLBySign(periodList, deptCondition, true);
    const expenses = await queryGLBySign(periodList, deptCondition, false);
    return revenue - expenses;
  }
  if (metric === "gross_margin") {
    const revenue = await queryGLBySign(periodList, deptCondition, true);
    const cogs = await queryGLByCOGS(periodList, deptCondition);
    if (revenue === 0) return 0;
    return ((revenue - cogs) / revenue) * 100;
  }
  if (metric === "net_margin") {
    const revenue = await queryGLBySign(periodList, deptCondition, true);
    const expenses = await queryGLBySign(periodList, deptCondition, false);
    if (revenue === 0) return 0;
    return ((revenue - expenses) / revenue) * 100;
  }
  return 0;
}

/** Query pbalance for all P&L accounts matching a sign convention. */
async function queryGLBySign(
  periodList: Prisma.Sql,
  deptCondition: Prisma.Sql,
  creditAsPositive: boolean
): Promise<number> {
  const rows = await prisma.$queryRaw<{ amount: number }[]>`
    SELECT COALESCE(
      SUM(
        CASE WHEN ${creditAsPositive}
          THEN pb.home_cr - pb.home_dr
          ELSE pb.home_dr - pb.home_cr
        END
      ), 0
    )::float AS amount
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false
      AND pf.credit_as_positive = ${creditAsPositive}
      AND pb.period_no IN (${periodList})
      ${deptCondition}
  `;
  return rows[0]?.amount ?? 0;
}

/** Query pbalance for COGS: the first expense acc_type in pl_format order. */
async function queryGLByCOGS(
  periodList: Prisma.Sql,
  deptCondition: Prisma.Sql
): Promise<number> {
  const cogsType = await prisma.pl_format.findFirst({
    where: { credit_as_positive: false, acc_type: { not: null }, row_type: "A" },
    orderBy: { seq: "asc" },
    select: { acc_type: true },
  });
  if (!cogsType?.acc_type) return 0;

  const rows = await prisma.$queryRaw<{ amount: number }[]>`
    SELECT COALESCE(SUM(pb.home_dr - pb.home_cr), 0)::float AS amount
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    WHERE gm.acc_type = ${cogsType.acc_type}
      AND pb.period_no IN (${periodList})
      ${deptCondition}
  `;
  return rows[0]?.amount ?? 0;
}

/** Query sales from iv table. */
export async function querySales(
  period: ResolvedPeriod | null,
  filters: ResolvedFilters
): Promise<number> {
  const conditions: Prisma.Sql[] = [Prisma.sql`cancelled = false`];
  if (period) {
    conditions.push(
      Prisma.sql`doc_date >= ${period.dateFrom} AND doc_date <= ${period.dateTo}`
    );
  }
  if (filters.debtorCodes?.length) {
    conditions.push(Prisma.sql`debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  }
  if (filters.salesAgents?.length) {
    conditions.push(Prisma.sql`sales_agent IN (${Prisma.join(filters.salesAgents)})`);
  }
  if (filters.branchCodes?.length) {
    conditions.push(Prisma.sql`branch_code IN (${Prisma.join(filters.branchCodes)})`);
  }
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const rows = await prisma.$queryRaw<{ amount: number }[]>`
    SELECT COALESCE(SUM(local_ex_tax), 0)::float AS amount FROM iv ${whereClause}
  `;
  return rows[0]?.amount ?? 0;
}

/** Query outstanding AR. */
export async function queryOutstanding(filters: ResolvedFilters): Promise<number> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`cancelled = false`,
    Prisma.sql`outstanding > 0`,
  ];
  if (filters.debtorCodes?.length) {
    conditions.push(Prisma.sql`debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  }
  if (filters.salesAgents?.length) {
    conditions.push(Prisma.sql`sales_agent IN (${Prisma.join(filters.salesAgents)})`);
  }
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const rows = await prisma.$queryRaw<{ amount: number }[]>`
    SELECT COALESCE(SUM(outstanding), 0)::float AS amount FROM ar_invoice ${whereClause}
  `;
  return rows[0]?.amount ?? 0;
}

/** Query a P&L budget metric from budget_pbalance. */
async function queryBudget(
  metric: string,
  periodNos: number[],
  filters: ResolvedFilters
): Promise<number> {
  const periodList = Prisma.join(periodNos);
  const deptCondition =
    filters.deptNos?.length
      ? Prisma.sql`AND bp.dept_no IN (${Prisma.join(filters.deptNos)})`
      : Prisma.empty;

  const cogsType = await prisma.pl_format.findFirst({
    where: { credit_as_positive: false, acc_type: { not: null }, row_type: "A" },
    orderBy: { seq: "asc" },
    select: { acc_type: true },
  });
  const cogsAccType = cogsType?.acc_type ?? "__NONE__";

  const rows = await prisma.$queryRaw<
    { revenue: number; expenses: number; cogs: number }[]
  >`
    SELECT
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = true THEN bp.amount ELSE 0 END), 0)::float AS revenue,
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = false THEN bp.amount ELSE 0 END), 0)::float AS expenses,
      COALESCE(SUM(CASE WHEN gm.acc_type = ${cogsAccType} THEN bp.amount ELSE 0 END), 0)::float AS cogs
    FROM budget_pbalance bp
    JOIN gl_mast gm ON bp.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false
      AND bp.period_no IN (${periodList})
      ${deptCondition}
  `;
  const row = rows[0] ?? { revenue: 0, expenses: 0, cogs: 0 };

  switch (metric) {
    case "revenue": return row.revenue;
    case "cogs": return row.cogs;
    case "total_cost": return row.expenses;
    case "operating_expense": return row.expenses - row.cogs;
    case "gross_profit": return row.revenue - row.cogs;
    case "net_profit": return row.revenue - row.expenses;
    case "gross_margin":
      return row.revenue !== 0
        ? ((row.revenue - row.cogs) / row.revenue) * 100
        : 0;
    case "net_margin":
      return row.revenue !== 0
        ? ((row.revenue - row.expenses) / row.revenue) * 100
        : 0;
    default:
      throw new Error(`Metric "${metric}" is not supported for budget queries.`);
  }
}

function isBudgetRequest(classification: ClassificationResult): boolean {
  return classification.reason.toLowerCase().includes("budget");
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. getMetricValue — question_type: "metric_value"
// ═══════════════════════════════════════════════════════════════════════════

export async function getMetricValue(
  classification: ClassificationResult
): Promise<MetricValueResult> {
  const metric = classification.metric ?? "revenue";
  const period = await resolvePeriod(classification.period);
  const filters = await resolveFilters(classification);

  const isBudget = isBudgetRequest(classification);

  let value: number;
  let source: "actual" | "budget" = "actual";

  if (isBudget && GL_METRICS.has(metric) && period) {
    value = await queryBudget(metric, period.periodNos, filters);
    source = "budget";
  } else if (GL_METRICS.has(metric)) {
    if (!period) {
      throw new Error(`Period is required for GL metric "${metric}". Please specify a time period.`);
    }
    value = await computeGLMetric(metric, period.periodNos, filters);
  } else if (metric === "sales") {
    value = await querySales(period, filters);
  } else if (metric === "outstanding_amount") {
    value = await queryOutstanding(filters);
  } else {
    throw new Error(`Unsupported metric: "${metric}"`);
  }

  return {
    questionType: "metric_value",
    metric,
    value,
    source,
    period: period ? toPeriodInfo(period) : null,
    filters: filters.applied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. getMetricComparison — question_type: "metric_comparison"
// ═══════════════════════════════════════════════════════════════════════════

export async function getMetricComparison(
  classification: ClassificationResult
): Promise<MetricComparisonResult> {
  const metric = classification.metric ?? "revenue";

  const currentPeriod = await resolvePeriod(classification.period);
  if (!currentPeriod) {
    throw new Error("A time period is required for metric comparison.");
  }

  const filters = await resolveFilters(classification);

  if (isBudgetRequest(classification)) {
    if (!GL_METRICS.has(metric)) {
      throw new Error(
        `Metric "${metric}" is not supported for actual-versus-budget comparison.`
      );
    }

    const actualValue = await computeGLMetric(
      metric,
      currentPeriod.periodNos,
      filters
    );
    const budgetValue = await queryBudget(
      metric,
      currentPeriod.periodNos,
      filters
    );
    const variance = actualValue - budgetValue;

    return {
      questionType: "metric_comparison",
      metric,
      comparisonType: "actual_vs_budget",
      current: {
        value: actualValue,
        period: toPeriodInfo(currentPeriod),
        source: "actual",
      },
      previous: {
        value: budgetValue,
        period: toPeriodInfo(currentPeriod),
        source: "budget",
      },
      change: variance,
      changePct: budgetValue !== 0 ? (variance / budgetValue) * 100 : null,
      filters: filters.applied,
    };
  }

  const comparisonPeriod = await resolvePeriod(
    classification.comparison_period ?? "previous_period",
    currentPeriod.periodNos[0]
  );
  if (!comparisonPeriod) {
    throw new Error("Could not resolve the comparison period.");
  }

  let currentValue: number;
  let previousValue: number;

  if (GL_METRICS.has(metric)) {
    currentValue = await computeGLMetric(metric, currentPeriod.periodNos, filters);
    previousValue = await computeGLMetric(metric, comparisonPeriod.periodNos, filters);
  } else if (metric === "sales") {
    currentValue = await querySales(currentPeriod, filters);
    previousValue = await querySales(comparisonPeriod, filters);
  } else {
    throw new Error(`Metric "${metric}" is not supported for period comparison.`);
  }

  const change = currentValue - previousValue;
  const changePct = previousValue !== 0 ? (change / previousValue) * 100 : null;

  return {
    questionType: "metric_comparison",
    metric,
    comparisonType: "period",
    current: {
      value: currentValue,
      period: toPeriodInfo(currentPeriod),
      source: "actual",
    },
    previous: {
      value: previousValue,
      period: toPeriodInfo(comparisonPeriod),
      source: "actual",
    },
    change,
    changePct,
    filters: filters.applied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. getMetricTrend — question_type: "trend"
// ═══════════════════════════════════════════════════════════════════════════

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatPeriodLabel(periodNo: number): string {
  const year = Math.floor(periodNo / 100);
  const month = periodNo % 100;
  return `${MONTH_SHORT[month - 1] ?? "?"} ${year}`;
}

interface GLPeriodRow {
  period_no: number;
  revenue: number;
  expenses: number;
  cogs: number;
}

async function queryGLTrend(
  periodNos: number[],
  deptNos: string[] | null
): Promise<GLPeriodRow[]> {
  const periodList = Prisma.join(periodNos);
  const deptCondition =
    deptNos && deptNos.length > 0
      ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(deptNos)})`
      : Prisma.empty;

  const cogsType = await prisma.pl_format.findFirst({
    where: { credit_as_positive: false, acc_type: { not: null }, row_type: "A" },
    orderBy: { seq: "asc" },
    select: { acc_type: true },
  });
  const cogsAccType = cogsType?.acc_type ?? "__NONE__";

  return prisma.$queryRaw<GLPeriodRow[]>`
    SELECT
      pb.period_no,
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = true THEN (pb.home_cr - pb.home_dr) ELSE 0 END), 0)::float AS revenue,
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = false THEN (pb.home_dr - pb.home_cr) ELSE 0 END), 0)::float AS expenses,
      COALESCE(SUM(CASE WHEN gm.acc_type = ${cogsAccType} THEN (pb.home_dr - pb.home_cr) ELSE 0 END), 0)::float AS cogs
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false
      AND pb.period_no IN (${periodList})
      ${deptCondition}
    GROUP BY pb.period_no
    ORDER BY pb.period_no ASC
  `;
}

function deriveGLMetric(row: GLPeriodRow, metric: string): number {
  switch (metric) {
    case "revenue":           return row.revenue;
    case "cogs":              return row.cogs;
    case "operating_expense": return row.expenses - row.cogs;
    case "total_cost":        return row.expenses;
    case "gross_profit":      return row.revenue - row.cogs;
    case "net_profit":        return row.revenue - row.expenses;
    case "gross_margin":      return row.revenue !== 0 ? ((row.revenue - row.cogs) / row.revenue) * 100 : 0;
    case "net_margin":        return row.revenue !== 0 ? ((row.revenue - row.expenses) / row.revenue) * 100 : 0;
    default:                  return 0;
  }
}

export async function getMetricTrend(
  classification: ClassificationResult
): Promise<TrendResult> {
  const metric = classification.metric ?? "revenue";
  const filters = await resolveFilters(classification);
  const period = await resolvePeriod(classification.period ?? "past_12_months");
  if (!period) throw new Error("Could not resolve period for trend analysis.");

  let points: TrendPoint[];

  if (GL_METRICS.has(metric)) {
    const glRows = await queryGLTrend(period.periodNos, filters.deptNos);
    points = glRows.map((row) => ({
      period: formatPeriodLabel(row.period_no),
      periodNo: row.period_no,
      value: deriveGLMetric(row, metric),
    }));
  } else if (metric === "sales") {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`cancelled = false`,
      Prisma.sql`doc_date >= ${period.dateFrom} AND doc_date <= ${period.dateTo}`,
    ];
    if (filters.debtorCodes?.length) {
      conditions.push(Prisma.sql`debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
    }
    if (filters.salesAgents?.length) {
      conditions.push(Prisma.sql`sales_agent IN (${Prisma.join(filters.salesAgents)})`);
    }
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
    const rows = await prisma.$queryRaw<{ period_no: number; value: number }[]>`
      SELECT (EXTRACT(YEAR FROM doc_date)::int * 100 + EXTRACT(MONTH FROM doc_date)::int) AS period_no,
             SUM(local_ex_tax)::float AS value
      FROM iv ${where}
      GROUP BY period_no ORDER BY period_no ASC
    `;
    points = rows.map((r) => ({ period: formatPeriodLabel(r.period_no), periodNo: r.period_no, value: r.value }));
  } else if (metric === "outstanding_amount") {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`cancelled = false`,
      Prisma.sql`doc_date >= ${period.dateFrom} AND doc_date <= ${period.dateTo}`,
    ];
    if (filters.debtorCodes?.length) {
      conditions.push(Prisma.sql`debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
    }
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
    const rows = await prisma.$queryRaw<{ period_no: number; value: number }[]>`
      SELECT (EXTRACT(YEAR FROM doc_date)::int * 100 + EXTRACT(MONTH FROM doc_date)::int) AS period_no,
             SUM(outstanding)::float AS value
      FROM ar_invoice ${where}
      GROUP BY period_no ORDER BY period_no ASC
    `;
    points = rows.map((r) => ({ period: formatPeriodLabel(r.period_no), periodNo: r.period_no, value: r.value }));
  } else {
    throw new Error(`Unsupported metric for trend: "${metric}"`);
  }

  return { questionType: "trend", metric, points, filters: filters.applied };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. getTopN — question_type: "top_n"
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_TOP_N = 10;

export async function getTopN(
  classification: ClassificationResult
): Promise<TopNResult> {
  const n = classification.top_n ?? DEFAULT_TOP_N;
  const dimension = classification.dimensions?.[0] ?? "customer";
  const metric = classification.metric ?? "sales";

  const period = await resolvePeriod(classification.period);
  const filters = await resolveFilters(classification);

  let items: TopNItem[];

  switch (dimension) {
    case "customer":
      items = await topByCustomer(metric, period, filters, n);
      break;
    case "salesperson":
      items = await topBySalesperson(period, filters, n);
      break;
    case "product_category":
      items = await topByProductCategory(period, filters, n);
      break;
    case "department":
    case "business_unit":
      items = await topByDepartment(metric, period, filters, n);
      break;
    case "account_name":
      items = await topByAccount(period, filters, n);
      break;
    case "account_group":
      items = await topByAccountGroup(period, filters, n);
      break;
    default:
      items = await topByCustomer(metric, period, filters, n);
  }

  return {
    questionType: "top_n",
    metric, dimension, items, n,
    period: period ? toPeriodInfo(period) : null,
    filters: filters.applied,
  };
}

// ── Top N helpers ───────────────────────────────────────────────────────────

type RP = Awaited<ReturnType<typeof resolvePeriod>>;
type RF = Awaited<ReturnType<typeof resolveFilters>>;

async function topByCustomer(metric: string, period: RP, filters: RF, n: number): Promise<TopNItem[]> {
  if (metric === "outstanding_amount") {
    const conds: Prisma.Sql[] = [Prisma.sql`ar.cancelled = false`, Prisma.sql`ar.outstanding > 0`];
    if (filters.debtorCodes?.length) conds.push(Prisma.sql`ar.debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
    const w = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
    return prisma.$queryRaw<TopNItem[]>`SELECT d.company_name AS label, SUM(ar.outstanding)::float AS value FROM ar_invoice ar JOIN debtor d ON ar.debtor_code = d.acc_no ${w} GROUP BY d.company_name ORDER BY value DESC LIMIT ${n}`;
  }
  const conds: Prisma.Sql[] = [Prisma.sql`iv.cancelled = false`];
  if (period) conds.push(Prisma.sql`iv.doc_date >= ${period.dateFrom} AND iv.doc_date <= ${period.dateTo}`);
  if (filters.debtorCodes?.length) conds.push(Prisma.sql`iv.debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  if (filters.salesAgents?.length) conds.push(Prisma.sql`iv.sales_agent IN (${Prisma.join(filters.salesAgents)})`);
  const w = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
  return prisma.$queryRaw<TopNItem[]>`SELECT d.company_name AS label, SUM(iv.local_ex_tax)::float AS value FROM iv JOIN debtor d ON iv.debtor_code = d.acc_no ${w} GROUP BY d.company_name ORDER BY value DESC LIMIT ${n}`;
}

async function topBySalesperson(period: RP, filters: RF, n: number): Promise<TopNItem[]> {
  const conds: Prisma.Sql[] = [Prisma.sql`iv.cancelled = false`];
  if (period) conds.push(Prisma.sql`iv.doc_date >= ${period.dateFrom} AND iv.doc_date <= ${period.dateTo}`);
  if (filters.salesAgents?.length) conds.push(Prisma.sql`iv.sales_agent IN (${Prisma.join(filters.salesAgents)})`);
  const w = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
  return prisma.$queryRaw<TopNItem[]>`SELECT sa.description AS label, SUM(iv.local_ex_tax)::float AS value FROM iv JOIN sales_agent sa ON iv.sales_agent = sa.sales_agent ${w} GROUP BY sa.description ORDER BY value DESC LIMIT ${n}`;
}

async function topByProductCategory(period: RP, filters: RF, n: number): Promise<TopNItem[]> {
  const conds: Prisma.Sql[] = [Prisma.sql`iv.cancelled = false`];
  if (period) conds.push(Prisma.sql`iv.doc_date >= ${period.dateFrom} AND iv.doc_date <= ${period.dateTo}`);
  if (filters.itemGroups?.length) conds.push(Prisma.sql`i.item_group IN (${Prisma.join(filters.itemGroups)})`);
  if (filters.deptNos?.length) conds.push(Prisma.sql`dtl.dept_no IN (${Prisma.join(filters.deptNos)})`);
  const w = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;
  return prisma.$queryRaw<TopNItem[]>`SELECT ig.description AS label, SUM(dtl.local_sub_total)::float AS value FROM iv_dtl dtl JOIN iv ON dtl.doc_key = iv.doc_key JOIN item i ON dtl.item_code = i.item_code JOIN item_group ig ON i.item_group = ig.item_group ${w} GROUP BY ig.description ORDER BY value DESC LIMIT ${n}`;
}

async function topByDepartment(metric: string, period: RP, filters: RF, n: number): Promise<TopNItem[]> {
  if (!period) throw new Error("Period is required for department GL analysis.");
  const periodList = Prisma.join(period.periodNos);
  const isRevenue = metric === "revenue" || metric === "sales";
  return prisma.$queryRaw<TopNItem[]>`
    SELECT dept.description AS label,
      SUM(CASE WHEN ${isRevenue} THEN pb.home_cr - pb.home_dr ELSE pb.home_dr - pb.home_cr END)::float AS value
    FROM pbalance pb JOIN gl_mast gm ON pb.acc_no = gm.acc_no JOIN acc_type at ON gm.acc_type = at.acc_type JOIN pl_format pf ON pf.acc_type = at.acc_type JOIN dept ON pb.dept_no = dept.dept_no
    WHERE at.is_bs_type = false AND pf.credit_as_positive = ${isRevenue} AND pb.period_no IN (${periodList})
    GROUP BY dept.description ORDER BY value DESC LIMIT ${n}
  `;
}

async function topByAccount(period: RP, filters: RF, n: number): Promise<TopNItem[]> {
  if (!period) throw new Error("Period is required for account-level analysis.");
  const periodList = Prisma.join(period.periodNos);
  const deptCond = filters.deptNos?.length ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(filters.deptNos)})` : Prisma.empty;
  return prisma.$queryRaw<TopNItem[]>`
    SELECT gm.description AS label, SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE pb.home_dr - pb.home_cr END)::float AS value
    FROM pbalance pb JOIN gl_mast gm ON pb.acc_no = gm.acc_no JOIN acc_type at ON gm.acc_type = at.acc_type JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false AND pb.period_no IN (${periodList}) ${deptCond}
    GROUP BY gm.description HAVING SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE pb.home_dr - pb.home_cr END) > 0
    ORDER BY value DESC LIMIT ${n}
  `;
}

async function topByAccountGroup(period: RP, filters: RF, n: number): Promise<TopNItem[]> {
  if (!period) throw new Error("Period is required for account group analysis.");
  const periodList = Prisma.join(period.periodNos);
  const deptCond = filters.deptNos?.length ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(filters.deptNos)})` : Prisma.empty;
  return prisma.$queryRaw<TopNItem[]>`
    SELECT at.description AS label, SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE pb.home_dr - pb.home_cr END)::float AS value
    FROM pbalance pb JOIN gl_mast gm ON pb.acc_no = gm.acc_no JOIN acc_type at ON gm.acc_type = at.acc_type JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false AND pb.period_no IN (${periodList}) ${deptCond}
    GROUP BY at.description ORDER BY value DESC LIMIT ${n}
  `;
}

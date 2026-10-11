// ---------------------------------------------------------------------------
// pl-service.ts — Profit & Loss queries.
//
// Handles: P&L summary, variance breakdown (6 types), and margin analysis.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ClassificationResult } from "@/lib/types/classification";
import { resolvePeriod, toPeriodInfo, periodNosToDateRange } from "../period-resolver";
import { resolveFilters, type ResolvedFilters } from "../filter-builder";
import { computeGLMetric, querySales, queryOutstanding } from "./metric-service";
import type {
  PLSummaryResult,
  PLRow,
  VarianceBreakdownResult,
  VarianceComponent,
  TransactionDriver,
  MarginAnalysisResult,
  DepartmentMargin,
  ProductMargin,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. getPLSummary — question_type: "pl_summary"
// ═══════════════════════════════════════════════════════════════════════════

export async function getPLSummary(
  classification: ClassificationResult
): Promise<PLSummaryResult> {
  const period = await resolvePeriod(classification.period ?? "last_month");
  if (!period) throw new Error("Could not resolve period for P&L summary.");

  const filters = await resolveFilters(classification);
  const periodList = Prisma.join(period.periodNos);
  const deptCondition =
    filters.deptNos?.length
      ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(filters.deptNos)})`
      : Prisma.empty;

  // Get all pl_format rows
  const plFormats = await prisma.pl_format.findMany({ orderBy: { seq: "asc" } });

  // Get amounts by acc_type
  const amountRows = await prisma.$queryRaw<
    { acc_type: string; amount: number; profit_impact: number }[]
  >`
    SELECT gm.acc_type,
      SUM(CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE pb.home_dr - pb.home_cr END)::float AS amount,
      SUM(pb.home_cr - pb.home_dr)::float AS profit_impact
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false AND pb.period_no IN (${periodList}) ${deptCondition}
    GROUP BY gm.acc_type
  `;

  const amountByAccType = new Map<
    string,
    { amount: number; profitImpact: number }
  >();
  for (const row of amountRows) {
    amountByAccType.set(row.acc_type, {
      amount: row.amount ?? 0,
      profitImpact: row.profit_impact ?? 0,
    });
  }

  // Build rows
  const rows: PLRow[] = [];
  // Track presentation subtotals separately from cumulative accounting profit.
  let runningSubtotal = 0;
  let runningProfit = 0;

  for (const fmt of plFormats) {
    if (fmt.row_type === "A" && fmt.acc_type) {
      const values = amountByAccType.get(fmt.acc_type);
      const amount = values?.amount ?? 0;
      runningSubtotal += amount;
      runningProfit += values?.profitImpact ?? 0;
      rows.push({ seq: fmt.seq, label: fmt.description ?? "", rowType: "account", amount });
    } else if (fmt.row_type === "S" || fmt.row_type === "T") {
      const label = fmt.description ?? "";
      const isProfitLine = /\bprofit\b/i.test(label);

      rows.push({
        seq: fmt.seq,
        label,
        rowType: fmt.row_type === "T" ? "total" : "subtotal",
        // Section totals (for example, Total Revenue) use only the current
        // section. Profit lines are cumulative and include the accounting
        // impact of every account above them: credits increase profit and
        // debits reduce it.
        amount: fmt.row_type === "T" || isProfitLine ? runningProfit : runningSubtotal,
      });
      if (fmt.row_type === "S") runningSubtotal = 0;
    } else {
      rows.push({ seq: fmt.seq, label: fmt.description ?? "", rowType: "heading", amount: 0 });
    }
  }

  return {
    questionType: "pl_summary",
    rows,
    period: toPeriodInfo(period),
    filters: filters.applied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. getVarianceBreakdown — 6 question types
// ═══════════════════════════════════════════════════════════════════════════

type VarianceQuestionType =
  | "revenue_variance" | "cost_variance" | "profit_variance"
  | "sales_variance" | "payroll_variance" | "ar_variance";

export async function getVarianceBreakdown(
  classification: ClassificationResult
): Promise<VarianceBreakdownResult> {
  const qType = classification.question_type as VarianceQuestionType;

  // Resolve periods
  const currentPeriod = await resolvePeriod(classification.period ?? "last_month");
  if (!currentPeriod) throw new Error("Could not resolve current period.");
  const previousPeriod = await resolvePeriod(
    classification.comparison_period ?? "previous_period",
    currentPeriod.periodNos[0]
  );
  if (!previousPeriod) throw new Error("Could not resolve comparison period.");

  const filters = await resolveFilters(classification);

  // Route to the appropriate variance logic
  switch (qType) {
    case "revenue_variance":
      return buildGLVariance(qType, "revenue", true, null, currentPeriod, previousPeriod, filters);
    case "cost_variance":
      return buildGLVariance(
        qType,
        classification.metric === "operating_expense" ? "operating_expense" : "total_cost",
        false,
        null,
        currentPeriod,
        previousPeriod,
        filters
      );
    case "profit_variance":
      return buildProfitVariance(currentPeriod, previousPeriod, filters);
    case "sales_variance":
      return buildSalesVariance(
        currentPeriod,
        previousPeriod,
        filters,
        classification.dimensions[0] ?? "customer"
      );
    case "payroll_variance":
      return buildGLVariance(qType, "payroll", false, ["6100", "6110"], currentPeriod, previousPeriod, filters);
    case "ar_variance":
      return buildARVariance(currentPeriod, previousPeriod, filters);
    default:
      throw new Error(`Unsupported variance type: ${qType}`);
  }
}

// ── GL-based variance (revenue, cost, payroll) ──────────────────────────────

type RP = Awaited<ReturnType<typeof resolvePeriod>> & {};

async function buildGLVariance(
  qType: VarianceQuestionType,
  metric: string,
  creditAsPositive: boolean,
  accNos: string[] | null,
  currentPeriod: RP,
  previousPeriod: RP,
  filters: ResolvedFilters
): Promise<VarianceBreakdownResult> {
  const curPeriods = Prisma.join(currentPeriod.periodNos);
  const prevPeriods = Prisma.join(previousPeriod.periodNos);
  const deptCond = filters.deptNos?.length
    ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(filters.deptNos)})`
    : Prisma.empty;

  // Account filter: either specific acc_nos or by credit_as_positive
  const accCondition = accNos
    ? Prisma.sql`AND gm.acc_no IN (${Prisma.join(accNos)})`
    : metric === "operating_expense"
      ? Prisma.sql`AND gm.acc_type = 'EX'`
      : Prisma.sql`AND pf.credit_as_positive = ${creditAsPositive}`;

  const signExpr = creditAsPositive
    ? Prisma.sql`pb.home_cr - pb.home_dr`
    : Prisma.sql`pb.home_dr - pb.home_cr`;

  // Compute totals
  let totalCurrent: number;
  let totalPrevious: number;

  if (metric === "payroll") {
    // Sum staff cost accounts
    totalCurrent = await queryGLForAccounts(accNos!, currentPeriod.periodNos, filters);
    totalPrevious = await queryGLForAccounts(accNos!, previousPeriod.periodNos, filters);
  } else {
    totalCurrent = await computeGLMetric(metric, currentPeriod.periodNos, filters);
    totalPrevious = await computeGLMetric(metric, previousPeriod.periodNos, filters);
  }

  const totalChange = totalCurrent - totalPrevious;
  const totalChangePct = totalPrevious !== 0 ? (totalChange / totalPrevious) * 100 : null;
  const changeExpr = Prisma.sql`
    COALESCE(SUM(CASE WHEN pb.period_no IN (${curPeriods}) THEN ${signExpr} ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN pb.period_no IN (${prevPeriods}) THEN ${signExpr} ELSE 0 END), 0)
  `;
  // For operating-expense driver questions, return accounts contributing in
  // the same direction as the overall movement. This matches "contributed
  // most to the increase/decrease" rather than mixing in offsets.
  const categoryDirection = metric === "operating_expense"
    ? totalChange >= 0
      ? Prisma.sql`AND (${changeExpr}) > 0`
      : Prisma.sql`AND (${changeExpr}) < 0`
    : Prisma.empty;
  const categoryOrder = metric === "operating_expense"
    ? totalChange >= 0
      ? Prisma.sql`${changeExpr} DESC`
      : Prisma.sql`${changeExpr} ASC`
    : Prisma.sql`ABS(${changeExpr}) DESC`;

  // By category (account-level breakdown)
  const byCategory = await prisma.$queryRaw<
    { label: string; acc_no: string; current_val: number; previous_val: number }[]
  >`
    SELECT
      gm.description AS label,
      gm.acc_no,
      COALESCE(SUM(CASE WHEN pb.period_no IN (${curPeriods}) THEN ${signExpr} ELSE 0 END), 0)::float AS current_val,
      COALESCE(SUM(CASE WHEN pb.period_no IN (${prevPeriods}) THEN ${signExpr} ELSE 0 END), 0)::float AS previous_val
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    WHERE at.is_bs_type = false ${accCondition} ${deptCond}
      AND (pb.period_no IN (${curPeriods}) OR pb.period_no IN (${prevPeriods}))
    GROUP BY gm.acc_no, gm.description
    HAVING ABS(COALESCE(SUM(CASE WHEN pb.period_no IN (${curPeriods}) THEN ${signExpr} ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN pb.period_no IN (${prevPeriods}) THEN ${signExpr} ELSE 0 END), 0)) > 0
      ${categoryDirection}
    ORDER BY ${categoryOrder}
    LIMIT 10
  `;

  const categoryComponents = mapToVarianceComponents(byCategory, totalChange);

  // By department
  const byDepartment = await prisma.$queryRaw<
    { label: string; current_val: number; previous_val: number }[]
  >`
    SELECT
      dept.description AS label,
      COALESCE(SUM(CASE WHEN pb.period_no IN (${curPeriods}) THEN ${signExpr} ELSE 0 END), 0)::float AS current_val,
      COALESCE(SUM(CASE WHEN pb.period_no IN (${prevPeriods}) THEN ${signExpr} ELSE 0 END), 0)::float AS previous_val
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    JOIN dept ON pb.dept_no = dept.dept_no
    WHERE at.is_bs_type = false ${accCondition}
      AND (pb.period_no IN (${curPeriods}) OR pb.period_no IN (${prevPeriods}))
    GROUP BY dept.description
    ORDER BY ABS(COALESCE(SUM(CASE WHEN pb.period_no IN (${curPeriods}) THEN ${signExpr} ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN pb.period_no IN (${prevPeriods}) THEN ${signExpr} ELSE 0 END), 0)) DESC
  `;

  const deptComponents = mapToVarianceComponents(byDepartment, totalChange);

  // Transaction drill-down: top 5 gl_dtl entries for the largest-change account
  const topDriverTransactions = categoryComponents.length > 0
    ? await drillDownGLDtl(
        (byCategory[0] as { acc_no: string }).acc_no,
        currentPeriod.dateFrom,
        currentPeriod.dateTo
      )
    : [];

  return {
    questionType: qType,
    metric,
    totalCurrent,
    totalPrevious,
    totalChange,
    totalChangePct,
    byCategory: categoryComponents,
    byDepartment: deptComponents,
    topDriverTransactions,
    currentPeriod: toPeriodInfo(currentPeriod),
    previousPeriod: toPeriodInfo(previousPeriod),
    filters: filters.applied,
  };
}

// ── Profit variance (P&L waterfall) ─────────────────────────────────────────

async function buildProfitVariance(
  currentPeriod: RP,
  previousPeriod: RP,
  filters: ResolvedFilters
): Promise<VarianceBreakdownResult> {
  const curNos = currentPeriod.periodNos;
  const prevNos = previousPeriod.periodNos;

  const [curRev, prevRev] = await Promise.all([
    computeGLMetric("revenue", curNos, filters),
    computeGLMetric("revenue", prevNos, filters),
  ]);
  const [curCogs, prevCogs] = await Promise.all([
    computeGLMetric("cogs", curNos, filters),
    computeGLMetric("cogs", prevNos, filters),
  ]);
  const [curOpex, prevOpex] = await Promise.all([
    computeGLMetric("operating_expense", curNos, filters),
    computeGLMetric("operating_expense", prevNos, filters),
  ]);

  const curNP = curRev - curCogs - curOpex;
  const prevNP = prevRev - prevCogs - prevOpex;
  const totalChange = curNP - prevNP;
  const totalChangePct = prevNP !== 0 ? (totalChange / prevNP) * 100 : null;

  const revChange = curRev - prevRev;
  const cogsChange = curCogs - prevCogs;
  const opexChange = curOpex - prevOpex;

  const byCategory: VarianceComponent[] = [
    makeComponent("Revenue", curRev, prevRev, totalChange),
    makeComponent("Cost of Sales", curCogs, prevCogs, totalChange),
    makeComponent("Operating Expenses", curOpex, prevOpex, totalChange),
  ];

  // Department breakdown of net profit
  const curPeriods = Prisma.join(curNos);
  const prevPeriods = Prisma.join(prevNos);
  const deptCond = filters.deptNos?.length
    ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(filters.deptNos)})`
    : Prisma.empty;

  const deptRows = await prisma.$queryRaw<
    { label: string; current_val: number; previous_val: number }[]
  >`
    SELECT dept.description AS label,
      COALESCE(SUM(CASE WHEN pb.period_no IN (${curPeriods}) THEN
        CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE -(pb.home_dr - pb.home_cr) END
      ELSE 0 END), 0)::float AS current_val,
      COALESCE(SUM(CASE WHEN pb.period_no IN (${prevPeriods}) THEN
        CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE -(pb.home_dr - pb.home_cr) END
      ELSE 0 END), 0)::float AS previous_val
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    JOIN dept ON pb.dept_no = dept.dept_no
    WHERE at.is_bs_type = false
      AND (pb.period_no IN (${curPeriods}) OR pb.period_no IN (${prevPeriods}))
      ${deptCond}
    GROUP BY dept.description
    ORDER BY ABS(COALESCE(SUM(CASE WHEN pb.period_no IN (${curPeriods}) THEN
      CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE -(pb.home_dr - pb.home_cr) END
    ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN pb.period_no IN (${prevPeriods}) THEN
      CASE WHEN pf.credit_as_positive THEN pb.home_cr - pb.home_dr ELSE -(pb.home_dr - pb.home_cr) END
    ELSE 0 END), 0)) DESC
  `;

  const byDepartment = mapToVarianceComponents(deptRows, totalChange);

  return {
    questionType: "profit_variance",
    metric: "net_profit",
    totalCurrent: curNP,
    totalPrevious: prevNP,
    totalChange,
    totalChangePct,
    byCategory,
    byDepartment,
    topDriverTransactions: [],
    currentPeriod: toPeriodInfo(currentPeriod),
    previousPeriod: toPeriodInfo(previousPeriod),
    filters: filters.applied,
  };
}

// ── Sales variance ──────────────────────────────────────────────────────────

async function buildSalesVariance(
  currentPeriod: RP,
  previousPeriod: RP,
  filters: ResolvedFilters,
  dimension: string
): Promise<VarianceBreakdownResult> {
  const totalCurrent = await querySales(currentPeriod, filters);
  const totalPrevious = await querySales(previousPeriod, filters);
  const totalChange = totalCurrent - totalPrevious;
  const totalChangePct = totalPrevious !== 0 ? (totalChange / totalPrevious) * 100 : null;

  // By customer
  const filterConds: Prisma.Sql[] = [Prisma.sql`iv.cancelled = false`];
  if (filters.debtorCodes?.length) {
    filterConds.push(Prisma.sql`iv.debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  }
  if (filters.salesAgents?.length) {
    filterConds.push(Prisma.sql`iv.sales_agent IN (${Prisma.join(filters.salesAgents)})`);
  }
  const extraWhere = filterConds.length > 1
    ? Prisma.sql`AND ${Prisma.join(filterConds.slice(1), " AND ")}`
    : Prisma.empty;

  let varianceRows: { label: string; current_val: number; previous_val: number }[];

  if (dimension === "product" || dimension === "product_category") {
    const labelExpression = dimension === "product"
      ? Prisma.sql`COALESCE(i.description, dtl.description, dtl.item_code, 'Unknown product')`
      : Prisma.sql`COALESCE(ig.description, 'Uncategorised')`;
    const categoryJoin = dimension === "product_category"
      ? Prisma.sql`LEFT JOIN item_group ig ON i.item_group = ig.item_group`
      : Prisma.empty;
    const itemGroupCondition = filters.itemGroups?.length
      ? Prisma.sql`AND i.item_group IN (${Prisma.join(filters.itemGroups)})`
      : Prisma.empty;

    varianceRows = await prisma.$queryRaw<
      { label: string; current_val: number; previous_val: number }[]
    >`
      WITH product_sales AS (
        SELECT
          ${labelExpression} AS label,
          COALESCE(SUM(CASE
            WHEN iv.doc_date >= ${currentPeriod.dateFrom}
             AND iv.doc_date < ${currentPeriod.dateToExclusive}
            THEN dtl.local_sub_total ELSE 0 END), 0)::float AS current_val,
          COALESCE(SUM(CASE
            WHEN iv.doc_date >= ${previousPeriod.dateFrom}
             AND iv.doc_date < ${previousPeriod.dateToExclusive}
            THEN dtl.local_sub_total ELSE 0 END), 0)::float AS previous_val
        FROM iv_dtl dtl
        JOIN iv ON dtl.doc_key = iv.doc_key
        LEFT JOIN item i ON dtl.item_code = i.item_code
        ${categoryJoin}
        WHERE iv.cancelled = false
          AND iv.doc_date >= ${previousPeriod.dateFrom}
          AND iv.doc_date < ${currentPeriod.dateToExclusive}
          ${extraWhere}
          ${itemGroupCondition}
        GROUP BY ${labelExpression}
      )
      SELECT label, current_val, previous_val
      FROM product_sales
      WHERE current_val < previous_val
      ORDER BY current_val - previous_val ASC
      LIMIT 10
    `;
  } else {
    varianceRows = await prisma.$queryRaw<
    { label: string; current_val: number; previous_val: number }[]
    >`
    WITH curr AS (
      SELECT iv.debtor_code, SUM(iv.local_ex_tax) AS amt
      FROM iv
      WHERE iv.cancelled = false AND iv.doc_date >= ${currentPeriod.dateFrom} AND iv.doc_date < ${currentPeriod.dateToExclusive}
        ${extraWhere}
      GROUP BY iv.debtor_code
    ),
    prev AS (
      SELECT iv.debtor_code, SUM(iv.local_ex_tax) AS amt
      FROM iv
      WHERE iv.cancelled = false AND iv.doc_date >= ${previousPeriod.dateFrom} AND iv.doc_date < ${previousPeriod.dateToExclusive}
        ${extraWhere}
      GROUP BY iv.debtor_code
    )
    SELECT d.company_name AS label,
      COALESCE(curr.amt, 0)::float AS current_val,
      COALESCE(prev.amt, 0)::float AS previous_val
    FROM debtor d
    LEFT JOIN curr ON curr.debtor_code = d.acc_no
    LEFT JOIN prev ON prev.debtor_code = d.acc_no
    WHERE COALESCE(curr.amt, 0) != 0 OR COALESCE(prev.amt, 0) != 0
    ORDER BY ABS(COALESCE(curr.amt, 0) - COALESCE(prev.amt, 0)) DESC
    LIMIT 10
  `;
  }

  const byCategory = mapToVarianceComponents(varianceRows, totalChange);

  return {
    questionType: "sales_variance",
    metric: "sales",
    totalCurrent,
    totalPrevious,
    totalChange,
    totalChangePct,
    byCategory,
    byDepartment: [],
    topDriverTransactions: [],
    currentPeriod: toPeriodInfo(currentPeriod),
    previousPeriod: toPeriodInfo(previousPeriod),
    filters: filters.applied,
  };
}

// ── AR variance ─────────────────────────────────────────────────────────────

async function buildARVariance(
  currentPeriod: RP,
  previousPeriod: RP,
  filters: ResolvedFilters
): Promise<VarianceBreakdownResult> {
  // Outstanding AR at current vs previous period doc_date ranges
  const totalCurrent = await queryOutstanding(filters);

  // For previous, we approximate by looking at invoices issued in the previous period
  const prevConds: Prisma.Sql[] = [
    Prisma.sql`cancelled = false`,
    Prisma.sql`outstanding > 0`,
    Prisma.sql`doc_date >= ${previousPeriod.dateFrom} AND doc_date <= ${previousPeriod.dateTo}`,
  ];
  if (filters.debtorCodes?.length) {
    prevConds.push(Prisma.sql`debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  }
  const prevWhere = Prisma.sql`WHERE ${Prisma.join(prevConds, " AND ")}`;
  const prevRows = await prisma.$queryRaw<{ amount: number }[]>`
    SELECT COALESCE(SUM(outstanding), 0)::float AS amount FROM ar_invoice ${prevWhere}
  `;
  const totalPrevious = prevRows[0]?.amount ?? 0;

  const totalChange = totalCurrent - totalPrevious;
  const totalChangePct = totalPrevious !== 0 ? (totalChange / totalPrevious) * 100 : null;

  // By aging bucket
  const arConds: Prisma.Sql[] = [Prisma.sql`cancelled = false`, Prisma.sql`outstanding > 0`];
  if (filters.debtorCodes?.length) {
    arConds.push(Prisma.sql`debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  }
  const arWhere = Prisma.sql`WHERE ${Prisma.join(arConds, " AND ")}`;

  const bucketRows = await prisma.$queryRaw<{ label: string; current_val: number }[]>`
    SELECT
      CASE
        WHEN due_date >= CURRENT_DATE THEN 'Current'
        WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN '1-30 days'
        WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN '31-60 days'
        WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN '61-90 days'
        ELSE '90+ days'
      END AS label,
      SUM(outstanding)::float AS current_val
    FROM ar_invoice
    ${arWhere}
    GROUP BY label
  `;

  const byCategory: VarianceComponent[] = bucketRows.map((b) => ({
    label: b.label,
    currentValue: b.current_val,
    previousValue: 0,
    change: b.current_val,
    changePct: null,
    contributionPct: totalCurrent !== 0 ? (b.current_val / totalCurrent) * 100 : null,
  }));

  return {
    questionType: "ar_variance",
    metric: "outstanding_amount",
    totalCurrent,
    totalPrevious,
    totalChange,
    totalChangePct,
    byCategory,
    byDepartment: [],
    topDriverTransactions: [],
    currentPeriod: toPeriodInfo(currentPeriod),
    previousPeriod: toPeriodInfo(previousPeriod),
    filters: filters.applied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. getMarginAnalysis — question_type: "margin_variance"
// ═══════════════════════════════════════════════════════════════════════════

export async function getMarginAnalysis(
  classification: ClassificationResult
): Promise<MarginAnalysisResult> {
  const currentPeriod = await resolvePeriod(classification.period ?? "last_month");
  if (!currentPeriod) throw new Error("Could not resolve period.");
  const previousPeriod = await resolvePeriod(
    classification.comparison_period ?? "previous_period",
    currentPeriod.periodNos[0]
  );
  if (!previousPeriod) throw new Error("Could not resolve comparison period.");

  const filters = await resolveFilters(classification);
  const curNos = currentPeriod.periodNos;
  const prevNos = previousPeriod.periodNos;

  // Overall margins
  const [curRev, prevRev, curCogs, prevCogs, curExp, prevExp] = await Promise.all([
    computeGLMetric("revenue", curNos, filters),
    computeGLMetric("revenue", prevNos, filters),
    computeGLMetric("cogs", curNos, filters),
    computeGLMetric("cogs", prevNos, filters),
    computeGLMetric("total_cost", curNos, filters),
    computeGLMetric("total_cost", prevNos, filters),
  ]);

  const curGrossMargin = curRev !== 0 ? ((curRev - curCogs) / curRev) * 100 : 0;
  const prevGrossMargin = prevRev !== 0 ? ((prevRev - prevCogs) / prevRev) * 100 : 0;
  const curNetMargin = curRev !== 0 ? ((curRev - curExp) / curRev) * 100 : 0;
  const prevNetMargin = prevRev !== 0 ? ((prevRev - prevExp) / prevRev) * 100 : 0;

  // Department margins
  const curPeriods = Prisma.join(curNos);
  const prevPeriods = Prisma.join(prevNos);

  const deptMarginRows = await prisma.$queryRaw<
    { department: string; cur_rev: number; cur_cogs: number; prev_rev: number; prev_cogs: number }[]
  >`
    SELECT
      dept.description AS department,
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = true AND pb.period_no IN (${curPeriods}) THEN pb.home_cr - pb.home_dr ELSE 0 END), 0)::float AS cur_rev,
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = false AND pb.period_no IN (${curPeriods}) THEN pb.home_dr - pb.home_cr ELSE 0 END), 0)::float AS cur_cogs,
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = true AND pb.period_no IN (${prevPeriods}) THEN pb.home_cr - pb.home_dr ELSE 0 END), 0)::float AS prev_rev,
      COALESCE(SUM(CASE WHEN pf.credit_as_positive = false AND pb.period_no IN (${prevPeriods}) THEN pb.home_dr - pb.home_cr ELSE 0 END), 0)::float AS prev_cogs
    FROM pbalance pb
    JOIN gl_mast gm ON pb.acc_no = gm.acc_no
    JOIN acc_type at ON gm.acc_type = at.acc_type
    JOIN pl_format pf ON pf.acc_type = at.acc_type
    JOIN dept ON pb.dept_no = dept.dept_no
    WHERE at.is_bs_type = false
      AND (pb.period_no IN (${curPeriods}) OR pb.period_no IN (${prevPeriods}))
    GROUP BY dept.description
  `;

  const departmentMargins: DepartmentMargin[] = deptMarginRows.map((r) => {
    const curM = r.cur_rev !== 0 ? ((r.cur_rev - r.cur_cogs) / r.cur_rev) * 100 : 0;
    const prevM = r.prev_rev !== 0 ? ((r.prev_rev - r.prev_cogs) / r.prev_rev) * 100 : 0;
    return {
      department: r.department,
      currentMargin: curM,
      previousMargin: prevM,
      changeBps: Math.round((curM - prevM) * 100),
    };
  }).sort((a, b) => a.changeBps - b.changeBps); // worst compression first

  // Product margins (bottom 10 by margin in current period)
  const productRows = await prisma.$queryRaw<
    { product: string; revenue: number; cost: number }[]
  >`
    SELECT
      ig.description AS product,
      SUM(dtl.local_sub_total)::float AS revenue,
      SUM(dtl.local_total_cost)::float AS cost
    FROM iv_dtl dtl
    JOIN iv ON dtl.doc_key = iv.doc_key
    JOIN item i ON dtl.item_code = i.item_code
    JOIN item_group ig ON i.item_group = ig.item_group
    WHERE iv.cancelled = false
      AND iv.doc_date >= ${currentPeriod.dateFrom} AND iv.doc_date <= ${currentPeriod.dateTo}
    GROUP BY ig.description
    HAVING SUM(dtl.local_sub_total) > 0
    ORDER BY (SUM(dtl.local_sub_total) - SUM(dtl.local_total_cost)) / NULLIF(SUM(dtl.local_sub_total), 0) ASC
    LIMIT 10
  `;

  const lowestMarginProducts: ProductMargin[] = productRows.map((r) => ({
    product: r.product,
    revenue: r.revenue,
    cost: r.cost,
    margin: r.revenue !== 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0,
  }));

  return {
    questionType: "margin_variance",
    currentGrossMargin: curGrossMargin,
    previousGrossMargin: prevGrossMargin,
    grossMarginChangeBps: Math.round((curGrossMargin - prevGrossMargin) * 100),
    currentNetMargin: curNetMargin,
    previousNetMargin: prevNetMargin,
    netMarginChangeBps: Math.round((curNetMargin - prevNetMargin) * 100),
    departmentMargins,
    lowestMarginProducts,
    currentPeriod: toPeriodInfo(currentPeriod),
    previousPeriod: toPeriodInfo(previousPeriod),
    filters: filters.applied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Query pbalance for specific acc_nos. */
async function queryGLForAccounts(
  accNos: string[],
  periodNos: number[],
  filters: ResolvedFilters
): Promise<number> {
  const deptCond = filters.deptNos?.length
    ? Prisma.sql`AND pb.dept_no IN (${Prisma.join(filters.deptNos)})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ amount: number }[]>`
    SELECT COALESCE(SUM(pb.home_dr - pb.home_cr), 0)::float AS amount
    FROM pbalance pb
    WHERE pb.acc_no IN (${Prisma.join(accNos)})
      AND pb.period_no IN (${Prisma.join(periodNos)})
      ${deptCond}
  `;
  return rows[0]?.amount ?? 0;
}

/** Drill into gl_dtl for top N driver transactions. */
async function drillDownGLDtl(
  accNo: string,
  dateFrom: Date,
  dateTo: Date,
  limit = 5
): Promise<TransactionDriver[]> {
  return prisma.$queryRaw<TransactionDriver[]>`
    SELECT
      gd.trans_date::text AS date,
      COALESCE(gd.ref_no1, '') AS "docNo",
      COALESCE(gd.description, '') AS description,
      COALESCE(dept.description, '') AS department,
      GREATEST(gd.home_dr, gd.home_cr)::float AS amount,
      COALESCE(gd.journal_type, '') AS "journalType",
      COALESCE(gd.ref_no1, '') AS "refNo"
    FROM gl_dtl gd
    LEFT JOIN dept ON gd.dept_no = dept.dept_no
    WHERE gd.acc_no = ${accNo}
      AND gd.trans_date >= ${dateFrom} AND gd.trans_date <= ${dateTo}
    ORDER BY GREATEST(gd.home_dr, gd.home_cr) DESC
    LIMIT ${limit}
  `;
}

/** Convert raw query rows to VarianceComponent array. */
function mapToVarianceComponents(
  rows: { label: string; current_val: number; previous_val: number }[],
  totalChange: number
): VarianceComponent[] {
  return rows.map((r) => {
    const change = r.current_val - r.previous_val;
    return {
      label: r.label,
      currentValue: r.current_val,
      previousValue: r.previous_val,
      change,
      changePct: r.previous_val !== 0 ? (change / r.previous_val) * 100 : null,
      contributionPct: totalChange !== 0 ? (change / totalChange) * 100 : null,
    };
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** Helper to build a single VarianceComponent. */
function makeComponent(
  label: string,
  currentValue: number,
  previousValue: number,
  totalChange: number
): VarianceComponent {
  const change = currentValue - previousValue;
  return {
    label,
    currentValue,
    previousValue,
    change,
    changePct: previousValue !== 0 ? (change / previousValue) * 100 : null,
    contributionPct: totalChange !== 0 ? (change / totalChange) * 100 : null,
  };
}

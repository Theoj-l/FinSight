// ---------------------------------------------------------------------------
// recommendation-service.ts
// Handles recommendation-related financial queries for FinSight.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ClassificationResult } from "@/lib/types/classification";
import { resolvePeriod, toPeriodInfo } from "../period-resolver";
import { resolveFilters } from "../filter-builder";
import type {
  PaymentFollowUpResult,
  FollowUpItem,
  ManagementPrioritiesResult,
  PriorityItem,
} from "../types";
import { buildDeptCondition } from "./metric-service";

/**
 * 1. getPaymentFollowUp
 * Question type: payment_follow_up
 * Returns a prioritized list of customers to follow up for outstanding payments.
 */
export async function getPaymentFollowUp(
  classification: ClassificationResult
): Promise<PaymentFollowUpResult> {
  const filters = await resolveFilters(classification);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`ar.cancelled = false`,
    Prisma.sql`ar.outstanding > 0`,
    Prisma.sql`ar.due_date < CURRENT_DATE`,
  ];
  if (filters.debtorCodes?.length) {
    conditions.push(
      Prisma.sql`ar.debtor_code IN (${Prisma.join(filters.debtorCodes)})`
    );
  }
  if (filters.salesAgents?.length) {
    conditions.push(
      Prisma.sql`ar.sales_agent IN (${Prisma.join(filters.salesAgents)})`
    );
  }
  if (filters.branchCodes?.length) {
    conditions.push(
      Prisma.sql`ar.branch_code IN (${Prisma.join(filters.branchCodes)})`
    );
  }

  // Metric conditions apply to individual invoices, before customer totals
  // are calculated. For example, `days_overdue > 60` must exclude current
  // invoices and invoices only 1-60 days overdue from the SUM and COUNT.
  for (const condition of classification.metric_conditions ?? []) {
    if (condition.metric !== "days_overdue") continue;

    const value = Number(condition.value);
    if (!Number.isFinite(value)) continue;

    const daysOverdue = Prisma.sql`(CURRENT_DATE - ar.due_date)`;
    switch (condition.operator) {
      case ">":
        conditions.push(Prisma.sql`${daysOverdue} > ${value}`);
        break;
      case ">=":
        conditions.push(Prisma.sql`${daysOverdue} >= ${value}`);
        break;
      case "<":
        conditions.push(Prisma.sql`${daysOverdue} < ${value}`);
        break;
      case "<=":
        conditions.push(Prisma.sql`${daysOverdue} <= ${value}`);
        break;
      case "=":
        conditions.push(Prisma.sql`${daysOverdue} = ${value}`);
        break;
      case "!=":
        conditions.push(Prisma.sql`${daysOverdue} != ${value}`);
        break;
    }
  }
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  // Portfolio totals must be calculated before the customer display limit.
  // This matches the full overdue population represented by the action list.
  const totals = await prisma.$queryRaw<
    {
      total_at_risk: number;
      overdue_invoice_count: number;
      overdue_customer_count: number;
    }[]
  >`
    SELECT
      COALESCE(SUM(ar.outstanding), 0)::float AS total_at_risk,
      COUNT(*)::int AS overdue_invoice_count,
      COUNT(DISTINCT ar.debtor_code)::int AS overdue_customer_count
    FROM ar_invoice ar
    ${whereClause}
  `;

  const rows = await prisma.$queryRaw<
    {
      customer: string;
      outstanding: number;
      days_overdue: number;
      oldest_invoice: string;
      invoice_count: number;
    }[]
  >`
    SELECT
      d.company_name AS customer,
      SUM(ar.outstanding)::float AS outstanding,
      MAX(GREATEST(CURRENT_DATE - ar.due_date, 0))::int AS days_overdue,
      MIN(ar.doc_no) AS oldest_invoice,
      COUNT(*)::int AS invoice_count
    FROM ar_invoice ar
    JOIN debtor d ON ar.debtor_code = d.acc_no
    ${whereClause}
    GROUP BY d.company_name
    ORDER BY SUM(ar.outstanding) DESC
    LIMIT 20
  `;

  const items: FollowUpItem[] = rows.map((row) => {
    const outstanding = row.outstanding ?? 0;
    const daysOverdue = row.days_overdue ?? 0;

    let priority: "high" | "medium" | "low" = "low";
    if (outstanding > 100000 || daysOverdue > 90) {
      priority = "high";
    } else if (outstanding > 50000 || daysOverdue > 60) {
      priority = "medium";
    }

    return {
      customer: row.customer || "Unknown",
      outstanding,
      daysOverdue,
      oldestInvoice: row.oldest_invoice || "",
      invoiceCount: row.invoice_count ?? 0,
      priority,
    };
  });

  // Sort by priority (high first), then by outstanding DESC
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  items.sort((a, b) => {
    const orderDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return b.outstanding - a.outstanding;
  });

  return {
    questionType: "payment_follow_up",
    items,
    totalAtRisk: totals[0]?.total_at_risk ?? 0,
    overdueInvoiceCount: totals[0]?.overdue_invoice_count ?? 0,
    overdueCustomerCount: totals[0]?.overdue_customer_count ?? 0,
    filters: filters.applied,
  };
}

/**
 * 2. getManagementPriorities
 * Handles: cost_investigation, sales_follow_up, payroll_investigation, management_priority
 */
export async function getManagementPriorities(
  classification: ClassificationResult
): Promise<ManagementPrioritiesResult> {
  const qType = classification.question_type as
    | "cost_investigation"
    | "sales_follow_up"
    | "margin_investigation"
    | "payroll_investigation"
    | "management_priority";

  let focusArea = "Executive Overview";
  if (qType === "cost_investigation") focusArea = "Cost Management";
  else if (qType === "sales_follow_up") focusArea = "Sales Performance";
  else if (qType === "margin_investigation") focusArea = "Product Gross Margin";
  else if (qType === "payroll_investigation") focusArea = "Payroll & Staff Costs";

  const currentPeriod = await resolvePeriod(classification.period ?? "last_month");
  if (!currentPeriod) {
    throw new Error("Could not resolve current period");
  }

  const previousPeriod = await resolvePeriod(
    classification.comparison_period ?? "previous_period",
    currentPeriod.periodNos[0]
  );
  if (!previousPeriod) {
    throw new Error("Could not resolve previous period");
  }

  const filters = await resolveFilters(classification);
  const deptCond = buildDeptCondition(filters, "pb");

  const priorities: PriorityItem[] = [];

  const checkCost = qType === "cost_investigation" || qType === "management_priority";
  const checkSales = qType === "sales_follow_up" || qType === "management_priority";
  const checkPayroll = qType === "payroll_investigation" || qType === "management_priority";

  // Product gross-margin investigation uses invoice-line revenue and cost.
  if (qType === "margin_investigation") {
    const productConditions: Prisma.Sql[] = [
      Prisma.sql`iv.cancelled = false`,
      Prisma.sql`dtl.item_code IS NOT NULL`,
      Prisma.sql`iv.doc_date >= ${previousPeriod.dateFrom}`,
      Prisma.sql`iv.doc_date < ${currentPeriod.dateToExclusive}`,
    ];
    if (filters.debtorCodes?.length) {
      productConditions.push(
        Prisma.sql`iv.debtor_code IN (${Prisma.join(filters.debtorCodes)})`
      );
    }
    if (filters.salesAgents?.length) {
      productConditions.push(
        Prisma.sql`iv.sales_agent IN (${Prisma.join(filters.salesAgents)})`
      );
    }
    if (filters.branchCodes?.length) {
      productConditions.push(
        Prisma.sql`iv.branch_code IN (${Prisma.join(filters.branchCodes)})`
      );
    }
    if (filters.itemGroups?.length) {
      productConditions.push(
        Prisma.sql`i.item_group IN (${Prisma.join(filters.itemGroups)})`
      );
    }
    if (filters.deptNos?.length) {
      productConditions.push(
        Prisma.sql`dtl.dept_no IN (${Prisma.join(filters.deptNos)})`
      );
    }
    const productWhere = Prisma.sql`WHERE ${Prisma.join(productConditions, " AND ")}`;
    const limit = classification.top_n ?? 10;

    const rows = await prisma.$queryRaw<
      {
        area: string;
        previous_margin_pct: number;
        current_margin_pct: number;
        margin_change_pp: number;
        previous_gross_profit: number;
        current_gross_profit: number;
        gross_profit_change: number;
      }[]
    >`
      WITH product_performance AS (
        SELECT
          dtl.item_code,
          COALESCE(i.description, dtl.item_code) AS area,
          SUM(CASE WHEN iv.doc_date >= ${previousPeriod.dateFrom}
                    AND iv.doc_date < ${previousPeriod.dateToExclusive}
              THEN dtl.local_sub_total ELSE 0 END) AS previous_sales,
          SUM(CASE WHEN iv.doc_date >= ${previousPeriod.dateFrom}
                    AND iv.doc_date < ${previousPeriod.dateToExclusive}
              THEN dtl.local_total_cost ELSE 0 END) AS previous_cost,
          SUM(CASE WHEN iv.doc_date >= ${currentPeriod.dateFrom}
                    AND iv.doc_date < ${currentPeriod.dateToExclusive}
              THEN dtl.local_sub_total ELSE 0 END) AS current_sales,
          SUM(CASE WHEN iv.doc_date >= ${currentPeriod.dateFrom}
                    AND iv.doc_date < ${currentPeriod.dateToExclusive}
              THEN dtl.local_total_cost ELSE 0 END) AS current_cost
        FROM iv_dtl dtl
        JOIN iv ON dtl.doc_key = iv.doc_key
        LEFT JOIN item i ON dtl.item_code = i.item_code
        ${productWhere}
        GROUP BY dtl.item_code, i.description
      ), margin_comparison AS (
        SELECT
          area,
          previous_sales - previous_cost AS previous_gross_profit,
          current_sales - current_cost AS current_gross_profit,
          (previous_sales - previous_cost) / NULLIF(previous_sales, 0) * 100 AS previous_margin_pct,
          (current_sales - current_cost) / NULLIF(current_sales, 0) * 100 AS current_margin_pct
        FROM product_performance
      )
      SELECT
        area,
        previous_margin_pct::float,
        current_margin_pct::float,
        (current_margin_pct - previous_margin_pct)::float AS margin_change_pp,
        previous_gross_profit::float,
        current_gross_profit::float,
        (current_gross_profit - previous_gross_profit)::float AS gross_profit_change
      FROM margin_comparison
      WHERE current_margin_pct < previous_margin_pct
      ORDER BY gross_profit_change ASC
      LIMIT ${limit}
    `;

    for (const row of rows) {
      const marginDecline = Math.abs(row.margin_change_pp ?? 0);
      const grossProfitDecline = Math.abs(Math.min(row.gross_profit_change ?? 0, 0));
      let priority: "high" | "medium" | "low" = "low";
      if (marginDecline >= 10 || grossProfitDecline >= 10000) priority = "high";
      else if (marginDecline >= 5 || grossProfitDecline >= 1000) priority = "medium";

      priorities.push({
        area: row.area || "Unknown Product",
        finding: `Gross margin declined by ${marginDecline.toFixed(2)} pp; gross profit changed by SGD ${(row.gross_profit_change ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        impact: row.gross_profit_change ?? 0,
        previousMarginPct: row.previous_margin_pct,
        currentMarginPct: row.current_margin_pct,
        marginChangePp: row.margin_change_pp,
        previousGrossProfit: row.previous_gross_profit,
        currentGrossProfit: row.current_gross_profit,
        grossProfitChange: row.gross_profit_change,
        suggestedAction: `Review pricing, discounts, and delivery costs for ${row.area}`,
        priority,
      });
    }
  }

  // 1. Cost Investigation
  if (checkCost) {
    const curP = Prisma.join(currentPeriod.periodNos);
    const prevP = Prisma.join(previousPeriod.periodNos);

    type CostPriorityRow = {
      area: string;
      current_amt: number;
      previous_amt: number;
      change_amt: number;
    };
    const byDepartment = classification.dimensions.includes("department") ||
      classification.dimensions.includes("business_unit");
    let rows: CostPriorityRow[];

    if (byDepartment) {
      const departmentLimit = classification.top_n ?? 1;
      rows = await prisma.$queryRaw<CostPriorityRow[]>`
        WITH department_expenses AS (
          SELECT
            pb.dept_no,
            COALESCE(d.description, pb.dept_no, 'Unassigned') AS area,
            COALESCE(SUM(CASE WHEN pb.period_no IN (${prevP})
              THEN pb.home_dr - pb.home_cr ELSE 0 END), 0) AS previous_amt,
            COALESCE(SUM(CASE WHEN pb.period_no IN (${curP})
              THEN pb.home_dr - pb.home_cr ELSE 0 END), 0) AS current_amt
          FROM pbalance pb
          JOIN gl_mast gm ON pb.acc_no = gm.acc_no
          LEFT JOIN dept d ON pb.dept_no = d.dept_no
          WHERE gm.acc_type = 'EX'
            AND (pb.period_no IN (${prevP}) OR pb.period_no IN (${curP}))
            ${deptCond}
          GROUP BY pb.dept_no, d.description
        )
        SELECT
          area,
          current_amt::float,
          previous_amt::float,
          (current_amt - previous_amt)::float AS change_amt
        FROM department_expenses
        WHERE current_amt > previous_amt
        ORDER BY change_amt DESC
        LIMIT ${departmentLimit}
      `;
    } else {
      rows = await prisma.$queryRaw<CostPriorityRow[]>`
      WITH curr AS (
        SELECT pb.acc_no, SUM(pb.home_dr - pb.home_cr) AS amt
        FROM pbalance pb
        WHERE pb.period_no IN (${curP}) ${deptCond}
        GROUP BY pb.acc_no
      ),
      prev AS (
        SELECT pb.acc_no, SUM(pb.home_dr - pb.home_cr) AS amt
        FROM pbalance pb
        WHERE pb.period_no IN (${prevP}) ${deptCond}
        GROUP BY pb.acc_no
      )
      SELECT 
        gm.description AS area,
        COALESCE(curr.amt, 0)::float AS current_amt,
        COALESCE(prev.amt, 0)::float AS previous_amt,
        (COALESCE(curr.amt, 0) - COALESCE(prev.amt, 0))::float AS change_amt
      FROM gl_mast gm
      LEFT JOIN curr ON curr.acc_no = gm.acc_no
      LEFT JOIN prev ON prev.acc_no = gm.acc_no
      WHERE gm.acc_type = 'EX'
        AND (COALESCE(curr.amt, 0) - COALESCE(prev.amt, 0)) > 0
      ORDER BY
        CASE
          WHEN COALESCE(prev.amt, 0) != 0
            THEN (COALESCE(curr.amt, 0) - COALESCE(prev.amt, 0)) / ABS(prev.amt)
          WHEN COALESCE(curr.amt, 0) > 0 THEN 1
          ELSE 0
        END DESC,
        change_amt DESC
      LIMIT 10
    `;
    }

    for (const row of rows) {
      const current_amt = row.current_amt ?? 0;
      const previous_amt = row.previous_amt ?? 0;
      const impact = row.change_amt ?? 0;
      let pct = 0;
      if (previous_amt !== 0) {
        // A credit balance can make the raw denominator negative even though
        // the expense movement is an increase. Present increase magnitude as
        // a positive percentage (e.g. -9,370.08 to 4,228.13 => +145.12%).
        pct = (impact / Math.abs(previous_amt)) * 100;
      } else if (current_amt > 0) {
        pct = 100;
      }

      let priority: "high" | "medium" | "low" = "low";
      if (pct > 20) priority = "high";
      else if (pct > 10) priority = "medium";

      priorities.push({
        area: row.area,
        finding: `Increased by SGD ${impact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct.toFixed(1)}%)`,
        impact,
        previousValue: previous_amt,
        currentValue: current_amt,
        changePct: pct,
        suggestedAction: `Investigate root cause of increase in ${row.area}`,
        priority,
      });
    }
  }

  // 2. Sales Performance
  if (checkSales) {
    const salesFollowUpLimit = classification.top_n ?? 5;
    const filtersCond = [];
    if (filters.debtorCodes?.length) {
      filtersCond.push(Prisma.sql`iv.debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
    }
    if (filters.salesAgents?.length) {
      filtersCond.push(Prisma.sql`iv.sales_agent IN (${Prisma.join(filters.salesAgents)})`);
    }
    const extraWhere = filtersCond.length > 0 ? Prisma.sql`AND ${Prisma.join(filtersCond, " AND ")}` : Prisma.empty;
    
    const rows = await prisma.$queryRaw<
      {
        area: string;
        sales_agent: string | null;
        current_amt: number;
        previous_amt: number;
        decline_amt: number;
      }[]
    >`
      WITH curr AS (
        SELECT iv.debtor_code, SUM(iv.local_ex_tax) AS amt
        FROM iv
        WHERE iv.cancelled = false 
          AND iv.doc_date >= ${currentPeriod.dateFrom} AND iv.doc_date < ${currentPeriod.dateToExclusive}
          ${extraWhere}
        GROUP BY iv.debtor_code
      ),
      prev AS (
        SELECT iv.debtor_code, SUM(iv.local_ex_tax) AS amt
        FROM iv
        WHERE iv.cancelled = false 
          AND iv.doc_date >= ${previousPeriod.dateFrom} AND iv.doc_date < ${previousPeriod.dateToExclusive}
          ${extraWhere}
        GROUP BY iv.debtor_code
      )
      SELECT 
        d.company_name AS area,
        d.sales_agent,
        COALESCE(curr.amt, 0)::float AS current_amt,
        COALESCE(prev.amt, 0)::float AS previous_amt,
        (COALESCE(prev.amt, 0) - COALESCE(curr.amt, 0))::float AS decline_amt
      FROM debtor d
      LEFT JOIN curr ON curr.debtor_code = d.acc_no
      LEFT JOIN prev ON prev.debtor_code = d.acc_no
      WHERE COALESCE(prev.amt, 0) > 0
        AND (COALESCE(prev.amt, 0) - COALESCE(curr.amt, 0)) > 0
      ORDER BY decline_amt DESC
      LIMIT ${salesFollowUpLimit}
    `;

    for (const row of rows) {
      const previous_amt = row.previous_amt ?? 0;
      const current_amt = row.current_amt ?? 0;
      const impact = row.decline_amt ?? 0;
      let pct = 0;
      if (previous_amt !== 0) pct = ((current_amt - previous_amt) / previous_amt) * 100;

      let priority: "high" | "medium" | "low" = "low";
      if (Math.abs(pct) > 20) priority = "high";
      else if (Math.abs(pct) > 10) priority = "medium";

      priorities.push({
        area: row.area,
        finding: `Sales declined by SGD ${impact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct.toFixed(1)}%)`,
        impact,
        previousValue: previous_amt,
        currentValue: current_amt,
        changePct: pct,
        salesAgent: row.sales_agent ?? undefined,
        suggestedAction: `Schedule review with account manager for ${row.area}`,
        priority,
      });
    }
  }

  // 3. Payroll Investigation
  if (checkPayroll) {
    const curP = Prisma.join(currentPeriod.periodNos);
    const prevP = Prisma.join(previousPeriod.periodNos);
    const targetAccounts = Prisma.join(["6100", "6110"]);

    const rows = await prisma.$queryRaw<
      {
        area: string;
        current_amt: number;
        previous_amt: number;
        change_amt: number;
      }[]
    >`
      WITH curr AS (
        SELECT pb.dept_no, SUM(pb.home_dr - pb.home_cr) AS amt
        FROM pbalance pb
        WHERE pb.period_no IN (${curP}) AND pb.acc_no IN (${targetAccounts})
          ${deptCond}
        GROUP BY pb.dept_no
      ),
      prev AS (
        SELECT pb.dept_no, SUM(pb.home_dr - pb.home_cr) AS amt
        FROM pbalance pb
        WHERE pb.period_no IN (${prevP}) AND pb.acc_no IN (${targetAccounts})
          ${deptCond}
        GROUP BY pb.dept_no
      )
      SELECT 
        dp.description AS area,
        COALESCE(curr.amt, 0)::float AS current_amt,
        COALESCE(prev.amt, 0)::float AS previous_amt,
        (COALESCE(curr.amt, 0) - COALESCE(prev.amt, 0))::float AS change_amt
      FROM dept dp
      LEFT JOIN curr ON curr.dept_no = dp.dept_no
      LEFT JOIN prev ON prev.dept_no = dp.dept_no
      WHERE (COALESCE(curr.amt, 0) - COALESCE(prev.amt, 0)) > 0
      ORDER BY change_amt DESC
      LIMIT 3
    `;

    for (const row of rows) {
      const current_amt = row.current_amt ?? 0;
      const previous_amt = row.previous_amt ?? 0;
      const impact = row.change_amt ?? 0;
      let pct = 0;
      if (previous_amt !== 0) {
        pct = (impact / previous_amt) * 100;
      } else if (current_amt > 0) {
        pct = 100;
      }

      let priority: "high" | "medium" | "low" = "low";
      if (pct > 15) priority = "high";
      else if (pct > 5) priority = "medium";

      priorities.push({
        area: row.area || "Unknown Department",
        finding: `Staff costs increased by SGD ${impact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct.toFixed(1)}%)`,
        impact,
        suggestedAction: `Review headcount changes and overtime for ${row.area}`,
        priority,
      });
    }
  }

  // 4. Combined Management Priority
  if (qType === "management_priority") {
    // Also check AR: total overdue amount
    const overdueRow = await prisma.$queryRaw<
      { total_overdue: number }[]
    >`
      SELECT SUM(outstanding)::float AS total_overdue
      FROM ar_invoice
      WHERE cancelled = false AND outstanding > 0 AND due_date < CURRENT_DATE
    `;
    
    const totalOverdue = overdueRow[0]?.total_overdue ?? 0;
    if (totalOverdue > 0) {
      let priority: "high" | "medium" | "low" = "low";
      if (totalOverdue > 500000) priority = "high";
      else if (totalOverdue > 100000) priority = "medium";

      priorities.push({
        area: "Accounts Receivable",
        finding: `Total overdue outstanding is SGD ${totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        impact: totalOverdue,
        suggestedAction: "Follow up on high risk overdue invoices immediately",
        priority,
      });
    }

    priorities.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    priorities.splice(5);
  }

  return {
    questionType: qType,
    focusArea,
    priorities,
    currentPeriod: toPeriodInfo(currentPeriod),
    previousPeriod: toPeriodInfo(previousPeriod),
    filters: filters.applied,
  };
}

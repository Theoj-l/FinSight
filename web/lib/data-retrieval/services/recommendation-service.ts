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

  let totalAtRisk = 0;
  const items: FollowUpItem[] = rows.map((row) => {
    const outstanding = row.outstanding ?? 0;
    const daysOverdue = row.days_overdue ?? 0;

    let priority: "high" | "medium" | "low" = "low";
    if (outstanding > 100000 || daysOverdue > 90) {
      priority = "high";
    } else if (outstanding > 50000 || daysOverdue > 60) {
      priority = "medium";
    }

    if (daysOverdue > 0) {
      totalAtRisk += outstanding;
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
    totalAtRisk,
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
    | "payroll_investigation"
    | "management_priority";

  let focusArea = "Executive Overview";
  if (qType === "cost_investigation") focusArea = "Cost Management";
  else if (qType === "sales_follow_up") focusArea = "Sales Performance";
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

  // 1. Cost Investigation
  if (checkCost) {
    const curP = Prisma.join(currentPeriod.periodNos);
    const prevP = Prisma.join(previousPeriod.periodNos);

    const rows = await prisma.$queryRaw<
      {
        area: string;
        current_amt: number;
        previous_amt: number;
        change_amt: number;
      }[]
    >`
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
      JOIN acc_type at ON gm.acc_type = at.acc_type
      JOIN pl_format pf ON at.acc_type = pf.acc_type
      LEFT JOIN curr ON curr.acc_no = gm.acc_no
      LEFT JOIN prev ON prev.acc_no = gm.acc_no
      WHERE pf.credit_as_positive = false AND (COALESCE(curr.amt, 0) - COALESCE(prev.amt, 0)) > 0
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
      if (pct > 20) priority = "high";
      else if (pct > 10) priority = "medium";

      priorities.push({
        area: row.area,
        finding: `Increased by SGD ${impact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct.toFixed(1)}%)`,
        impact,
        suggestedAction: `Investigate root cause of increase in ${row.area}`,
        priority,
      });
    }
  }

  // 2. Sales Performance
  if (checkSales) {
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
        current_amt: number;
        previous_amt: number;
        decline_amt: number;
      }[]
    >`
      WITH curr AS (
        SELECT iv.debtor_code, SUM(iv.local_ex_tax) AS amt
        FROM iv
        WHERE iv.cancelled = false 
          AND iv.doc_date >= ${currentPeriod.dateFrom} AND iv.doc_date <= ${currentPeriod.dateTo}
          ${extraWhere}
        GROUP BY iv.debtor_code
      ),
      prev AS (
        SELECT iv.debtor_code, SUM(iv.local_ex_tax) AS amt
        FROM iv
        WHERE iv.cancelled = false 
          AND iv.doc_date >= ${previousPeriod.dateFrom} AND iv.doc_date <= ${previousPeriod.dateTo}
          ${extraWhere}
        GROUP BY iv.debtor_code
      )
      SELECT 
        d.company_name AS area,
        COALESCE(curr.amt, 0)::float AS current_amt,
        COALESCE(prev.amt, 0)::float AS previous_amt,
        (COALESCE(prev.amt, 0) - COALESCE(curr.amt, 0))::float AS decline_amt
      FROM debtor d
      LEFT JOIN curr ON curr.debtor_code = d.acc_no
      LEFT JOIN prev ON prev.debtor_code = d.acc_no
      WHERE (COALESCE(prev.amt, 0) - COALESCE(curr.amt, 0)) > 0
      ORDER BY decline_amt DESC
      LIMIT 3
    `;

    for (const row of rows) {
      const previous_amt = row.previous_amt ?? 0;
      const impact = row.decline_amt ?? 0;
      let pct = 0;
      if (previous_amt !== 0) pct = (impact / previous_amt) * 100;

      let priority: "high" | "medium" | "low" = "low";
      if (pct > 20) priority = "high";
      else if (pct > 10) priority = "medium";

      priorities.push({
        area: row.area,
        finding: `Sales declined by SGD ${impact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct.toFixed(1)}%)`,
        impact,
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

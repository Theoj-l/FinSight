// ---------------------------------------------------------------------------
// ar-service.ts — Accounts Receivable queries.
//
// Consolidates: invoice status, AR aging summary, and overdue customer
// analysis for reuse by variance and recommendation services.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ClassificationResult } from "@/lib/types/classification";
import { resolveFilters } from "../filter-builder";
import type {
  InvoiceStatusResult,
  InvoiceRow,
  ARSummaryResult,
  AgingBucket,
  TopDebtor,
  OverdueCustomersResult,
  OverdueCustomerRow,
} from "../types";

// ── Shared AR condition builder ─────────────────────────────────────────────

type RF = Awaited<ReturnType<typeof resolveFilters>>;

function buildARConditions(
  filters: RF,
  alias = "ar"
): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [
    Prisma.sql`${Prisma.raw(alias)}.cancelled = false`,
    Prisma.sql`${Prisma.raw(alias)}.outstanding > 0`,
  ];
  if (filters.debtorCodes?.length) {
    conds.push(Prisma.sql`${Prisma.raw(alias)}.debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  }
  if (filters.salesAgents?.length) {
    conds.push(Prisma.sql`${Prisma.raw(alias)}.sales_agent IN (${Prisma.join(filters.salesAgents)})`);
  }
  if (filters.branchCodes?.length) {
    conds.push(Prisma.sql`${Prisma.raw(alias)}.branch_code IN (${Prisma.join(filters.branchCodes)})`);
  }
  return conds;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. getInvoiceStatus — question_type: "invoice_status"
// ═══════════════════════════════════════════════════════════════════════════

export async function getInvoiceStatus(
  classification: ClassificationResult
): Promise<InvoiceStatusResult> {
  const filters = await resolveFilters(classification);
  const conditions = buildARConditions(filters);
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const rawRows = await prisma.$queryRaw<
    {
      doc_no: string;
      company_name: string;
      amount: number;
      outstanding: number;
      due_date: Date;
      days_overdue: number;
      status: string;
    }[]
  >`
    SELECT
      ar.doc_no,
      d.company_name,
      ar.local_net_total::float AS amount,
      ar.outstanding::float AS outstanding,
      ar.due_date,
      GREATEST(CURRENT_DATE - ar.due_date, 0)::int AS days_overdue,
      CASE
        WHEN ar.outstanding = 0 THEN 'paid'
        WHEN ar.due_date >= CURRENT_DATE THEN 'current'
        ELSE 'overdue'
      END AS status
    FROM ar_invoice ar
    JOIN debtor d ON ar.debtor_code = d.acc_no
    ${whereClause}
    ORDER BY days_overdue DESC
    LIMIT 50
  `;

  let invoices: InvoiceRow[] = rawRows.map((row) => ({
    docNo: row.doc_no,
    customer: row.company_name ?? "Unknown",
    amount: row.amount ?? 0,
    outstanding: row.outstanding ?? 0,
    dueDate:
      row.due_date instanceof Date
        ? row.due_date.toISOString().split("T")[0]
        : String(row.due_date),
    daysOverdue: Number(row.days_overdue) || 0,
    status: row.status as InvoiceRow["status"],
  }));

  // Apply metric_conditions as post-query filters
  if (classification.metric_conditions?.length) {
    for (const condition of classification.metric_conditions) {
      const { metric, operator, value } = condition;
      const threshold = Number(value);
      if (Number.isNaN(threshold)) continue;

      const getField = (inv: InvoiceRow): number => {
        if (metric === "days_overdue") return inv.daysOverdue;
        if (metric === "outstanding_amount") return inv.outstanding;
        return 0;
      };

      invoices = invoices.filter((inv) => {
        const v = getField(inv);
        switch (operator) {
          case ">":  return v > threshold;
          case ">=": return v >= threshold;
          case "<":  return v < threshold;
          case "<=": return v <= threshold;
          case "=":  return v === threshold;
          case "!=": return v !== threshold;
          default:   return true;
        }
      });
    }
  }

  const totalOutstanding = invoices.reduce((s, i) => s + i.outstanding, 0);
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

  return {
    questionType: "invoice_status",
    invoices,
    summary: { totalInvoices: invoices.length, totalOutstanding, overdueCount },
    filters: filters.applied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. getARSummary — question_type: "ar_summary"
// ═══════════════════════════════════════════════════════════════════════════

export async function getARSummary(
  classification: ClassificationResult
): Promise<ARSummaryResult> {
  const filters = await resolveFilters(classification);

  // Aging buckets (unaliased table for the bucket query)
  const baseConds: Prisma.Sql[] = [
    Prisma.sql`cancelled = false`,
    Prisma.sql`outstanding > 0`,
  ];
  if (filters.debtorCodes?.length) {
    baseConds.push(Prisma.sql`debtor_code IN (${Prisma.join(filters.debtorCodes)})`);
  }
  if (filters.salesAgents?.length) {
    baseConds.push(Prisma.sql`sales_agent IN (${Prisma.join(filters.salesAgents)})`);
  }
  if (filters.branchCodes?.length) {
    baseConds.push(Prisma.sql`branch_code IN (${Prisma.join(filters.branchCodes)})`);
  }
  const baseWhere = Prisma.sql`WHERE ${Prisma.join(baseConds, " AND ")}`;

  const buckets = await prisma.$queryRaw<AgingBucket[]>`
    SELECT
      CASE
        WHEN due_date >= CURRENT_DATE THEN 'Current'
        WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN '1-30 days'
        WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN '31-60 days'
        WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN '61-90 days'
        ELSE '90+ days'
      END AS label,
      SUM(outstanding)::float AS amount,
      COUNT(*)::int AS count
    FROM ar_invoice
    ${baseWhere}
    GROUP BY label
    ORDER BY MIN(
      CASE
        WHEN due_date >= CURRENT_DATE THEN 0
        WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN 1
        WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN 2
        WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN 3
        ELSE 4
      END
    )
  `;

  let totalOutstanding = 0;
  let totalOverdue = 0;
  for (const b of buckets) {
    totalOutstanding += b.amount;
    if (b.label !== "Current") totalOverdue += b.amount;
  }

  // Top debtors
  const arConds = buildARConditions(filters);
  const arWhere = Prisma.sql`WHERE ${Prisma.join(arConds, " AND ")}`;

  const topDebtors = await prisma.$queryRaw<TopDebtor[]>`
    SELECT d.company_name AS name, SUM(ar.outstanding)::float AS outstanding
    FROM ar_invoice ar
    JOIN debtor d ON ar.debtor_code = d.acc_no
    ${arWhere}
    GROUP BY d.company_name
    ORDER BY outstanding DESC
    LIMIT 10
  `;

  return {
    questionType: "ar_summary",
    totalOutstanding,
    totalOverdue,
    buckets,
    topDebtors,
    filters: filters.applied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. getOverdueCustomers — internal helper for variance & recommendations
// ═══════════════════════════════════════════════════════════════════════════

export async function getOverdueCustomers(
  classification: ClassificationResult
): Promise<OverdueCustomersResult> {
  const filters = await resolveFilters(classification);
  const conditions = buildARConditions(filters);
  const dayConditions = classification.metric_conditions.filter(
    (condition) => condition.metric === "days_overdue"
  );

  // An overdue-customer query always excludes current invoices. More specific
  // day thresholds from the classifier are applied at invoice level.
  conditions.push(Prisma.sql`ar.due_date < CURRENT_DATE`);
  for (const condition of dayConditions) {
    const days = Prisma.sql`(CURRENT_DATE - ar.due_date)`;
    const value = Number(condition.value);
    if (!Number.isFinite(value)) continue;
    switch (condition.operator) {
      case ">": conditions.push(Prisma.sql`${days} > ${value}`); break;
      case ">=": conditions.push(Prisma.sql`${days} >= ${value}`); break;
      case "<": conditions.push(Prisma.sql`${days} < ${value}`); break;
      case "<=": conditions.push(Prisma.sql`${days} <= ${value}`); break;
      case "=": conditions.push(Prisma.sql`${days} = ${value}`); break;
      case "!=": conditions.push(Prisma.sql`${days} != ${value}`); break;
    }
  }
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const limit = classification.top_n ?? 10;

  const rows = await prisma.$queryRaw<
    (OverdueCustomerRow & {
      totalCustomers: number;
      totalInvoices: number;
      totalOutstanding: number;
    })[]
  >`
    WITH overdue_by_customer AS (
      SELECT
        d.company_name AS customer,
        ar.debtor_code AS "debtorCode",
        SUM(ar.outstanding)::float AS outstanding,
        MAX(CURRENT_DATE - ar.due_date)::int AS "daysOverdue",
        COUNT(*)::int AS "invoiceCount"
      FROM ar_invoice ar
      JOIN debtor d ON ar.debtor_code = d.acc_no
      ${whereClause}
      GROUP BY d.company_name, ar.debtor_code
    )
    SELECT
      *,
      COUNT(*) OVER ()::int AS "totalCustomers",
      SUM("invoiceCount") OVER ()::int AS "totalInvoices",
      SUM(outstanding) OVER ()::float AS "totalOutstanding"
    FROM overdue_by_customer
    ORDER BY outstanding DESC
    LIMIT ${limit}
  `;

  const customers: OverdueCustomerRow[] = rows.map((row) => ({
    customer: row.customer,
    debtorCode: row.debtorCode,
    outstanding: row.outstanding,
    daysOverdue: row.daysOverdue,
    invoiceCount: row.invoiceCount,
  }));

  return {
    questionType: "overdue_customers",
    customers,
    totalCustomers: rows[0]?.totalCustomers ?? 0,
    totalInvoices: rows[0]?.totalInvoices ?? 0,
    totalOutstanding: rows[0]?.totalOutstanding ?? 0,
    filters: filters.applied,
  };
}

// ---------------------------------------------------------------------------
// filter-builder.ts — Resolves human-readable filter values from the
// classifier into database codes, and builds Prisma / SQL WHERE fragments.
//
// The classifier produces filters like { department: "Crane Rental" } but the
// DB stores dept_no = "CR".  This module does a case-insensitive lookup on
// the relevant master table to bridge the gap.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";
import type { ClassificationResult } from "@/lib/types/classification";
import type { AppliedFilters } from "./types";

// ── Resolved filters (DB-column-level codes) ────────────────────────────────

export interface ResolvedFilters {
  /** dept_no codes (for pbalance, gl_dtl, iv_dtl) */
  deptNos: string[] | null;
  /** debtor acc_no codes (for iv, ar_invoice) */
  debtorCodes: string[] | null;
  /** sales_agent codes (for iv, ar_invoice) */
  salesAgents: string[] | null;
  /** item_group codes (for iv_dtl → item) */
  itemGroups: string[] | null;
  /** branch_code codes (for iv, ar_invoice) */
  branchCodes: string[] | null;
  /** Human-readable echo of what was resolved, for the result object. */
  applied: AppliedFilters;
}

/**
 * Resolve the classifier's `filters` map into database-level codes.
 *
 * Each filter value is matched case-insensitively against the description /
 * name column of the relevant master table.  Uses `contains` for partial
 * matching so "Crane" matches "Crane Rental".
 */
export async function resolveFilters(
  classification: ClassificationResult
): Promise<ResolvedFilters> {
  const f = classification.filters;
  const applied: AppliedFilters = {};

  let deptNos: string[] | null = null;
  let debtorCodes: string[] | null = null;
  let salesAgents: string[] | null = null;
  let itemGroups: string[] | null = null;
  const branchCodes: string[] | null = null;

  // ── Department / Business Unit ──────────────────────────────────────────
  const deptFilter = f.department ?? f.business_unit;
  if (deptFilter) {
    const depts = await prisma.dept.findMany({
      where: { description: { contains: deptFilter, mode: "insensitive" } },
      select: { dept_no: true, description: true },
    });
    if (depts.length > 0) {
      deptNos = depts.map((d) => d.dept_no);
      applied.department = depts.map((d) => d.description).join(", ");
    } else {
      // No match found — keep the original value for transparency
      applied.department = `${deptFilter} (unresolved)`;
    }
  }

  // ── Customer ────────────────────────────────────────────────────────────
  if (f.customer) {
    const debtors = await prisma.debtor.findMany({
      where: {
        company_name: { contains: f.customer, mode: "insensitive" },
      },
      select: { acc_no: true, company_name: true },
    });
    if (debtors.length > 0) {
      debtorCodes = debtors.map((d) => d.acc_no);
      applied.customer = debtors
        .map((d) => d.company_name)
        .join(", ");
    } else {
      applied.customer = `${f.customer} (unresolved)`;
    }
  }

  // ── Salesperson ─────────────────────────────────────────────────────────
  if (f.salesperson) {
    const agents = await prisma.sales_agent.findMany({
      where: {
        description: { contains: f.salesperson, mode: "insensitive" },
      },
      select: { sales_agent: true, description: true },
    });
    if (agents.length > 0) {
      salesAgents = agents.map((a) => a.sales_agent);
      applied.salesperson = agents
        .map((a) => a.description)
        .join(", ");
    } else {
      applied.salesperson = `${f.salesperson} (unresolved)`;
    }
  }

  // ── Product category ──────────────────────────────────────────────────
  if (f.product_category) {
    const groups = await prisma.item_group.findMany({
      where: {
        description: {
          contains: f.product_category,
          mode: "insensitive",
        },
      },
      select: { item_group: true, description: true },
    });
    if (groups.length > 0) {
      itemGroups = groups.map((g) => g.item_group);
      applied.product_category = groups
        .map((g) => g.description)
        .join(", ");
    } else {
      applied.product_category = `${f.product_category} (unresolved)`;
    }
  }

  return { deptNos, debtorCodes, salesAgents, itemGroups, branchCodes, applied };
}

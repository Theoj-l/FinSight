import "server-only";

import { prisma } from "@/lib/db";
import { aggregateProfitLoss, type ProfitLossStatement } from "./profit-loss-utils";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";

export type { ProfitLossStatement } from "./profit-loss-utils";

export async function getProfitLossData(scope: DashboardScope = {}): Promise<ProfitLossStatement> {
  const department = ledgerDepartment(scope);
  const [formatRows, latestPeriodRow] = await Promise.all([
    prisma.pl_format.findMany({ orderBy: { seq: "asc" } }),
    scope.period === undefined
      ? prisma.pbalance.findFirst({ where: department, orderBy: { period_no: "desc" }, select: { period_no: true } })
      : Promise.resolve({ period_no: scope.period }),
  ]);

  if (!latestPeriodRow) return { baseline: "MTD actual versus MTD budget", period: "", rows: [] };

  const [actualRows, budgetRows] = await Promise.all([
    prisma.pbalance.findMany({
      where: { ...department, period_no: { gte: Math.floor(latestPeriodRow.period_no / 100) * 100 + 1, lte: latestPeriodRow.period_no } },
      select: {
        period_no: true,
        home_dr: true,
        home_cr: true,
        gl_mast: { select: { acc_type: true } },
      },
    }),
    prisma.budget_pbalance.findMany({
      where: { ...department, period_no: latestPeriodRow.period_no, ...(scope.budgetKey !== undefined ? { budget_key: scope.budgetKey } : {}) },
      select: {
        budget_key: true,
        period_no: true,
        amount: true,
        gl_mast: { select: { acc_type: true } },
      },
    }),
  ]);

  const hasActual = actualRows.some(row => row.period_no === latestPeriodRow.period_no);
  const hasBudget = new Set(budgetRows.map(row => row.budget_key.toString())).size === 1;
  const data = aggregateProfitLoss(formatRows, actualRows, hasBudget ? budgetRows : [], latestPeriodRow.period_no);
  // A missing month or an ambiguous budget is not a genuine zero result.
  data.notices = [];
  if (!hasActual) data.notices.push("No actual balances are available for this month and business unit. Year-to-date figures may still be available.");
  if (!hasBudget) data.notices.push("A unique budget is unavailable for this selection; budget values and variances are not shown.");
  for (const row of data.rows) {
    if (!hasActual) row.monthToDate = undefined;
    if (!hasBudget) row.budgetMonthToDate = undefined;
    if (!hasActual || !hasBudget) row.variancePct = row.rowType === "H" ? undefined : null;
  }
  return data;
}

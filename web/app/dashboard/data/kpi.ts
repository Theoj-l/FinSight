import "server-only";
import { prisma } from "@/lib/db";
import { aggregateKpis, previousPeriod } from "./kpi-utils";
import type { KpiData } from "./kpi-presentation";

// A shared scope is ready for period, department and budget filters.
export type KpiScope = { period?: number; departmentIds?: string[]; budgetKey?: bigint };
export async function getKpiData(scope: KpiScope = {}): Promise<KpiData | null> {
  const department = scope.departmentIds ? { dept_no: { in: scope.departmentIds } } : {};
  const period = scope.period ?? (await prisma.pbalance.findFirst({ where: department, orderBy: { period_no: "desc" }, select: { period_no: true } }))?.period_no;
  if (period === undefined) return null;
  const periods = [period, previousPeriod(period)];
  const [actual, budgets] = await Promise.all([
    prisma.pbalance.findMany({ where: { ...department, period_no: { in: periods } }, select: { period_no: true, home_dr: true, home_cr: true, gl_mast: { select: { acc_type: true } } } }),
    prisma.budget_pbalance.findMany({ where: { ...department, period_no: { in: periods }, ...(scope.budgetKey !== undefined ? { budget_key: scope.budgetKey } : {}) }, select: { budget_key: true, period_no: true, amount: true, gl_mast: { select: { acc_type: true } } } }),
  ]);
  // Never add alternative budget scenarios together. Each month needs one scenario.
  const uniquePeriods = periods.filter(p => new Set(budgets.filter(row => row.period_no === p).map(row => row.budget_key.toString())).size === 1);
  return aggregateKpis(actual, budgets.filter(row => uniquePeriods.includes(row.period_no)), period);
}

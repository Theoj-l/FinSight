import "server-only";

import { prisma } from "@/lib/db";
import { aggregateRevenueExpense, selectLatestPeriods } from "./revenue-expense-utils";
import type { RevenueExpensePoint } from "./revenue-expense-utils";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";

export type { RevenueExpensePoint } from "./revenue-expense-utils";

export async function getRevenueExpenseData(scope: DashboardScope = {}): Promise<RevenueExpensePoint[]> {
  const department = ledgerDepartment(scope);
  const requestedPeriods = scope.periodStart !== scope.periodEnd ? scope.periodNumbers : scope.trendPeriodNumbers;
  const availablePeriods = requestedPeriods ? requestedPeriods.map(period_no => ({ period_no })) : scope.period === undefined ? await prisma.pbalance.findMany({
    where: department,
    distinct: ["period_no"],
    select: { period_no: true },
  }) : [{ period_no: scope.period }];
  const periodNumbers = requestedPeriods ?? selectLatestPeriods(availablePeriods.map(({ period_no }) => period_no));

  if (periodNumbers.length === 0) return [];

  const rows = await prisma.pbalance.findMany({
    where: {
      ...department,
      period_no: { in: periodNumbers },
      gl_mast: { acc_type: { in: ["RE", "EX"] } },
    },
    select: {
      period_no: true,
      home_dr: true,
      home_cr: true,
      gl_mast: { select: { acc_type: true } },
    },
  });

  return aggregateRevenueExpense(rows);
}

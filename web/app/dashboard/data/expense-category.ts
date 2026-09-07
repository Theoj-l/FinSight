import "server-only";

import { prisma } from "@/lib/db";
import { aggregateExpenseCategories, type ExpenseCategoryPeriod } from "./expense-category-utils";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";
import { previousPeriod } from "./kpi-utils";

export type { ExpenseCategoryPeriod } from "./expense-category-utils";

export async function getExpenseCategoryData(scope: DashboardScope = {}): Promise<ExpenseCategoryPeriod[]> {
  const department = ledgerDepartment(scope);
  const rows = await prisma.pbalance.findMany({
    where: { ...department, ...(scope.period !== undefined ? { period_no: { in: [previousPeriod(scope.period), scope.period] } } : {}), gl_mast: { acc_type: "EX" } },
    orderBy: { period_no: "asc" },
    select: {
      period_no: true,
      home_dr: true,
      home_cr: true,
      gl_mast: { select: { description: true, acc_type: true } },
    },
  });

  const data = aggregateExpenseCategories(rows);
  return scope.period === undefined ? data : data.filter(row => row.periodNo === scope.period);
}

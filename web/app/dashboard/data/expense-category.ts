import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { aggregateExpenseCategories, type ExpenseCategoryPeriod } from "./expense-category-utils";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";
import { previousPeriod } from "./kpi-utils";

export type { ExpenseCategoryPeriod } from "./expense-category-utils";

export async function getExpenseCategoryData(scope: DashboardScope = {}): Promise<ExpenseCategoryPeriod[]> {
  const department = ledgerDepartment(scope);
  const periods = scope.period === undefined ? undefined : [previousPeriod(scope.period), scope.period];

  if (typeof prisma.$queryRaw !== "function") {
    const rows = await prisma.pbalance.findMany({
      where: { ...department, ...(periods ? { period_no: { in: periods } } : {}), gl_mast: { acc_type: "EX" } },
      orderBy: { period_no: "asc" },
      select: { period_no: true, home_dr: true, home_cr: true, gl_mast: { select: { description: true, acc_type: true } } },
    });
    const data = aggregateExpenseCategories(rows);
    return scope.period === undefined ? data : data.filter(row => row.periodNo === scope.period);
  }

  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND p.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const periodSql = periods ? Prisma.sql`AND p.period_no IN (${Prisma.join(periods)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{
    period_no: number;
    description: string | null;
    movement: number;
  }>>(Prisma.sql`
    SELECT p.period_no, g.description,
      SUM(p.home_dr - p.home_cr)::double precision AS movement
    FROM pbalance p
    INNER JOIN gl_mast g ON g.acc_no = p.acc_no
    WHERE g.acc_type = 'EX'
      ${periodSql}
      ${departmentSql}
    GROUP BY p.period_no, g.description
    ORDER BY p.period_no ASC
  `);

  const data = aggregateExpenseCategories(rows.map(row => ({
    period_no: row.period_no,
    home_dr: row.movement,
    home_cr: 0,
    gl_mast: { description: row.description, acc_type: "EX" },
  })));
  return scope.period === undefined ? data : data.filter(row => row.periodNo === scope.period);
}

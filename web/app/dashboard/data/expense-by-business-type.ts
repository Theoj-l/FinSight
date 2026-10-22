import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";
import {
  aggregateExpenseByBusinessType,
  type ExpenseBusinessTypeRow,
  type ExpenseByBusinessTypePeriod,
} from "./expense-by-business-type-utils";

export type { ExpenseByBusinessTypePeriod } from "./expense-by-business-type-utils";

export async function getExpenseByBusinessTypeData(scope: DashboardScope = {}): Promise<ExpenseByBusinessTypePeriod[]> {
  const department = ledgerDepartment(scope);
  const periods = scope.periodStart !== undefined && scope.periodEnd !== undefined && scope.periodStart !== scope.periodEnd
    ? scope.periodNumbers
    : scope.trendPeriodNumbers ?? (scope.period === undefined ? undefined : [scope.period]);

  if (typeof prisma.$queryRaw !== "function") {
    const rows = await prisma.pbalance.findMany({
      where: {
        ...department,
        ...(periods ? { period_no: { in: periods } } : {}),
        gl_mast: { acc_type: "EX" },
      },
      orderBy: { period_no: "asc" },
      select: {
        period_no: true,
        home_dr: true,
        home_cr: true,
        dept: { select: { segment: true } },
      },
    });
    const data = aggregateExpenseByBusinessType(rows.map(row => ({
      period_no: row.period_no,
      segment: row.dept.segment,
      movement: Number(row.home_dr) - Number(row.home_cr),
    })));
    return data;
  }

  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND p.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const periodSql = periods ? Prisma.sql`AND p.period_no IN (${Prisma.join(periods)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<ExpenseBusinessTypeRow[]>(Prisma.sql`
    SELECT p.period_no, d.segment,
      SUM(p.home_dr - p.home_cr)::double precision AS movement
    FROM pbalance p
    INNER JOIN gl_mast g ON g.acc_no = p.acc_no
    INNER JOIN acc_type a ON a.acc_type = g.acc_type
    INNER JOIN dept d ON d.dept_no = p.dept_no
    WHERE a.acc_type = 'EX'
      AND a.description IN ('Expense', 'Operating Expense')
      AND d.segment IN ('Machining', 'Bulk')
      ${periodSql}
      ${departmentSql}
    GROUP BY p.period_no, d.segment
    ORDER BY p.period_no ASC
  `);
  return aggregateExpenseByBusinessType(rows);
}

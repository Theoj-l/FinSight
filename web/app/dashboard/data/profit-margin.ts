import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { selectLatestPeriods } from "./revenue-expense-utils";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";
import { aggregateProfitMargin, type ProfitBalanceRow, type ProfitMarginPoint } from "./profit-margin-utils";

export type { ProfitMarginPoint } from "./profit-margin-utils";

export async function getProfitMarginData(scope: DashboardScope = {}): Promise<ProfitMarginPoint[]> {
  const department = ledgerDepartment(scope);
  const requestedPeriods = scope.periodStart !== scope.periodEnd ? scope.periodNumbers : scope.trendPeriodNumbers;
  const availablePeriods = requestedPeriods ? requestedPeriods.map(period_no => ({ period_no })) : scope.period === undefined ? await prisma.pbalance.findMany({
    where: department,
    distinct: ["period_no"],
    select: { period_no: true },
  }) : [{ period_no: scope.period }];
  const periodNumbers = requestedPeriods ?? selectLatestPeriods(availablePeriods.map(({ period_no }) => period_no));

  if (periodNumbers.length === 0) return [];

  if (typeof prisma.$queryRaw !== "function") {
    const rows = await prisma.pbalance.findMany({
      where: { ...department, period_no: { in: periodNumbers }, gl_mast: { acc_type: { in: ["RE", "OI", "CS", "EX"] } } },
      select: { period_no: true, home_dr: true, home_cr: true, gl_mast: { select: { acc_type: true } } },
    });
    return aggregateProfitMargin(rows as ProfitBalanceRow[]);
  }

  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND p.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{
    period_no: number;
    acc_type: string;
    movement: number;
  }>>(Prisma.sql`
    SELECT p.period_no, g.acc_type,
      SUM(p.home_dr - p.home_cr)::double precision AS movement
    FROM pbalance p
    INNER JOIN gl_mast g ON g.acc_no = p.acc_no
    WHERE p.period_no IN (${Prisma.join(periodNumbers)})
      AND g.acc_type IN ('RE', 'OI', 'CS', 'EX')
      ${departmentSql}
    GROUP BY p.period_no, g.acc_type
    ORDER BY p.period_no ASC
  `);

  return aggregateProfitMargin(rows.map(row => ({
    period_no: row.period_no,
    home_dr: row.movement,
    home_cr: 0,
    gl_mast: { acc_type: row.acc_type },
  })) as ProfitBalanceRow[]);
}

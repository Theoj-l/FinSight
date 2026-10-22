import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";
import { aggregateProfitYoyComparison, getComparisonPeriods, type ProfitYoyComparison } from "./profit-yoy-comparison-utils";

export type { ProfitYoyComparison } from "./profit-yoy-comparison-utils";

export async function getProfitYoyComparisonData(scope: DashboardScope = {}): Promise<ProfitYoyComparison> {
  const department = ledgerDepartment(scope);
  const endPeriod = scope.periodEnd ?? scope.period;
  const latestPeriod = endPeriod === undefined
    ? await prisma.pbalance.findFirst({ where: department, orderBy: { period_no: "desc" }, select: { period_no: true } })
    : { period_no: endPeriod };
  if (!latestPeriod) {
    return aggregateProfitYoyComparison([], 0);
  }

  const { current, prior } = getComparisonPeriods(latestPeriod.period_no);
  const periodNumbers = [...current, ...prior];
  if (typeof prisma.$queryRaw !== "function") {
    const rows = await prisma.pbalance.findMany({
      where: { ...department, period_no: { in: periodNumbers }, gl_mast: { acc_type: { in: ["RE", "OI", "CS", "EX"] } } },
      select: { period_no: true, home_dr: true, home_cr: true, gl_mast: { select: { acc_type: true } } },
    });
    return aggregateProfitYoyComparison(rows.map(row => ({
      period_no: row.period_no,
      acc_type: row.gl_mast.acc_type,
      movement: Number(row.home_dr) - Number(row.home_cr),
    })), latestPeriod.period_no);
  }

  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND p.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ period_no: number; acc_type: string; movement: number }>>(Prisma.sql`
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
  return aggregateProfitYoyComparison(rows, latestPeriod.period_no);
}

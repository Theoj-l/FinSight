import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  aggregateRevenueByBusinessType,
  VALID_SEGMENTS,
  type BusinessTypeRevenueRow,
  type RevenueByBusinessTypePoint,
} from "./revenue-by-business-type-utils";
import { invoiceWhere, type DashboardScope } from "./dashboard-scope";

export type { RevenueByBusinessTypePoint } from "./revenue-by-business-type-utils";

export async function getRevenueByBusinessTypeData(
  scope: DashboardScope = {}
): Promise<RevenueByBusinessTypePoint[]> {
  if (typeof prisma.$queryRaw !== "function") {
    const rows = await prisma.iv_dtl.findMany({
      where: {
        AND: [
          invoiceWhere(scope),
          { iv: { cancelled: false } },
        ],
      },
      select: {
        local_sub_total: true,
        dept: {
          select: {
            segment: true,
          },
        },
      },
    });

    return aggregateRevenueByBusinessType(
      rows.map((row) => ({
        segment: row.dept?.segment,
        revenue: row.local_sub_total,
      }))
    );
  }

  const start = scope.periodStart ?? scope.period;
  const end = scope.periodEnd ?? scope.period;
  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND dtl.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const branchSql = scope.branchCodes?.length
    ? Prisma.sql`AND iv.branch_code IN (${Prisma.join(scope.branchCodes)})`
    : scope.branchCode
      ? Prisma.sql`AND iv.branch_code = ${scope.branchCode}`
      : Prisma.empty;
  const dateSql =
    start !== undefined && end !== undefined
      ? Prisma.sql`AND iv.doc_date >= ${new Date(Date.UTC(Math.floor(start / 100), (start % 100) - 1, 1))}
        AND iv.doc_date < ${new Date(Date.UTC(Math.floor(end / 100), end % 100, 1))}`
      : Prisma.empty;

  const segmentSql = Prisma.join(
    VALID_SEGMENTS.map((s) => Prisma.sql`${s}`)
  );

  const rows = await prisma.$queryRaw<BusinessTypeRevenueRow[]>(Prisma.sql`
    SELECT
      d.segment AS "segment",
      SUM(dtl.local_sub_total)::double precision AS revenue
    FROM iv_dtl dtl
    INNER JOIN iv ON iv.doc_key = dtl.doc_key
    INNER JOIN dept d ON d.dept_no = dtl.dept_no
    WHERE iv.cancelled = false
      AND d.segment IN (${segmentSql})
      ${dateSql}
      ${departmentSql}
      ${branchSql}
    GROUP BY d.segment
    ORDER BY revenue DESC
  `);

  return aggregateRevenueByBusinessType(rows);
}
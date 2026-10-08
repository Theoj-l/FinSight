import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { aggregateRevenueByGroup, type RevenueByGroupPoint } from "./revenue-by-group-utils";
import { invoiceWhere, type DashboardScope } from "./dashboard-scope";

export type { RevenueByGroupPoint } from "./revenue-by-group-utils";

export async function getRevenueByGroupData(scope: DashboardScope = {}): Promise<RevenueByGroupPoint[]> {
  if (typeof prisma.$queryRaw !== "function") {
    const rows = await prisma.iv_dtl.findMany({
      where: invoiceWhere(scope),
      select: {
        local_sub_total: true,
        iv: { select: { cancelled: true } },
        item: { select: { item_group: true, item_group_item_item_groupToitem_group: { select: { item_group: true, description: true } } } },
      },
    });
    return aggregateRevenueByGroup(rows);
  }

  const start = scope.periodStart ?? scope.period;
  const end = scope.periodEnd ?? scope.period;
  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND d.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const dateSql = start !== undefined && end !== undefined
    ? Prisma.sql`AND iv.doc_date >= ${new Date(Date.UTC(Math.floor(start / 100), start % 100 - 1, 1))}
      AND iv.doc_date < ${new Date(Date.UTC(Math.floor(end / 100), end % 100, 1))}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{
    group_id: string | null;
    group_label: string | null;
    revenue: number;
  }>>(Prisma.sql`
    SELECT ig.item_group AS group_id, ig.description AS group_label,
      SUM(d.local_sub_total)::double precision AS revenue
    FROM iv_dtl d
    INNER JOIN iv ON iv.doc_key = d.doc_key
    LEFT JOIN item i ON i.item_code = d.item_code
    LEFT JOIN item_group ig ON ig.item_group = i.item_group
    WHERE iv.cancelled = false
      ${dateSql}
      ${departmentSql}
    GROUP BY ig.item_group, ig.description
    ORDER BY revenue DESC
  `);

  return aggregateRevenueByGroup(rows.map(row => ({
    local_sub_total: row.revenue,
    iv: { cancelled: false },
    item: row.group_id || row.group_label ? {
      item_group: row.group_id,
      item_group_item_item_groupToitem_group: row.group_id
        ? { item_group: row.group_id, description: row.group_label }
        : null,
    } : null,
  })));
}

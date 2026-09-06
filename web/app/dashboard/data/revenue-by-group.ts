import "server-only";

import { prisma } from "@/lib/db";
import { aggregateRevenueByGroup, type RevenueByGroupPoint } from "./revenue-by-group-utils";

export type { RevenueByGroupPoint } from "./revenue-by-group-utils";

export async function getRevenueByGroupData(): Promise<RevenueByGroupPoint[]> {
  const rows = await prisma.iv_dtl.findMany({
    where: { iv: { cancelled: false } },
    select: {
      local_sub_total: true,
      iv: { select: { cancelled: true } },
      item: {
        select: {
          item_group: true,
          item_group_item_item_groupToitem_group: {
            select: { item_group: true, description: true },
          },
        },
      },
    },
  });

  return aggregateRevenueByGroup(rows);
}
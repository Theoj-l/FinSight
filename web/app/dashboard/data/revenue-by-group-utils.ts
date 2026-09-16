export const UNCATEGORIZED_GROUP_ID = "uncategorized";
export const UNCATEGORIZED_GROUP_LABEL = "Uncategorized";

export type RevenueByGroupPoint = {
  groupId: string;
  groupLabel: string;
  revenue: number;
  percentage: number;
};

export type InvoiceDetailRow = {
  local_sub_total: number | string | { toNumber(): number };
  iv: { cancelled: boolean };
  item: {
    item_group: string | null;
    item_group_item_item_groupToitem_group: {
      item_group: string;
      description: string | null;
    } | null;
  } | null;
};

function decimalToNumber(value: InvoiceDetailRow["local_sub_total"]) {
  return typeof value === "object" ? value.toNumber() : Number(value);
}

export { formatCurrencyExact } from "@/lib/currency";

export function aggregateRevenueByGroup(rows: InvoiceDetailRow[]): RevenueByGroupPoint[] {
  const totals = new Map<string, { groupLabel: string; revenue: number }>();

  for (const row of rows) {
    if (row.iv.cancelled) continue;

    const group = row.item?.item_group_item_item_groupToitem_group;
    const groupId = group?.item_group ?? UNCATEGORIZED_GROUP_ID;
    const groupLabel = group?.description || UNCATEGORIZED_GROUP_LABEL;
    const total = totals.get(groupId) ?? { groupLabel, revenue: 0 };
    total.revenue += decimalToNumber(row.local_sub_total);
    totals.set(groupId, total);
  }

  const totalRevenue = [...totals.values()].reduce((sum, group) => sum + group.revenue, 0);

  return [...totals.entries()]
    .map(([groupId, group]) => ({
      groupId,
      groupLabel: group.groupLabel,
      revenue: group.revenue,
      percentage: totalRevenue === 0 ? 0 : (group.revenue / totalRevenue) * 100,
    }))
    .sort((first, second) => second.revenue - first.revenue);
}
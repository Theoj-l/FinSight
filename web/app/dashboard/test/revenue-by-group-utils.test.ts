import { describe, expect, it } from "vitest";
import { aggregateRevenueByGroup } from "../data/revenue-by-group-utils";

const group = (item_group: string, description: string | null) => ({
  item_group,
  item_group_item_item_groupToitem_group: { item_group, description },
});

describe("revenue by group utilities", () => {
  it("excludes cancelled invoices", () => {
    expect(aggregateRevenueByGroup([
      { local_sub_total: 100, iv: { cancelled: false }, item: group("A", "Alpha") },
      { local_sub_total: 900, iv: { cancelled: true }, item: group("B", "Beta") },
    ])).toEqual([{ groupId: "A", groupLabel: "Alpha", revenue: 100, percentage: 100 }]);
  });

  it("uses Uncategorized when the item or group is missing", () => {
    expect(aggregateRevenueByGroup([
      { local_sub_total: 50, iv: { cancelled: false }, item: null },
      { local_sub_total: 25, iv: { cancelled: false }, item: { item_group: null, item_group_item_item_groupToitem_group: null } },
      { local_sub_total: 25, iv: { cancelled: false }, item: group("A", null) },
    ])).toEqual([
      { groupId: "uncategorized", groupLabel: "Uncategorized", revenue: 75, percentage: 75 },
      { groupId: "A", groupLabel: "Uncategorized", revenue: 25, percentage: 25 },
    ]);
  });

  it("calculates percentages that total 100 and sorts by descending revenue", () => {
    const result = aggregateRevenueByGroup([
      { local_sub_total: 25, iv: { cancelled: false }, item: group("A", "Alpha") },
      { local_sub_total: 75, iv: { cancelled: false }, item: group("B", "Beta") },
    ]);

    expect(result).toEqual([
      { groupId: "B", groupLabel: "Beta", revenue: 75, percentage: 75 },
      { groupId: "A", groupLabel: "Alpha", revenue: 25, percentage: 25 },
    ]);
    expect(result.reduce((sum, entry) => sum + entry.percentage, 0)).toBe(100);
  });
});
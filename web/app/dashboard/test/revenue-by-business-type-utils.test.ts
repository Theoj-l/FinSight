import { describe, expect, it } from "vitest";
import { aggregateRevenueByBusinessType } from "../data/revenue-by-business-type-utils";

describe("revenue by business type utilities", () => {
  it("aggregates Machining and Bulk segments and calculates percentages sorted by revenue", () => {
    const result = aggregateRevenueByBusinessType([
      { segment: "Machining", revenue: 250 },
      { segment: "Bulk", revenue: 750 },
    ]);

    expect(result).toEqual([
      { segment: "Bulk", businessType: "Bulk", revenue: 750, percentage: 75 },
      { segment: "Machining", businessType: "Machining", revenue: 250, percentage: 25 },
    ]);
  });

  it("excludes segments with zero or negative revenue entirely", () => {
    const result = aggregateRevenueByBusinessType([
      { segment: "Machining", revenue: 0 },
      { segment: "Bulk", revenue: 100 },
    ]);

    expect(result).toEqual([
      { segment: "Bulk", businessType: "Bulk", revenue: 100, percentage: 100 },
    ]);
    expect(result.some((entry) => entry.segment === "Machining")).toBe(false);
  });

  it("handles Decimal objects with toNumber method", () => {
    const result = aggregateRevenueByBusinessType([
      { segment: "Machining", revenue: { toNumber: () => 400 } },
      { segment: "Bulk", revenue: { toNumber: () => 600 } },
    ]);

    expect(result).toEqual([
      { segment: "Bulk", businessType: "Bulk", revenue: 600, percentage: 60 },
      { segment: "Machining", businessType: "Machining", revenue: 400, percentage: 40 },
    ]);
  });

  it("ignores segments other than Machining and Bulk", () => {
    const result = aggregateRevenueByBusinessType([
      { segment: "Machining", revenue: 500 },
      { segment: "OtherSegment", revenue: 200 },
      { segment: null, revenue: 100 },
    ]);

    expect(result).toEqual([
      { segment: "Machining", businessType: "Machining", revenue: 500, percentage: 100 },
    ]);
  });

  it("returns an empty array when all segment revenues are zero or negative", () => {
    expect(aggregateRevenueByBusinessType([
      { segment: "Machining", revenue: 0 },
      { segment: "Bulk", revenue: -50 },
    ])).toEqual([]);

    expect(aggregateRevenueByBusinessType([])).toEqual([]);
  });

  it("supports businessType property alias for compatibility", () => {
    const result = aggregateRevenueByBusinessType([
      { businessType: "Machining", revenue: 300 },
      { businessType: "Bulk", revenue: 700 },
    ]);

    expect(result).toEqual([
      { segment: "Bulk", businessType: "Bulk", revenue: 700, percentage: 70 },
      { segment: "Machining", businessType: "Machining", revenue: 300, percentage: 30 },
    ]);
  });
});
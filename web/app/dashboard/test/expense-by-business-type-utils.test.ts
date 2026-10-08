import { describe, expect, it } from "vitest";
import { aggregateExpenseByBusinessType } from "../data/expense-by-business-type-utils";

describe("expense by business type utilities", () => {
  it("returns a 100% stack while preserving dollar totals", () => {
    const data = aggregateExpenseByBusinessType([
      { period_no: 202401, segment: "Machining", movement: 25 },
      { period_no: 202401, segment: "Bulk", movement: 75 },
    ]);

    expect(data[0]).toMatchObject({
      machiningAmount: 25,
      bulkAmount: 75,
      totalOpex: 100,
      machiningPct: 25,
      bulkPct: 75,
    });
  });

  it("keeps zero-valued segments in the period", () => {
    const data = aggregateExpenseByBusinessType([
      { period_no: 202401, segment: "Machining", movement: 0 },
      { period_no: 202401, segment: "Bulk", movement: 40 },
    ]);

    expect(data[0].machiningPct).toBe(0);
    expect(data[0].bulkPct).toBe(100);
    expect(data[0].machiningAmount).toBe(0);
  });
});

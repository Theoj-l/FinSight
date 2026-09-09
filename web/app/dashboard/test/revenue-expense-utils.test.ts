import { describe, expect, it } from "vitest";
import {
  aggregateRevenueExpense,
  formatCurrencyCompact,
  formatCurrencyExact,
  selectLatestPeriods,
} from "../data/revenue-expense-utils";

describe("revenue expense utilities", () => {
  it("selects the latest six periods and returns them newest first for querying", () => {
    expect(selectLatestPeriods([202401, 202406, 202402, 202406, 202403, 202407, 202408])).toEqual([
      202408, 202407, 202406, 202403, 202402, 202401,
    ]);
  });

  it("aggregates RE and EX using account nature and ignores other account types", () => {
    expect(aggregateRevenueExpense([
      { period_no: 202402, home_dr: 100, home_cr: 600, gl_mast: { acc_type: "RE" } },
      { period_no: 202402, home_dr: 300, home_cr: 50, gl_mast: { acc_type: "EX" } },
      { period_no: 202401, home_dr: 1, home_cr: 99, gl_mast: { acc_type: "OI" } },
    ])).toEqual([
      { period: "2024-01", revenue: 0, expenses: 0 },
      { period: "2024-02", revenue: 500, expenses: 250 },
    ]);
  });

  it("formats compact axis values and exact tooltip values", () => {
    expect(formatCurrencyCompact(12500)).toBe("$13k");
    expect(formatCurrencyExact(12500.5)).toBe("$12,500.50");
  });
});

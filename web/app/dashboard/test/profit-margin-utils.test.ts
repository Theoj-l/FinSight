import { describe, expect, it } from "vitest";
import { aggregateProfitMargin } from "../data/profit-margin-utils";

describe("profit margin utilities", () => {
  it("calculates net profit and margin from classified balances", () => {
    expect(aggregateProfitMargin([
      { period_no: 202402, home_dr: 100, home_cr: 1100, gl_mast: { acc_type: "RE" } },
      { period_no: 202402, home_dr: 50, home_cr: 150, gl_mast: { acc_type: "OI" } },
      { period_no: 202402, home_dr: 300, home_cr: 0, gl_mast: { acc_type: "CS" } },
      { period_no: 202402, home_dr: 200, home_cr: 0, gl_mast: { acc_type: "EX" } },
    ])).toEqual([{ period: "2024-02", periodNo: 202402, grossProfit: 700, grossMarginPct: 70, netProfit: 600, netMarginPct: 60 }]);
  });

  it("supports negative profit", () => {
    expect(aggregateProfitMargin([
      { period_no: 202401, home_dr: 0, home_cr: 100, gl_mast: { acc_type: "RE" } },
      { period_no: 202401, home_dr: 150, home_cr: 0, gl_mast: { acc_type: "EX" } },
    ])).toEqual([{ period: "2024-01", periodNo: 202401, grossProfit: 100, grossMarginPct: 100, netProfit: -50, netMarginPct: -50 }]);
  });

  it("returns a null margin when revenue is zero", () => {
    expect(aggregateProfitMargin([
      { period_no: 202403, home_dr: 100, home_cr: 0, gl_mast: { acc_type: "EX" } },
    ])).toEqual([{ period: "2024-03", periodNo: 202403, grossProfit: 0, grossMarginPct: null, netProfit: -100, netMarginPct: null }]);
  });

  it("orders periods chronologically", () => {
    expect(aggregateProfitMargin([
      { period_no: 202406, home_dr: 0, home_cr: 100, gl_mast: { acc_type: "RE" } },
      { period_no: 202401, home_dr: 0, home_cr: 200, gl_mast: { acc_type: "RE" } },
    ]).map(({ period }) => period)).toEqual(["2024-01", "2024-06"]);
  });
});
it("withholds gross margin for negative revenue", () => {
  expect(aggregateProfitMargin([{ period_no: 202401, home_dr: 100, home_cr: 0, gl_mast: { acc_type: "RE" } }])[0].grossMarginPct).toBeNull();
});

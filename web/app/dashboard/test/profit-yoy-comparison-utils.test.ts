import { describe, expect, it } from "vitest";
import { aggregateProfitYoyComparison, getComparisonPeriods, shiftPeriod } from "../data/profit-yoy-comparison-utils";

describe("profit year-over-year comparison utilities", () => {
  it("handles calendar boundaries", () => {
    expect(shiftPeriod(202601, -2)).toBe(202511);
    expect(getComparisonPeriods(202601)).toEqual({ current: [202511, 202512, 202601], prior: [202411, 202412, 202501] });
  });

  it("calculates monthly and total profit with the existing sign convention", () => {
    const rows = [202401, 202402, 202403].flatMap(period_no => [
      { period_no, acc_type: "RE", movement: -1000 },
      { period_no, acc_type: "OI", movement: -100 },
      { period_no, acc_type: "CS", movement: 250 },
      { period_no, acc_type: "EX", movement: 150 },
    ]);
    const priorRows = [202301, 202302, 202303].map(period_no => ({ period_no, acc_type: "RE", movement: -800 }));
    const result = aggregateProfitYoyComparison([...rows, ...priorRows], 202403);
    expect(result.points.map(point => [point.currentProfit, point.priorProfit])).toEqual([[700, 800], [700, 800], [700, 800]]);
    expect(result.currentTotal).toBe(2100);
    expect(result.priorTotal).toBe(2400);
    expect(result.absoluteChange).toBe(-300);
    expect(result.percentageChange).toBe(-12.5);
  });

  it("does not convert missing periods to zero", () => {
    const result = aggregateProfitYoyComparison([{ period_no: 202403, acc_type: "RE", movement: -100 }], 202403);
    expect(result.complete).toBe(false);
    expect(result.points[2].currentProfit).toBe(100);
    expect(result.points[0].currentProfit).toBeNull();
    expect(result.currentTotal).toBeNull();
  });

  it("returns no percentage for a zero prior-year total", () => {
    const rows = [202401, 202402, 202403].flatMap(period_no => [
      { period_no, acc_type: "RE", movement: -100 },
      { period_no, acc_type: "EX", movement: 50 },
      { period_no: period_no - 100, acc_type: "RE", movement: 0 },
    ]);
    const result = aggregateProfitYoyComparison(rows, 202403);
    expect(result.priorTotal).toBe(0);
    expect(result.absoluteChange).toBe(150);
    expect(result.percentageChange).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { compareValues, valuesFrom } from "./engine";
import { bundleMonths, pnlMonthRows, pnlTrend } from "./pnl-months";
import { defaultRules, type FinancialBundle, type SourceSeries } from "./types";
import { financialFixture } from "@/tests/fixtures/financial";

/** A bundle whose "previous month" series runs Jun → Aug with known actuals. */
function bundle(): FinancialBundle {
  const b = financialFixture();
  const months: [number, Parameters<typeof valuesFrom>[0], Parameters<typeof valuesFrom>[0]][] = [
    [202606, { RE: "100", CS: "60", OI: "0", EX: "20" }, { RE: "90", CS: "50", OI: "0", EX: "20" }],
    [202607, { RE: "120", CS: "70", OI: "0", EX: "20" }, { RE: "100", CS: "60", OI: "0", EX: "20" }],
    [202608, { RE: "110", CS: "80", OI: "0", EX: "20" }, { RE: "120", CS: "70", OI: "0", EX: "20" }],
  ];
  const previous: SourceSeries = {};
  for (const [period, actual, prior] of months) previous[period] = { period, metrics: compareValues(valuesFrom(actual), valuesFrom(prior), defaultRules()), provenance: [] };
  return { ...b, sources: { ...b.sources, previous } };
}

describe("P&L month by month", () => {
  it("lists the bundle's months oldest first", () => {
    expect(bundleMonths(bundle())).toEqual([202606, 202607, 202608]);
  });

  it("gives each month's actual and its change from the month before, toned by whether the change is good", () => {
    const [revenue, cost] = pnlMonthRows(bundle(), ["revenue", "costOfSales"]);
    expect(revenue.label).toBe("Operating revenue");
    expect(revenue.cells.map(cell => [cell.period, cell.actual, cell.tone])).toEqual([[202606, "100", "favourable"], [202607, "120", "favourable"], [202608, "110", "unfavourable"]]);
    expect(revenue.cells[2].percentage).toBeCloseTo(-8.333, 2);
    // Costs rising is unfavourable.
    expect(cost.cells.map(cell => cell.tone)).toEqual(["unfavourable", "unfavourable", "unfavourable"]);
  });

  it("marks missing months and flat changes", () => {
    const rows = pnlMonthRows(bundle(), ["otherIncome"], [202605, 202606]);
    expect(rows[0].cells[0]).toMatchObject({ period: 202605, actual: null, tone: "none" });
    expect(rows[0].cells[1].tone).toBe("flat");
  });

  it("builds trend points with total expenses as cost of sales plus operating expenses", () => {
    expect(pnlTrend(bundle())).toEqual([
      { period: 202606, label: "2026-06", revenue: 100, totalExpenses: 80, grossProfit: 40, netProfit: 20 },
      { period: 202607, label: "2026-07", revenue: 120, totalExpenses: 90, grossProfit: 50, netProfit: 30 },
      { period: 202608, label: "2026-08", revenue: 110, totalExpenses: 100, grossProfit: 30, netProfit: 10 },
    ]);
  });
});

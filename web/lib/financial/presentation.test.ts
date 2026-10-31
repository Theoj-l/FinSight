import { describe, expect, it } from "vitest";
import { financialFixture } from "@/tests/fixtures/financial";
import { compareValues, valuesFrom } from "./engine";
import { comparisonKpis, totalExpensesComparison } from "./presentation";
import { financialAlerts } from "./alerts";
import { defaultRules } from "./types";

function point(actual: Parameters<typeof valuesFrom>[0], reference: Parameters<typeof valuesFrom>[0], rules = defaultRules()) {
  return { period: 202608, metrics: compareValues(valuesFrom(actual), valuesFrom(reference), rules), provenance: [] };
}

describe("total expenses card", () => {
  it("adds cost of sales and operating expenses exactly, and an increase is unfavourable", () => {
    const rules = defaultRules();
    const c = totalExpensesComparison(point({ RE: "100", CS: "4267209.1001", OI: "0", EX: "849850.7202" }, { RE: "100", CS: "3935787.4500", OI: "0", EX: "837432.2100" }, rules), rules);
    expect(c.actual).toBe("5117059.8203");
    expect(c.reference).toBe("4773219.6600");
    expect(c.absolute).toBe("343840.1603");
    expect(c.percentage).toBeCloseTo(7.2036, 3);
    expect(c.unfavorable).toBe(true);
    expect(c.breach).toBe(true);
  });

  it("uses the stricter of the two expense thresholds, among those enabled", () => {
    const rules = defaultRules();
    rules.costOfSales = { enabled: true, tolerance: 20 };
    rules.operatingExpenses = { enabled: true, tolerance: 5 };
    const p = point({ RE: "0", CS: "100", OI: "0", EX: "10" }, { RE: "0", CS: "95", OI: "0", EX: "10" }, rules);
    expect(totalExpensesComparison(p, rules)).toMatchObject({ tolerance: 5, breach: false, unfavorable: true }); // +4.8%
    rules.operatingExpenses = { enabled: false, tolerance: 5 };
    expect(totalExpensesComparison(p, rules)).toMatchObject({ tolerance: 20, enabled: true });
    rules.costOfSales = { enabled: false, tolerance: 20 };
    expect(totalExpensesComparison(p, rules)).toMatchObject({ enabled: false, breach: false });
  });

  it("is unavailable when either part is missing", () => {
    const rules = defaultRules();
    const p = point({ RE: "1", CS: "1", OI: "0", EX: "1" }, { RE: "1", CS: "1", OI: "0", EX: "1" }, rules);
    p.metrics.operatingExpenses = { ...p.metrics.operatingExpenses, reference: null };
    expect(totalExpensesComparison(p, rules)).toMatchObject({ reference: null, absolute: null, breach: false });
  });

  it("is a headline card with its breakdown, but raises no notification of its own", () => {
    const bundle = financialFixture();
    const data = comparisonKpis(bundle, "previous");
    const total = data.metrics.find(m => m.id === "totalExpenses")!;
    expect(data.metrics.map(m => m.id)).toEqual(["revenue", "totalExpenses", "grossProfit", "netProfit", "grossMargin", "netMargin", "expenseRatio"]);
    expect(total).toMatchObject({ unit: "money", higherIsBetter: false, value: "30.0000" });
    expect(total.breakdown).toEqual([{ label: "Cost of sales", value: "20" }, { label: "Operating expenses", value: "10" }]);
    expect(financialAlerts(data).some(alert => alert.metric.id === "totalExpenses")).toBe(false);
  });
});

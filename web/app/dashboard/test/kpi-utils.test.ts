import { describe, expect, it } from "vitest";
import { aggregateKpis, previousPeriod, type KpiBalance, type KpiBudget } from "../data/kpi-utils";
import { defaultThresholds, formatAmount, formatPercentage, needsAttention, outcome, validThresholds } from "../data/kpi-presentation";

const row = (period_no: number, acc_type: string, home_dr: string, home_cr: string): KpiBalance => ({ period_no, home_dr, home_cr, gl_mast: { acc_type } });
const budget = (period_no: number, acc_type: string, amount: string): KpiBudget => ({ period_no, amount, gl_mast: { acc_type } });
describe("KPI aggregation", () => {
  it("reconciles all financial cards, budget comparisons and ratios", () => {
    const data = aggregateKpis([
      row(202401, "RE", "10", "1010"), row(202401, "CS", "400", "0"), row(202401, "EX", "250", "0"), row(202401, "OI", "0", "50"),
      row(202402, "RE", "20", "1220"), row(202402, "CS", "500", "0"), row(202402, "EX", "200", "0"), row(202402, "OI", "0", "100"),
      row(202402, "AS", "99999", "0"), row(202403, "RE", "0", "99999"),
    ], [budget(202401, "RE", "-300"), budget(202402, "RE", "-500")], 202402);
    expect(data.metrics.map(m => m.value)).toEqual(["1200.00", "700.00", "600.00", "100.00", "58.33", "50.00"]);
    expect(data.metrics[0].change).toEqual({ absolute: "200.00", percentage: 20, direction: 1 });
    expect(data.metrics[3].change).toEqual({ absolute: "0.00", percentage: 0, direction: 0 });
    expect(data.metrics[3].budgetComparison).toEqual({ absolute: "100.00", percentage: 20, direction: 1 });
    expect(data.notices).toEqual([]);
  });
  it("sums four-decimal database values before rounding and preserves large cents", () => {
    const data = aggregateKpis([row(202402, "RE", "0", "999999999999999.0049"), row(202402, "RE", "0", "0.0049")], [], 202402);
    expect(data.metrics[0].value).toBe("999999999999999.01");
    expect(formatAmount(data.metrics[0].value!, "money")).toBe("S$999,999,999,999,999.01");
  });
  it("uses December for January and does not substitute an older available month", () => {
    expect(previousPeriod(202401)).toBe(202312);
    expect(() => previousPeriod(202413)).toThrow();
    const data = aggregateKpis([row(202311, "RE", "0", "100"), row(202401, "RE", "0", "200")], [], 202401);
    expect(data.priorPeriod).toBe("2023-12");
    expect(data.metrics[0].change).toBeNull();
  });
  it("distinguishes absent data from actual zero and zero baselines", () => {
    const data = aggregateKpis([row(202401, "RE", "0", "0"), row(202402, "RE", "0", "10")], [], 202402);
    expect(data.metrics[0].change).toEqual({ absolute: "10.00", percentage: null, direction: 1 });
    expect(data.metrics[3].value).toBeNull();
    expect(data.metrics[4].change).toBeNull();
    const zeros = aggregateKpis([row(202401, "RE", "0", "0"), row(202402, "RE", "0", "0")], [], 202402);
    expect(zeros.metrics[0].change).toEqual({ absolute: "0.00", percentage: 0, direction: 0 });
    expect(zeros.metrics[4].value).toBeNull();
    expect(aggregateKpis([], [], 202402).metrics.every(m => m.value === null)).toBe(true);
  });
  it("uses absolute negative baselines for loss improvements", () => {
    const data = aggregateKpis([row(202401, "EX", "100", "0"), row(202402, "EX", "50", "0")], [], 202402);
    expect(data.metrics[2].change).toEqual({ absolute: "50.00", percentage: 50, direction: 1 });
  });
});
describe("KPI indicators and settings", () => {
  it("keeps mathematical direction separate from business outcome", () => {
    expect(outcome(1)).toBe("favorable");
    expect(outcome(-1)).toBe("unfavorable");
    expect(outcome(-1, false)).toBe("favorable");
    expect(outcome(1, false)).toBe("unfavorable");
    expect(outcome(0)).toBe("neutral");
    expect(formatPercentage(0)).toBe("0.0%");
    expect(formatPercentage(-0)).toBe("0.0%");
    expect(formatPercentage(0.001)).toBe("+<0.1%");
    expect(formatPercentage(-0.001)).toBe("−<0.1%");
  });
  it("flags every nonzero variance by default with inclusive configurable bounds", () => {
    const defaults = defaultThresholds();
    expect(needsAttention(0, defaults.revenue)).toBe(false);
    expect(needsAttention(0.0001, defaults.revenue)).toBe(true);
    expect(needsAttention(-0.0001, defaults.revenue)).toBe(true);
    expect(needsAttention(null, defaults.revenue)).toBe(false);
    const limits = { enabled: true, min: -5, max: 10 };
    expect(needsAttention(-5, limits)).toBe(false);
    expect(needsAttention(10, limits)).toBe(false);
    expect(needsAttention(10.01, limits)).toBe(true);
    expect(needsAttention(-6, { ...limits, enabled: false })).toBe(false);
    expect(validThresholds(defaults)).toBe(true);
    expect(validThresholds({ ...defaults, revenue: { enabled: true, min: 10, max: -10 } })).toBe(false);
    expect(validThresholds({ ...defaults, revenue: { enabled: true, min: "0", max: 0 } })).toBe(false);
    expect(validThresholds({})).toBe(false);
  });
});

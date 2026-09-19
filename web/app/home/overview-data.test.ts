import { describe, expect, it } from "vitest";
import { defaultThresholds, type KpiData, type KpiMetric } from "@/app/dashboard/data/kpi-presentation";
import { reportingMonth, reportingStatus, thresholdAlerts, timestamp } from "./overview-data";

const metric: KpiMetric = { id: "netProfit", label: "Net profit", value: "80.00", prior: "100.00", unit: "money", description: "Profit", change: { absolute: "-20.00", percentage: -20, direction: -1 } };
const data: KpiData = { period: "2026-08", priorPeriod: "2026-07", metrics: [metric], notices: [] };

describe("Home threshold alerts", () => {
  it("uses inclusive dashboard limits, excludes disabled and unavailable checks", () => {
    const thresholds = defaultThresholds();
    thresholds.netProfit = { enabled: true, min: -20, max: 10 };
    expect(thresholdAlerts(data, thresholds)).toHaveLength(0);
    thresholds.netProfit.min = -10;
    expect(thresholdAlerts(data, thresholds)[0]).toMatchObject({ favorable: false, side: "below", value: -20 });
    thresholds.netProfit.enabled = false;
    expect(thresholdAlerts(data, thresholds)).toHaveLength(0);
    expect(thresholdAlerts({ ...data, metrics: [{ ...metric, value: null }] }, defaultThresholds())).toHaveLength(0);
    expect(thresholdAlerts({ ...data, metrics: [{ ...metric, change: { ...metric.change!, percentage: null } }] }, defaultThresholds())).toHaveLength(0);
  });

  it("checks budget variance against budget, excluding favorable movements", () => {
    const result = thresholdAlerts({ ...data, metrics: [
      { ...metric, id: "revenue", change: { absolute: "20", direction: 1, percentage: 20 } },
      { ...metric, id: "budgetVariance", change: { absolute: "20", direction: 1, percentage: 20 }, budgetComparison: { absolute: "-10", direction: -1, percentage: -10 } },
      { ...metric, id: "expenseRatio", higherIsBetter: false },
    ] }, defaultThresholds());
    expect(result.map(alert => [alert.metric.id, alert.favorable, alert.value])).toEqual([
      ["budgetVariance", false, -10],
    ]);
  });

  it("keeps alert identity on refresh and differentiates reporting months and limits", () => {
    const thresholds = defaultThresholds();
    const id = thresholdAlerts(data, thresholds)[0].id;
    expect(thresholdAlerts({ ...data, metrics: [{ ...metric, change: { ...metric.change!, percentage: -25 } }] }, thresholds)[0].id).toBe(id);
    expect(thresholdAlerts({ ...data, period: "2026-09" }, thresholds)[0].id).not.toBe(id);
    thresholds.netProfit.min = -10;
    expect(thresholdAlerts(data, thresholds)[0].id).not.toBe(id);
  });
});

describe("notification dates", () => {
  it("formats dates consistently in Singapore and labels current, historical and future data", () => {
    expect(reportingMonth("2026-08")).toBe("Aug 2026");
    expect(timestamp("2026-09-18T18:30:00Z")).toBe("19 Sep 2026, 02:30 SGT");
    expect(reportingStatus("2026-09", "2026-08-31T18:30:00Z")).toContain("incomplete");
    expect(reportingStatus("2026-12", "2026-09-19T00:00:00Z")).toContain("Future");
    expect(reportingStatus("2026-07", "2026-09-19T00:00:00Z")).toContain("Historical");
    expect(reportingStatus("2025-12", "2026-01-19T00:00:00Z")).toContain("Monthly ledger totals");
  });

  it("uses a fixed September label and punctuation for the reported hydration failure", () => {
    expect(timestamp("2026-09-19T07:39:21.581Z")).toBe("19 Sep 2026, 15:39 SGT");
    expect(reportingMonth("2026-09")).toBe("Sep 2026");
  });

  it.each([
    ["2026-12-31T16:00:00Z", "01 Jan 2027, 00:00 SGT"],
    ["2024-02-29T16:05:00Z", "01 Mar 2024, 00:05 SGT"],
    ["2026-09-19T15:39:21.581+08:00", "19 Sep 2026, 15:39 SGT"],
  ])("formats %s in Singapore time across date boundaries", (value, expected) => {
    expect(timestamp(value)).toBe(expected);
  });
});

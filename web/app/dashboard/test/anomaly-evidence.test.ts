import { describe, expect, it } from "vitest";
import { anomalyChartHref, comparisonText, previousCalendarMonths, readEvidence, type AnomalyFinding } from "../data/anomaly-evidence";
import type { AnomalyAlert } from "../data/anomalies-utils";
const alert: AnomalyAlert = { id: "dept:HL:202601", kind: "dept", unitKey: "HL", unitLabel: "HL", periodNo: 202601, score: 0.9, reasons: [], modelVersion: "v1", firstFlaggedAt: "2026-02-01" };
const finding: AnomalyFinding = { code: "gross_margin_outlier", text: "Margin below normal", chart: "gross", recordLabel: "Related records", refs: [], history: [], comparison: { actual: 0.1, baseline: 0.3, unit: "ratio", periods: [202501], label: "Preceding 12-month median" } };
describe("anomaly presentation", () => {
  it("creates a correctly scoped gross link without retaining unrelated filters", () => {
    const url = new URL(anomalyChartHref(alert, finding)!, "http://localhost");
    expect(url.searchParams.get("period")).toBe("202601");
    expect(url.searchParams.get("unit")).toBe("HL");
    expect(url.searchParams.get("profitMode")).toBe("gross");
    expect(url.searchParams.has("branch")).toBe(false);
    expect(url.searchParams.get("anomaly")).toBe(alert.id);
    expect(url.hash).toBe("#profit-margin-title");
  });
  it("provides no graph action for customer, expense or non-graph reasons", () => {
    for (const kind of ["acc", "cust"] as const) expect(anomalyChartHref({ ...alert, kind }, finding)).toBeNull();
    expect(anomalyChartHref(alert, { ...finding, chart: null })).toBeNull();
  });
  it("includes 12 preceding calendar months across year boundaries", () => {
    const periods = previousCalendarMonths(202601);
    expect(periods).toHaveLength(13);
    expect(periods[0]).toBe(202501);
    expect(periods.at(-1)).toBe(202601);
  });
  it("labels comparisons and supports missing older evidence", () => {
    expect(comparisonText(finding)).toBe("10.00% vs 30.00% · Preceding 12-month median");
    expect(readEvidence(null)).toBeNull();
    expect(readEvidence({ version: 2, findings: [] })).toBeNull();
  });
});

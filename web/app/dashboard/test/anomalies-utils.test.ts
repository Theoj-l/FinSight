import { describe, expect, it } from "vitest";
import { anomalyId, describeMonths, groupAnomalies, toAnomalyAlert, type AnomalyAlertRow, type AnomalyLabels } from "@/app/dashboard/data/anomalies-utils";

const labels: AnomalyLabels = {
  dept: new Map([["HL", "Heavy Lift & Haulage"]]),
  acc: new Map([["6900", "  Sundry Expenses "]]),
  cust: new Map([["C0122", null]]),
};

function row(overrides: Partial<AnomalyAlertRow> = {}): AnomalyAlertRow {
  return {
    unit_kind: "dept", unit_key: "HL", period_no: 202307, score: 0.992,
    reasons: ["revenue 10.3 robust SDs above its trailing 12 months"],
    first_flagged_at: new Date("2026-10-08T03:00:00Z"), model_version: "v1",
    ...overrides,
  };
}

describe("toAnomalyAlert", () => {
  it("maps a stored row to the dashboard shape with a stable id and a readable label", () => {
    expect(toAnomalyAlert(row(), labels)).toEqual({
      id: "dept:HL:202307", kind: "dept", unitKey: "HL", unitLabel: "Heavy Lift & Haulage",
      periodNo: 202307, score: 0.992, reasons: ["revenue 10.3 robust SDs above its trailing 12 months"],
      firstFlaggedAt: "2026-10-08T03:00:00.000Z", modelVersion: "v1",
    });
  });

  it("trims labels and falls back to the key when no name exists", () => {
    expect(toAnomalyAlert(row({ unit_kind: "acc", unit_key: "6900" }), labels).unitLabel).toBe("Sundry Expenses");
    expect(toAnomalyAlert(row({ unit_kind: "cust", unit_key: "C0122" }), labels).unitLabel).toBe("C0122");
    expect(toAnomalyAlert(row({ unit_key: "ZZ" }), labels).unitLabel).toBe("ZZ");
  });

  it("keeps only string reasons from the JSON column", () => {
    expect(toAnomalyAlert(row({ reasons: ["a", 3, null, "b"] }), labels).reasons).toEqual(["a", "b"]);
    expect(toAnomalyAlert(row({ reasons: { not: "an array" } }), labels).reasons).toEqual([]);
  });
});

describe("anomalyId", () => {
  it("joins kind, key and period", () => {
    expect(anomalyId("cust", "C0122", 202411)).toBe("cust:C0122:202411");
  });
});

describe("groupAnomalies and describeMonths", () => {
  const labels: AnomalyLabels = { dept: new Map([["EN", "Engineering"], ["HL", "Heavy Lift"]]), acc: new Map(), cust: new Map() };
  const alert = (key: string, period: number, score: number, reasons: string[] = []) => toAnomalyAlert(row({ unit_key: key, period_no: period, score, reasons }), labels);

  it("writes months as compact runs", () => {
    expect(describeMonths([202607, 202602, 202603, 202604, 202605, 202606])).toBe("Feb–Jul 2026");
    expect(describeMonths([202511, 202512, 202601])).toBe("Nov 2025 – Jan 2026");
    expect(describeMonths([202603, 202605, 202606, 202607, 202607])).toBe("Mar 2026, May–Jul 2026");
    expect(describeMonths([202608])).toBe("Aug 2026");
  });

  it("lists a unit flagged in several months once, newest month first, strongest unit first", () => {
    const groups = groupAnomalies([
      alert("EN", 202606, 0.91, ["revenue shortfall"]),
      alert("HL", 202608, 0.99, ["duplicate posting"]),
      alert("EN", 202608, 0.95, ["margin below typical", "revenue shortfall"]),
    ]);
    expect(groups.map(group => group.key)).toEqual(["dept:HL", "dept:EN"]);
    const en = groups[1];
    expect(en).toMatchObject({ unitLabel: "Engineering", latestPeriod: 202608, maxScore: 0.95, months: [202606, 202608] });
    expect(en.alerts.map(a => a.periodNo)).toEqual([202608, 202606]);
    expect(en.reasons).toEqual(["margin below typical", "revenue shortfall"]);
  });

  it("uses earlier months only to mark a unit as recurring", () => {
    const groups = groupAnomalies([alert("EN", 202608, 0.9)], [alert("EN", 202606, 0.8), alert("EN", 202607, 0.8), alert("HL", 202607, 0.9)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].months).toEqual([202606, 202607, 202608]);
    expect(groups[0].alerts).toHaveLength(1);
  });
});

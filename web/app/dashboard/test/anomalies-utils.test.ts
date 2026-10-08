import { describe, expect, it } from "vitest";
import { anomalyId, toAnomalyAlert, type AnomalyAlertRow, type AnomalyLabels } from "@/app/dashboard/data/anomalies-utils";

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

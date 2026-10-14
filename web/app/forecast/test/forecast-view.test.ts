import { describe, expect, it } from "vitest";
import { parseDashboardFilters } from "@/app/dashboard/data/dashboard-scope";
import type { ForecastAccuracy } from "@/app/dashboard/data/forecast";
import { accuracyMessage } from "../components/forecast-view-utils";

const options = {
  periods: [202608, 202609, 202610],
  units: [{ code: "D01", label: "Transport" }],
  branches: [{ code: "SG", label: "Singapore" }],
};

describe("forecast route scope", () => {
  it("preserves the same range and unit scope as the dashboard filters", () => {
    const result = parseDashboardFilters({ periodStart: "202608", periodEnd: "202610", unit: "D01" }, options);
    expect(result.error).toBeUndefined();
    expect(result.scope).toMatchObject({
      periodStart: 202608,
      periodEnd: 202610,
      periodNumbers: [202608, 202609, 202610],
      departmentIds: ["D01"],
    });
  });

  it("retains branch selection so the forecast view can show the ledger limitation", () => {
    const result = parseDashboardFilters({ period: "202610", branch: "SG" }, options);
    expect(result.scope.branchCodes).toEqual(["SG"]);
    expect(result.scope.branchCode).toBe("SG");
  });
});

describe("forecast accuracy messaging", () => {
  const base: ForecastAccuracy = { months: 12, mape: 10, wape: 9, mae: 100, targetMape: 15, meetsTarget: true };

  it("explains a reliable forecast", () => {
    expect(accuracyMessage("Net profit", base)).toContain("within the 15% reliability target");
  });

  it("warns when the target is missed and handles unavailable accuracy", () => {
    expect(accuracyMessage("Revenue", { ...base, meetsTarget: false })).toContain("Treat this projection as indicative");
    expect(accuracyMessage("Cost", { ...base, meetsTarget: null, mape: null })).toBe("Accuracy not yet measured.");
  });
});

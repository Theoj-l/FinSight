import { describe, expect, it } from "vitest";
import { invoiceWhere, ledgerDepartment, parseDashboardFilters, type FilterOptions } from "../data/dashboard-scope";

const options: FilterOptions = { periods: [202402, 202401, 202312], units: [{ code: "U1", label: "Estate 1" }], branches: [{ code: "B1", label: "Branch 1" }] };
describe("reporting filter validation", () => {
  it("defaults to the latest available month, all units and all branches", () => {
    expect(parseDashboardFilters({}, options)).toEqual({ selection: { periodStart: "202402", periodEnd: "202402", units: [], branches: [] }, scope: { period: 202402, periodStart: 202402, periodEnd: 202402, periodNumbers: [202402], trendPeriodNumbers: [202312, 202401, 202402] }, error: undefined });
  });
  it.each([
    { period: "202413" }, { period: "202001" }, { period: "2024-02" }, { period: "" },
    { period: ["202401", "202402"] }, { unit: "missing" }, { branch: "missing" },
  ])("rejects invalid or out-of-range URLs: %j", params => {
    expect(parseDashboardFilters(params, options).error).toBeTruthy();
  });
  it("combines filters without dropping the selected month", () => {
    expect(parseDashboardFilters({ period: "202401", unit: "U1", branch: "B1" }, options).scope).toMatchObject({ period: 202401, periodNumbers: [202401], departmentIds: ["U1"], branchCode: "B1", branchCodes: ["B1"] });
  });
  it("supports a period range and repeated business unit and branch values", () => {
    expect(parseDashboardFilters({ periodStart: "202312", periodEnd: "202402", unit: ["U1"], branch: ["B1"] }, options).scope).toMatchObject({ periodStart: 202312, periodEnd: 202402, periodNumbers: [202312, 202401, 202402], departmentIds: ["U1"], branchCodes: ["B1"] });
  });
  it("clearly rejects an empty reporting calendar", () => {
    expect(parseDashboardFilters({}, { ...options, periods: [] }).error).toBeTruthy();
  });
});

describe("source-specific filter coverage", () => {
  it("uses invoice line business units, invoice branches and calendar date bounds together", () => {
    expect(invoiceWhere({ period: 202402, departmentIds: ["U1"], branchCode: "B1" })).toEqual({ dept_no: { in: ["U1"] }, iv: { cancelled: false, branch_code: "B1", doc_date: { gte: new Date("2024-02-01T00:00:00Z"), lt: new Date("2024-03-01T00:00:00Z") } } });
  });
  it("uses a date range and all selected invoice branches", () => {
    expect(invoiceWhere({ periodStart: 202312, periodEnd: 202402, departmentIds: ["U1"], branchCodes: ["B1", "B2"] })).toEqual({ dept_no: { in: ["U1"] }, iv: { cancelled: false, branch_code: { in: ["B1", "B2"] }, doc_date: { gte: new Date("2023-12-01T00:00:00Z"), lt: new Date("2024-03-01T00:00:00Z") } } });
  });
  it("handles December date bounds and an explicit empty unit scope", () => {
    expect(invoiceWhere({ period: 202412, departmentIds: [] }).iv.doc_date?.lt).toEqual(new Date("2025-01-01T00:00:00Z"));
    expect(ledgerDepartment({ departmentIds: [] })).toEqual({ dept_no: { in: [] } });
    expect(() => invoiceWhere({ period: 202400 })).toThrow();
  });
  it("never silently returns company-wide ledger figures for a selected branch", () => {
    expect(() => ledgerDepartment({ branchCode: "B1", departmentIds: ["U1"] })).toThrow("Branch-level balances");
    expect(ledgerDepartment({})).toEqual({});
  });
});

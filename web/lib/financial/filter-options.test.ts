import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  pbalance: { findMany: vi.fn() },
  forecast_value: { findMany: vi.fn() },
  budget_pbalance: { findMany: vi.fn() },
  financial_manual_forecast: { findMany: vi.fn() },
  dept: { findMany: vi.fn() },
  branch: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { getFilterOptions } from "@/app/dashboard/data/filter-options";
import { parseDashboardFilters } from "@/app/dashboard/data/dashboard-scope";
beforeEach(() => {
  vi.resetAllMocks();
  db.pbalance.findMany.mockResolvedValue([
    { period_no: 202608 },
    { period_no: 202607 },
  ]);
  db.forecast_value.findMany.mockResolvedValue([
    { period_no: 202609 },
    { period_no: 202610 },
  ]);
  db.financial_manual_forecast.findMany.mockResolvedValue([
    { period_no: 202611 },
  ]);
  db.budget_pbalance.findMany.mockResolvedValue([
    { period_no: 202610 },
    { period_no: 202612 },
    { period_no: 202613 },
  ]);
  db.dept.findMany.mockResolvedValue([]);
  db.branch.findMany.mockResolvedValue([]);
});
it("offers future planned months, deduplicates and validates them, while defaulting to the latest actual", async () => {
  const options = await getFilterOptions(true);
  expect(options.periods).toEqual([
    202612, 202611, 202610, 202609, 202608, 202607,
  ]);
  expect(options.defaultPeriod).toBe(202608);
  expect(parseDashboardFilters({}, options).scope.period).toBe(202608);
  expect(
    parseDashboardFilters({ period: "202611" }, options).error,
  ).toBeUndefined();
  expect(db.forecast_value.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { forecast_run: { status: "ok" } } }),
  );
});
it("preserves the actual-only option loader used by other pages", async () => {
  const options = await getFilterOptions();
  expect(options.periods).toEqual([202608, 202607]);
  expect(db.forecast_value.findMany).not.toHaveBeenCalled();
});
it("keeps actual reporting months usable when planned-month lookups fail", async () => {
  db.forecast_value.findMany.mockRejectedValue(new Error("unavailable"));
  db.financial_manual_forecast.findMany.mockRejectedValue(new Error("unavailable"));
  db.budget_pbalance.findMany.mockRejectedValue(new Error("unavailable"));
  const options=await getFilterOptions(true);
  expect(options.periods).toEqual([202608,202607]);
  expect(parseDashboardFilters({},options).error).toBeUndefined();
  expect(parseDashboardFilters({},options).scope.period).toBe(202608);
});
it("isolates synchronous optional-query failures", async () => {
  db.financial_manual_forecast.findMany.mockImplementation(() => { throw new TypeError("stale delegate"); });
  const options = await getFilterOptions(true);
  expect(options.periods).toContain(202608);
  expect(options.periods).not.toContain(202611);
});
it("resolves business types from metadata, including Corporate, and validates subsets", () => {
  const options = {periods:[202608],branches:[],units:[{code:"HL",label:"Heavy Lift",businessType:"Bulk"},{code:"CP",label:"Corporate",businessType:"Bulk"},{code:"EN",label:"Engineering",businessType:"Machining"}]};
  expect(parseDashboardFilters({businessType:"Bulk"},options).scope.departmentIds).toEqual(["HL","CP"]);
  expect(parseDashboardFilters({businessType:"Bulk",unit:"CP"},options).scope.departmentIds).toEqual(["CP"]);
  expect(parseDashboardFilters({businessType:"Machining",unit:"HL"},options).error).toBeTruthy();
  expect(parseDashboardFilters({businessType:"Other"},options).error).toBeTruthy();
});

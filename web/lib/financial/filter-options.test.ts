import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Month lookups are SQL DISTINCT queries ($queryRaw); route each by its table.
const months = vi.hoisted(() => ({
  pbalance: vi.fn(),
  forecast_value: vi.fn(),
  budget_pbalance: vi.fn(),
  financial_manual_forecast: vi.fn(),
}));
const sqlOf = (strings: TemplateStringsArray) => strings.join("?");
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  dept: { findMany: vi.fn() },
  branch: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { getFilterOptions } from "@/app/dashboard/data/filter-options";
import { parseDashboardFilters } from "@/app/dashboard/data/dashboard-scope";
const forecastQueries = () => db.$queryRaw.mock.calls.map(([strings]) => sqlOf(strings)).filter(sql => sql.includes("forecast_value"));
beforeEach(() => {
  vi.resetAllMocks();
  db.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
    const table = (Object.keys(months) as (keyof typeof months)[]).find(name => sqlOf(strings).includes(`FROM ${name}`));
    if (!table) throw new Error(`unexpected query: ${sqlOf(strings)}`);
    return months[table]();
  });
  months.pbalance.mockResolvedValue([
    { period_no: 202608 },
    { period_no: 202607 },
  ]);
  months.forecast_value.mockResolvedValue([
    { period_no: 202609 },
    { period_no: 202610 },
  ]);
  months.financial_manual_forecast.mockResolvedValue([
    { period_no: 202611 },
  ]);
  months.budget_pbalance.mockResolvedValue([
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
  expect(forecastQueries()).toEqual([expect.stringContaining("r.status = 'ok'")]);
});
it("preserves the actual-only option loader used by other pages", async () => {
  const options = await getFilterOptions();
  expect(options.periods).toEqual([202608, 202607]);
  expect(forecastQueries()).toEqual([]);
});
it("keeps actual reporting months usable when planned-month lookups fail", async () => {
  months.forecast_value.mockRejectedValue(new Error("unavailable"));
  months.financial_manual_forecast.mockRejectedValue(new Error("unavailable"));
  months.budget_pbalance.mockRejectedValue(new Error("unavailable"));
  const options=await getFilterOptions(true);
  expect(options.periods).toEqual([202608,202607]);
  expect(parseDashboardFilters({},options).error).toBeUndefined();
  expect(parseDashboardFilters({},options).scope.period).toBe(202608);
});
it("isolates synchronous optional-query failures", async () => {
  months.financial_manual_forecast.mockImplementation(() => { throw new TypeError("stale delegate"); });
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

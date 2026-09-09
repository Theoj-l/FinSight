import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ pbalance: { findFirst: vi.fn(), findMany: vi.fn() }, budget_pbalance: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { getKpiData } from "../data/kpi";

beforeEach(() => {
  vi.resetAllMocks();
  db.pbalance.findFirst.mockResolvedValue({ period_no: 202402 });
  db.pbalance.findMany.mockResolvedValue([{ period_no: 202402, home_dr: "0", home_cr: "100", gl_mast: { acc_type: "RE" } }]);
  db.budget_pbalance.findMany.mockResolvedValue([]);
});

it("returns an empty state when the scoped ledger has no periods", async () => {
  db.pbalance.findFirst.mockResolvedValue(null);
  expect(await getKpiData()).toBeNull();
  expect(db.pbalance.findMany).not.toHaveBeenCalled();
});

it("applies the same department and period scope to actuals and budgets", async () => {
  await getKpiData({ period: 202401, departmentIds: ["ESTATE"], budgetKey: BigInt(7) });
  expect(db.pbalance.findFirst).not.toHaveBeenCalled();
  expect(db.pbalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dept_no: { in: ["ESTATE"] }, period_no: { in: [202401, 202312] } } }));
  expect(db.budget_pbalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dept_no: { in: ["ESTATE"] }, period_no: { in: [202401, 202312] }, budget_key: BigInt(7) } }));
});

it("rejects ambiguous budget scenarios instead of summing them", async () => {
  db.budget_pbalance.findMany.mockResolvedValue([1, 2].map(key => ({ budget_key: BigInt(key), period_no: 202402, amount: "-80", gl_mast: { acc_type: "RE" } })));
  const data = await getKpiData();
  expect(data?.metrics.find(m => m.id === "budgetVariance")?.value).toBeNull();
});

it("aggregates multiple account or department rows within one budget scenario", async () => {
  db.budget_pbalance.findMany.mockResolvedValue(["-50", "-30"].map(amount => ({ budget_key: BigInt(1), period_no: 202402, amount, gl_mast: { acc_type: "RE" } })));
  const data = await getKpiData();
  expect(data?.metrics.find(m => m.id === "budgetVariance")?.value).toBe("20.00");
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pbalance: { findMany: vi.fn(), findFirst: vi.fn() }, budget_pbalance: { findMany: vi.fn() },
  pl_format: { findMany: vi.fn() }, iv_dtl: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { getRevenueExpenseData } from "../data/revenue-expense";
import { getProfitMarginData } from "../data/profit-margin";
import { getExpenseCategoryData } from "../data/expense-category";
import { getRevenueByGroupData } from "../data/revenue-by-group";
import { getProfitLossData } from "../data/profit-loss";
import { getKpiData } from "../data/kpi";

beforeEach(() => {
  vi.resetAllMocks();
  db.pbalance.findMany.mockResolvedValue([]);
  db.budget_pbalance.findMany.mockResolvedValue([]);
  db.iv_dtl.findMany.mockResolvedValue([]);
  db.pl_format.findMany.mockResolvedValue([{ seq: 10, row_type: "A", acc_type: "RE", description: "Revenue", credit_as_positive: true }]);
});
const scope = { period: 202402, departmentIds: ["U1"] };

describe("consistent dashboard data scope", () => {
  it.each([getRevenueExpenseData, getProfitMarginData])("scopes monthly chart actuals to the selected month and unit", async read => {
    await read(scope);
    expect(db.pbalance.findFirst).not.toHaveBeenCalled();
    expect(db.pbalance.findMany).toHaveBeenCalledOnce();
    expect(db.pbalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dept_no: { in: ["U1"] }, period_no: { in: [202402] } }) }));
  });
  it("keeps the expense baseline in the same unit and exposes only the selected month", async () => {
    db.pbalance.findMany.mockResolvedValue([202401, 202402].map(period_no => ({ period_no, home_dr: 100, home_cr: 0, gl_mast: { acc_type: "EX", description: "Labour" } })));
    const result = await getExpenseCategoryData(scope);
    expect(db.pbalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dept_no: { in: ["U1"] }, period_no: { in: [202401, 202402] } }) }));
    expect(result.map(row => row.periodNo)).toEqual([202402]);
    expect(result[0].categories[0].priorAmount).toBe(100);
  });
  it("filters invoice revenue by all three dimensions", async () => {
    await getRevenueByGroupData({ ...scope, branchCode: "B1" });
    expect(db.iv_dtl.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dept_no: { in: ["U1"] }, iv: { cancelled: false, branch_code: "B1", doc_date: { gte: new Date("2024-02-01T00:00:00Z"), lt: new Date("2024-03-01T00:00:00Z") } } } }));
  });
  it("uses the selected month for the P&L and bounds YTD within the same unit", async () => {
    db.pbalance.findMany.mockResolvedValue([{ period_no: 202401, home_dr: 0, home_cr: 100, gl_mast: { acc_type: "RE" } }, { period_no: 202402, home_dr: 0, home_cr: 200, gl_mast: { acc_type: "RE" } }]);
    db.budget_pbalance.findMany.mockResolvedValue([{ budget_key: BigInt(1), period_no: 202402, amount: -150, gl_mast: { acc_type: "RE" } }]);
    const result = await getProfitLossData(scope);
    expect(db.pbalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dept_no: { in: ["U1"] }, period_no: { gte: 202401, lte: 202402 } } }));
    expect(db.budget_pbalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dept_no: { in: ["U1"] }, period_no: 202402 } }));
    expect(result.period).toBe("2024-02");
    expect(result.rows[0]).toMatchObject({ monthToDate: 200, yearToDate: 300, budgetMonthToDate: 150 });
  });
  it("does not manufacture a zero actual or budget when the selection is missing", async () => {
    const result = await getProfitLossData(scope);
    expect(result.rows[0].monthToDate).toBeUndefined();
    expect(result.rows[0].budgetMonthToDate).toBeUndefined();
    expect(result.rows[0].variancePct).toBeNull();
  });
  it("does not add alternative budgets in the P&L", async () => {
    db.pbalance.findMany.mockResolvedValue([{ period_no: 202402, home_dr: 0, home_cr: 100, gl_mast: { acc_type: "RE" } }]);
    db.budget_pbalance.findMany.mockResolvedValue([1, 2].map(key => ({ budget_key: BigInt(key), period_no: 202402, amount: -150, gl_mast: { acc_type: "RE" } })));
    const result = await getProfitLossData(scope);
    expect(result.rows[0].monthToDate).toBe(100);
    expect(result.rows[0].budgetMonthToDate).toBeUndefined();
    expect(result.rows[0].variancePct).toBeNull();
  });
  it.each([getRevenueExpenseData, getProfitMarginData, getExpenseCategoryData, getProfitLossData, getKpiData])("refuses unsupported branch attribution for ledger panels", async read => {
    await expect(read({ ...scope, branchCode: "B1" })).rejects.toThrow("Branch-level balances");
    expect(db.pbalance.findMany).not.toHaveBeenCalled();
  });
});

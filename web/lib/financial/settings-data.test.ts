import { beforeEach, expect, it, vi } from "vitest";
import { defaultRules } from "./types";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  financial_settings: { upsert: vi.fn() },
  financial_manual_forecast: { upsert: vi.fn(), deleteMany: vi.fn() },
  budget: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
  },
  dept: { findUnique: vi.fn() },
  gl_mast: { findMany: vi.fn() },
  budget_pbalance: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { writePlanningSettings } from "./settings-data";
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.dept.findUnique.mockResolvedValue({ dept_no: "HL" });
  db.budget.findUnique.mockResolvedValue({ budget_key: BigInt(1) });
  db.gl_mast.findMany.mockResolvedValue([
    { acc_no: "4000", acc_type: "RE" },
    { acc_no: "5000", acc_type: "CS" },
  ]);
});
it("saves rules without changing the notification source, with an audit identity", async () => {
  await writePlanningSettings(
    { kind: "rules", rules: defaultRules() },
    "user-1",
  );
  const update = db.financial_settings.upsert.mock.calls[0][0].update;
  expect(update.rules).toEqual(defaultRules());
  expect(update.updated_by).toBe("user-1");
  expect(update.notification_source).toBeUndefined();
});
it("saves an explicit Home budget scenario separately from rules", async () => {
  await writePlanningSettings(
    { kind: "source", source: "budget", budgetId: "1" },
    "user-1",
  );
  expect(db.financial_settings.upsert.mock.calls[0][0].update).toMatchObject({
    notification_source: "budget",
    notification_budget_key: BigInt(1),
  });
  expect(
    db.financial_settings.upsert.mock.calls[0][0].update.rules,
  ).toBeUndefined();
});
it("rejects a removed Home scenario", async () => {
  db.budget.findUnique.mockResolvedValue(null);
  await expect(
    writePlanningSettings(
      { kind: "source", source: "budget", budgetId: "1" },
      "u",
    ),
  ).rejects.toThrow("Unknown budget");
  expect(db.financial_settings.upsert).not.toHaveBeenCalled();
});
it("keeps explicit zero and negative manual profit, with the exact department/month scope", async () => {
  await writePlanningSettings(
    {
      kind: "manual",
      department: "HL",
      period: 202601,
      revenue: "0",
      netProfit: "-100.5",
    },
    "u",
  );
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(
    db.financial_manual_forecast.upsert.mock.calls.map(([v]) => v.create),
  ).toEqual([
    {
      dept_no: "HL",
      period_no: 202601,
      metric: "revenue",
      amount: "0",
      updated_by: "u",
    },
    {
      dept_no: "HL",
      period_no: 202601,
      metric: "netProfit",
      amount: "-100.5",
      updated_by: "u",
    },
  ]);
  expect(db.budget_pbalance.deleteMany).not.toHaveBeenCalled();
});
it("clears only the two manual values in the chosen scope", async () => {
  await writePlanningSettings(
    {
      kind: "manual",
      department: "HL",
      period: 202601,
      revenue: null,
      netProfit: null,
    },
    "u",
  );
  expect(
    db.financial_manual_forecast.deleteMany.mock.calls.map(([v]) => v.where),
  ).toEqual(
    ["revenue", "netProfit"].map((metric) => ({
      dept_no: "HL",
      period_no: 202601,
      metric,
    })),
  );
  expect(db.financial_manual_forecast.upsert).not.toHaveBeenCalled();
});
it("atomically replaces one budget scope and converts displayed income to the ledger sign", async () => {
  await writePlanningSettings(
    {
      kind: "budget",
      department: "HL",
      period: 202601,
      budgetId: "1",
      entries: [
        { account: "4000", amount: "150.25" },
        { account: "5000", amount: "0" },
      ],
    },
    "u",
  );
  expect(db.budget_pbalance.deleteMany).toHaveBeenCalledWith({
    where: { dept_no: "HL", period_no: 202601, budget_key: BigInt(1) },
  });
  const rows = db.budget_pbalance.createMany.mock.calls[0][0].data;
  expect(
    rows.map((r: { amount: { toString(): string } }) => r.amount.toString()),
  ).toEqual(["-150.25", "0"]);
  expect(
    rows.every(
      (r: { dept_no: string; period_no: number }) =>
        r.dept_no === "HL" && r.period_no === 202601,
    ),
  ).toBe(true);
});
it("removes blank budget entries rather than fabricating zeros", async () => {
  await writePlanningSettings(
    {
      kind: "budget",
      department: "HL",
      period: 202601,
      budgetId: "1",
      entries: [
        { account: "4000", amount: null },
        { account: "5000", amount: null },
      ],
    },
    "u",
  );
  expect(db.budget_pbalance.deleteMany).toHaveBeenCalled();
  expect(db.budget_pbalance.createMany).not.toHaveBeenCalled();
});
it("refuses a stale or invalid account list before deleting a budget", async () => {
  await expect(
    writePlanningSettings(
      {
        kind: "budget",
        department: "HL",
        period: 202601,
        budgetId: "1",
        entries: [{ account: "4000", amount: "20" }],
      },
      "u",
    ),
  ).rejects.toThrow("account list changed");
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("rejects an unknown department before any writes", async () => {
  db.dept.findUnique.mockResolvedValue(null);
  await expect(
    writePlanningSettings(
      {
        kind: "manual",
        department: "xx",
        period: 202601,
        revenue: null,
        netProfit: null,
      },
      "u",
    ),
  ).rejects.toThrow("Unknown department");
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("serializes scenario-key allocation with an advisory lock", async () => {
  db.budget.aggregate.mockResolvedValue({
    _max: { budget_key: BigInt("9007199254740993") },
  });
  await writePlanningSettings({ kind: "scenario", name: "Plan" }, "u");
  expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  expect(db.budget.create).toHaveBeenCalledWith({
    data: { budget_key: BigInt("9007199254740994"), budget_name: "Plan" },
  });
});
it("rejects duplicate scenario names under the same allocation lock", async () => {
  db.budget.findFirst.mockResolvedValue({
    budget_key: BigInt(1),
    budget_name: "Plan",
  });
  await expect(
    writePlanningSettings({ kind: "scenario", name: "plan" }, "u"),
  ).rejects.toThrow("already exists");
  expect(db.budget.create).not.toHaveBeenCalled();
});

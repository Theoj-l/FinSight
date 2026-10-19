import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { defaultRules } from "./types";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  financial_settings: { findUnique: vi.fn() },
  pbalance: { findFirst: vi.fn() },
  financial_manual_forecast: { findMany: vi.fn() },
  budget: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { getFinancialBundle } from "./data";
import { comparisonKpis } from "./presentation";
import { chartValues } from "./chart-values";
import { financialAlerts } from "./alerts";

const balance = (
  dept: string,
  month: number,
  re = "100",
  cs = "20",
  ex = "10",
) =>
  Object.entries({ RE: re, CS: cs, EX: ex, OI: "5" }).map(
    ([acc_type, amount]) => ({
      dept_no: dept,
      period_no: month,
      acc_type,
      amount,
    }),
  );
let actual: ReturnType<typeof balance>,
  budgets: (ReturnType<typeof balance>[number] & { budget_key: string })[];
beforeEach(() => {
  vi.resetAllMocks();
  actual = [...balance("HL", 202512, "200"), ...balance("HL", 202601)];
  budgets = [];
  db.financial_settings.findUnique.mockResolvedValue(null);
  db.pbalance.findFirst.mockResolvedValue({ period_no: 202601 });
  db.budget.findMany.mockResolvedValue([
    { budget_key: BigInt(1), budget_name: "Agreed plan" },
  ]);
  db.financial_manual_forecast.findMany.mockResolvedValue([]);
  db.$queryRaw.mockImplementation(async (sql: Prisma.Sql) => {
    if (sql.sql.includes("SELECT DISTINCT dept_no")) return [...new Set(actual.map(r => r.dept_no))].map(dept_no => ({dept_no}));
    if (sql.sql.includes("FROM pbalance")) return actual;
    if (sql.sql.includes("FROM budget_pbalance")) return budgets;
    return [];
  });
});
describe("stored financial comparisons", () => {
  it("compares January with December, with January-only YTD and one shared point across views", async () => {
    const bundle = (await getFinancialBundle({
      period: 202601,
      departmentIds: ["HL"],
    }))!;
    const point = bundle.sources.previous[202601];
    expect(point.metrics.revenue).toMatchObject({
      actual: "100.0000",
      reference: "200.0000",
      percentage: -50,
      breach: true,
    });
    expect(bundle.ytd.revenue).toBe("100.0000");
    const kpi = comparisonKpis(bundle, "previous").metrics[0];
    expect(kpi.comparison).toBe(point.metrics.revenue);
    expect(chartValues(point).referenceRevenue).toBe(Number(kpi.prior));
    expect(
      financialAlerts(comparisonKpis(bundle, "previous"))[0].comparison,
    ).toBe(point.metrics.revenue);
    expect(db.$queryRaw).toHaveBeenCalledTimes(4); // reads only; no ML scoring or training
  });
  it("does not combine scenarios or silently choose one", async () => {
    budgets = [1, 2].flatMap((key) =>
      balance("HL", 202601, String(key * 120)).map((r) => ({
        ...r,
        budget_key: String(key),
      })),
    );
    db.budget.findMany.mockResolvedValue(
      [1, 2].map((n) => ({ budget_key: BigInt(n), budget_name: `Plan ${n}` })),
    );
    const b = (await getFinancialBundle())!;
    expect(b.sources.budget[202601].metrics.revenue.reference).toBeNull();
    expect(b.sources.budget[202601].provenance.join()).toContain(
      "Multiple budget scenarios",
    );
    expect(b.budgetSources["1"][202601].metrics.revenue.reference).toBe(
      "120.0000",
    );
    expect(b.budgetSources["2"][202601].metrics.revenue.reference).toBe(
      "240.0000",
    );
    expect(b.budgets).toHaveLength(2);
  });
  it("preserves a missing active budget component and its dependent subtotals", async () => {
    budgets = balance("HL", 202601, "120")
      .filter((r) => r.acc_type !== "CS")
      .map((r) => ({ ...r, budget_key: "1" }));
    const m = (await getFinancialBundle())!.sources.budget[202601].metrics;
    expect(m.revenue.reference).toBe("120.0000");
    expect(m.costOfSales.reference).toBeNull();
    expect(m.grossProfit.reference).toBeNull();
    expect(m.netProfit.reference).toBeNull();
    expect(m.revenue.actual).toBe("100.0000");
  });
  it("requires complete department coverage for actuals, budgets, manual estimates and forecasts", async () => {
    actual.push(...balance("TR", 202512, "50")); // TR is missing in January
    budgets = balance("HL", 202601).map((r) => ({ ...r, budget_key: "1" }));
    db.financial_manual_forecast.findMany.mockResolvedValue([
      {
        dept_no: "HL",
        period_no: 202601,
        metric: "revenue",
        amount: new Prisma.Decimal(150),
      },
    ]);
    const b = (await getFinancialBundle({
      departmentIds: ["HL", "TR"],
      period: 202601,
    }))!;
    for (const series of Object.values(b.sources)) {
      expect(series[202601].metrics.revenue.actual).toBeNull();
      expect(series[202601].metrics.revenue.breach).toBe(false);
    }
    expect(b.sources.budget[202601].metrics.revenue.reference).toBeNull();
    expect(b.sources.manual[202601].metrics.revenue.reference).toBeNull();
    expect(b.sources.auto[202601].metrics.revenue.reference).toBeNull();
  });
  it("requires explicit budget zeros for Corporate income and derives profit only when complete", async () => {
    actual = balance("CP", 202601).filter((r) => r.acc_type === "EX");
    budgets = [
      {
        dept_no: "CP",
        period_no: 202601,
        acc_type: "EX",
        amount: "40",
        budget_key: "1",
      },
    ];
    const b = (await getFinancialBundle({ departmentIds: ["CP"] }))!;
    expect(b.sources.budget[202601].metrics.netProfit.reference).toBeNull();
    expect(b.sources.budget[202601].metrics.operatingExpenses.reference).toBe(
      "40.0000",
    );
    expect(b.sources.budget[202601].metrics.grossMargin.reference).toBeNull();
    budgets.push(
      ...["RE", "CS", "OI"].map((acc_type) => ({
        dept_no: "CP",
        period_no: 202601,
        acc_type,
        amount: "0",
        budget_key: "1",
      })),
    );
    expect(
      (await getFinancialBundle({ departmentIds: ["CP"] }))!.sources
        .budget[202601].metrics.netProfit.reference,
    ).toBe("-40.0000");
    budgets = [];
    expect(
      (await getFinancialBundle({ departmentIds: ["CP"] }))!.sources
        .budget[202601].metrics.netProfit.reference,
    ).toBeNull();
  });
  it("returns future actuals as unavailable while retaining an explicit zero manual estimate", async () => {
    db.financial_manual_forecast.findMany.mockResolvedValue([
      {
        dept_no: "HL",
        period_no: 202602,
        metric: "revenue",
        amount: new Prisma.Decimal(0),
      },
    ]);
    const b = (await getFinancialBundle({
      period: 202602,
      departmentIds: ["HL"],
    }))!;
    expect(b.sources.manual[202602].metrics.revenue).toMatchObject({
      actual: null,
      reference: "0.0000",
      percentage: null,
      breach: false,
    });
    expect(b.sources.manual[202602].metrics.netProfit.reference).toBeNull();
  });
  it("loads shared rules and a safely serialized saved Home scenario", async () => {
    db.financial_settings.findUnique.mockResolvedValue({
      rules: defaultRules(),
      notification_source: "budget",
      notification_budget_key: BigInt("9007199254740993"),
    });
    const b = (await getFinancialBundle())!;
    expect(b.notificationSource).toBe("budget");
    expect(b.notificationBudgetId).toBe("9007199254740993");
    expect(() => JSON.stringify(b)).not.toThrow();
  });
  it("fails explicitly on corrupt rules instead of silently disabling or replacing them", async () => {
    db.financial_settings.findUnique.mockResolvedValue({
      rules: { broken: true },
    });
    await expect(getFinancialBundle()).rejects.toThrow("rules are invalid");
  });
  it("rejects unsupported branch attribution before any financial reads", async () => {
    await expect(getFinancialBundle({ branchCodes: ["HQ"] })).rejects.toThrow();
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.financial_settings.findUnique).not.toHaveBeenCalled();
  });
  it("handles an empty ledger and an invalid month", async () => {
    db.pbalance.findFirst.mockResolvedValue(null);
    expect(await getFinancialBundle()).toBeNull();
    await expect(getFinancialBundle({ period: 202613 })).rejects.toThrow(
      "Invalid reporting month",
    );
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it.each(["budget", "manual", "auto"] as const)(
    "isolates a failed %s feed without losing actuals or previous-month comparisons",
    async (source) => {
      if (source === "manual")
        db.financial_manual_forecast.findMany.mockRejectedValue(
          new Error("database private details"),
        );
      else
        db.$queryRaw.mockImplementation(async (sql: Prisma.Sql) => {
          if (sql.sql.includes("SELECT DISTINCT dept_no")) return [...new Set(actual.map(r => r.dept_no))].map(dept_no => ({dept_no}));
    if (sql.sql.includes("FROM pbalance")) return actual;
          if (
            sql.sql.includes(
              source === "budget"
                ? "FROM budget_pbalance"
                : "FROM forecast_value",
            )
          )
            throw new Error("database private details");
          return [];
        });
      const b = (await getFinancialBundle())!;
      expect(b.sources[source][202601].metrics.revenue).toMatchObject({
        actual: "100.0000",
        reference: null,
        breach: false,
      });
      expect(b.sources.previous[202601].metrics.revenue.reference).toBe(
        "200.0000",
      );
      expect(b.sourceErrors?.[source]).toContain("could not be loaded");
      expect(JSON.stringify(b)).not.toContain("private details");
    },
  );
});
it("catches synchronous planning failures while keeping actuals readable", async () => {
  db.financial_manual_forecast.findMany.mockImplementation(() => {throw new TypeError("stale");});
  const b = (await getFinancialBundle())!;
  expect(b.sources.previous[202601].metrics.revenue.actual).toBe("100.0000");
  expect(b.sourceErrors?.manual).toBeTruthy();
});
it("attaches rejection handlers before a second synchronous query fails", async () => {
  db.financial_settings.findUnique.mockRejectedValue(new Error("settings failure"));
  db.financial_manual_forecast.findMany.mockImplementation(() => {throw new TypeError("stale");});
  await expect(getFinancialBundle()).rejects.toThrow("settings failure");
});
it("excludes inactive selected placeholders but retains active units with missing plans", async () => {
  actual.push(...balance("CP",202601));
  const b = (await getFinancialBundle({period:202601,departmentIds:["HL","CP","NA"]}))!;
  expect(b.departments).toEqual(["CP","HL"]);
  expect(b.sources.manual[202601].metrics.revenue.reference).toBeNull();
  expect(b.sources.manual[202601].provenance.join(" ")).toContain("CP, HL");
});

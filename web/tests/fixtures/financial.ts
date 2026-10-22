import {
  compareValues,
  emptyValues,
  valuesFrom,
} from "../../lib/financial/engine";
import {
  defaultRules,
  type FinancialBundle,
  type SourceSeries,
  type Source,
} from "../../lib/financial/types";
export function financialFixture(): FinancialBundle {
  const rules = defaultRules();
  for (const rule of Object.values(rules)) rule.tolerance = 10;
  const actual = valuesFrom({ RE: "100", CS: "20", OI: "5", EX: "10" });
  const references = {
    previous: valuesFrom({ RE: "200", CS: "20", OI: "5", EX: "10" }),
    budget: valuesFrom({ RE: "120", CS: "20", OI: "5", EX: "10" }),
    auto: { ...emptyValues(), revenue: "180", netProfit: "90" },
    manual: { ...emptyValues(), revenue: "150", netProfit: "85" },
  };
  const sources = Object.fromEntries(
    Object.entries(references).map(([source, ref]) => [
      source,
      {
        202608: {
          period: 202608,
          metrics: compareValues(actual, ref, rules),
          provenance: [
            source === "auto"
              ? "Reconstructed forecast (rolling backtest)"
              : "Test reference",
          ],
        },
      },
    ]),
  ) as unknown as Record<Source, SourceSeries>;
  return {
    period: 202608,
    departments: ["HL"],
    rules,
    notificationSource: "previous",
    sources,
    budgetSources: { "2026": sources.budget },
    budgets: [{ id: "2026", name: "BUDGET FY2026" }],
    ytd: actual,
    scopeLabel: "HL",
    forecastNotice:
      "Auto forecast supports operating revenue and final profit only. Estimates, not guarantees.",
  };
}

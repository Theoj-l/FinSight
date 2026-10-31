import type { KpiData, KpiMetric } from "@/app/dashboard/data/kpi-presentation";
import {
  METRICS,
  SOURCES,
  addMonth,
  monthLabel,
  type Comparison,
  type FinancialBundle,
  type Metric,
  type PeriodComparison,
  type Rules,
  type Source,
  type SourceSeries,
} from "./types";
/** Headline money figures first, then ratios (shown separately, smaller). */
export const KPI_METRICS = [
  "revenue",
  "totalExpenses",
  "grossProfit",
  "netProfit",
  "grossMargin",
  "netMargin",
  "expenseRatio",
] as const;

// Exact decimal sums for amounts kept as 4-decimal strings (see engine.ts),
// without pulling Prisma's Decimal into client bundles.
const UNITS = BigInt(10000);
function toUnits(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const units = BigInt(whole || "0") * UNITS + BigInt(`${fraction}0000`.slice(0, 4));
  return negative ? -units : units;
}
function fromUnits(units: bigint): string {
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  return `${negative ? "-" : ""}${absolute / UNITS}.${(absolute % UNITS).toString().padStart(4, "0")}`;
}
function addAmounts(a: string | null, b: string | null): string | null {
  return a === null || b === null ? null : fromUnits(toUnits(a) + toUnits(b));
}

/**
 * Total expenses = cost of sales + operating expenses, compared like any other
 * cost (an increase is unfavourable). Shown on the cards only: it has no rule
 * of its own, so it uses the stricter of the two expense thresholds, and it
 * raises no notification (its parts already do).
 */
export function totalExpensesComparison(point: PeriodComparison, rules: Rules): Comparison {
  const cost = point.metrics.costOfSales, opex = point.metrics.operatingExpenses;
  const enabled = [rules.costOfSales, rules.operatingExpenses].filter((rule) => rule.enabled);
  const tolerance = enabled.length ? Math.min(...enabled.map((rule) => rule.tolerance)) : 0;
  const actual = addAmounts(cost.actual, opex.actual);
  const reference = addAmounts(cost.reference, opex.reference);
  const base = { actual, reference, absolute: null, percentage: null, unfavorable: false, breach: false, tolerance, enabled: enabled.length > 0, note: cost.note };
  if (actual === null || reference === null) return base;
  const delta = toUnits(actual) - toUnits(reference);
  const referenceUnits = toUnits(reference);
  const percentage = referenceUnits === BigInt(0)
    ? delta === BigInt(0) ? 0 : null
    : (Number(delta) / Math.abs(Number(referenceUnits))) * 100;
  const unfavorable = delta > BigInt(0);
  return {
    ...base,
    absolute: fromUnits(delta),
    percentage,
    unfavorable,
    breach: base.enabled && unfavorable && percentage !== null && Math.abs(percentage) > tolerance,
  };
}
export function comparisonKpis(
  bundle: FinancialBundle,
  source: Source,
  series = bundle.sources[source],
): KpiData {
  const point = series[bundle.period];
  return {
    period: monthLabel(bundle.period),
    priorPeriod: monthLabel(addMonth(bundle.period, -1)),
    comparisonSource: source,
    comparisonLabel: SOURCES[source],
    financialRules: bundle.rules,
    financialComparisons: point.metrics,
    ...(source === "budget" && bundle.notificationBudgetId
      ? { comparisonBudgetId: bundle.notificationBudgetId }
      : {}),
    notices: [
      ...(source === "auto" ? [bundle.forecastNotice] : []),
      ...(point?.provenance ?? []),
    ],
    metrics: KPI_METRICS.map((id) => {
      const c = id === "totalExpenses" ? totalExpensesComparison(point, bundle.rules) : point.metrics[id];
      const label = id === "totalExpenses" ? "Total expenses" : METRICS[id].label;
      return {
        id,
        label,
        description: id === "totalExpenses"
          ? "Cost of sales plus operating expenses; actual ledger values. Its colour uses the stricter of the two expense thresholds."
          : `${label}; actual ledger values. ${id.endsWith("Margin") || id === "expenseRatio" ? "Alert thresholds compare the relative percentage change, not percentage points." : ""}`,
        higherIsBetter: id === "totalExpenses" ? false : METRICS[id].higher,
        ...(id === "totalExpenses"
          ? { breakdown: [
              { label: "Cost of sales", value: point.metrics.costOfSales.actual },
              { label: "Operating expenses", value: point.metrics.operatingExpenses.actual },
            ] }
          : {}),
        unit:
          id.endsWith("Margin") || id === "expenseRatio" ? "ratio" : "money",
        value: c.actual,
        prior: c.reference,
        comparison: c,
        change:
          c.absolute === null
            ? null
            : {
                absolute: c.absolute,
                percentage: c.percentage,
                direction:
                  Number(c.absolute) > 0 ? 1 : Number(c.absolute) < 0 ? -1 : 0,
              },
      } as KpiMetric;
    }),
  };
}
export const PNL_METRICS: Metric[] = [
  "revenue",
  "costOfSales",
  "grossProfit",
  "otherIncome",
  "totalRevenue",
  "operatingExpenses",
  "netProfit",
];
export function comparisonPoint(
  series: SourceSeries,
  period: number,
  metric: Metric,
) {
  return series[period]?.metrics[metric];
}

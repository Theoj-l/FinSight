import type { KpiData, KpiMetric } from "@/app/dashboard/data/kpi-presentation";
import {
  METRICS,
  SOURCES,
  addMonth,
  monthLabel,
  type FinancialBundle,
  type Metric,
  type Source,
  type SourceSeries,
} from "./types";
export const KPI_METRICS = [
  "revenue",
  "grossProfit",
  "netProfit",
  "grossMargin",
  "netMargin",
  "expenseRatio",
] as const;
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
      const c = point.metrics[id];
      return {
        id,
        label: METRICS[id].label,
        description: `${METRICS[id].label}; actual ledger values. ${id.endsWith("Margin") || id === "expenseRatio" ? "Comparison measures relative percentage change, not percentage points." : ""}`,
        higherIsBetter: METRICS[id].higher,
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

import type { KpiData } from "@/app/dashboard/data/kpi-presentation";
import { METRICS, notificationId, type Metric } from "./types";
export function financialAlerts(data: KpiData) {
  if (!data.comparisonSource) return [];
  const source = data.comparisonSource;
  const metrics = data.financialComparisons
    ? Object.entries(data.financialComparisons).map(([id, comparison]) => ({
        id,
        label: METRICS[id as Metric].label,
        comparison,
      }))
    : data.metrics;
  return metrics.flatMap((metric) => {
    const c = metric.comparison;
    if (
      !c?.breach ||
      !c.unfavorable ||
      c.percentage === null ||
      !(metric.id in METRICS)
    )
      return [];
    return [
      {
        id: `${notificationId(data.period, metric.id as Metric, source, c)}:${data.comparisonBudgetId ?? ""}`,
        type: "financial" as const,
        metric,
        value: c.percentage,
        comparison: c,
        source,
        budgetId: data.comparisonBudgetId,
        label: data.comparisonLabel ?? source,
      },
    ];
  });
}

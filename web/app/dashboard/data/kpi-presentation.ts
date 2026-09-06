export const metricIds = ["revenue", "grossProfit", "netProfit", "budgetVariance", "grossMargin", "netMargin"] as const;
export type MetricId = typeof metricIds[number];
export type Change = { absolute: string; percentage: number | null; direction: -1 | 0 | 1 };
export type KpiMetric = {
  id: MetricId;
  label: string;
  unit: "money" | "ratio";
  value: string | null;
  prior: string | null;
  change: Change | null;
  description: string;
  budgetComparison?: Change | null;
};
export type KpiData = { period: string; priorPeriod: string; metrics: KpiMetric[]; notices: string[] };
export type Threshold = { enabled: boolean; min: number; max: number };
export type Thresholds = Record<MetricId, Threshold>;
export function defaultThresholds(): Thresholds {
  return Object.fromEntries(metricIds.map(id => [id, { enabled: true, min: 0, max: 0 }])) as Thresholds;
}
export function validThresholds(value: unknown): value is Thresholds {
  if (!value || typeof value !== "object") return false;
  return metricIds.every(id => {
    const entry = (value as Thresholds)[id];
    return entry && typeof entry.enabled === "boolean" && Number.isFinite(entry.min) && Number.isFinite(entry.max) && entry.min <= entry.max;
  });
}
export function needsAttention(value: number | null | undefined, threshold: Threshold) {
  return threshold.enabled && value != null && (value < threshold.min || value > threshold.max);
}
export function outcome(direction: -1 | 0 | 1, higherIsBetter = true) {
  return direction === 0 ? "neutral" : (direction > 0) === higherIsBetter ? "favorable" : "unfavorable";
}
export function formatAmount(value: string, unit: "money" | "ratio") {
  const negative = value.startsWith("-");
  const [whole, fraction = "00"] = value.replace(/^-/, "").split(".");
  return `${negative ? "−" : ""}${unit === "money" ? "S$" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}${unit === "ratio" ? "%" : ""}`;
}
export function formatPercentage(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value) < 0.1 ? "<0.1" : Math.abs(value).toFixed(1)}%`;
}

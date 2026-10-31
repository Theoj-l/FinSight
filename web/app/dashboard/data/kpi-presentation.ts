import type { Comparison, Metric, Rules, Source } from "@/lib/financial/types";
import { BASE_CURRENCY, convertAmount, fxSymbol, type FxContext } from "@/lib/currency";

export const metricIds = ["revenue", "totalExpenses", "grossProfit", "netProfit", "budgetVariance", "grossMargin", "netMargin", "expenseRatio"] as const;
export type MetricId = typeof metricIds[number];
export type Change = { absolute: string; percentage: number | null; direction: -1 | 0 | 1 };
export type KpiMetric = {
  comparison?: Comparison;
  higherIsBetter?: boolean;
  id: MetricId;
  label: string;
  unit: "money" | "ratio";
  value: string | null;
  prior: string | null;
  change: Change | null;
  description: string;
  budgetComparison?: Change | null;
  /** Parts that add up to the value (Total expenses: cost of sales, operating expenses). */
  breakdown?: { label: string; value: string | null }[];
};
export type KpiData = { comparisonSource?: Source; comparisonBudgetId?: string; financialComparisons?: Record<Metric, Comparison>; comparisonLabel?: string; financialRules?: Rules; period: string; priorPeriod: string; metrics: KpiMetric[]; notices: string[] };
export type Threshold = { enabled: boolean; min: number; max: number };
export type Thresholds = Record<MetricId, Threshold>;
function validThreshold(value: unknown): value is Threshold {
  if (!value || typeof value !== "object") return false;
  const entry = value as Threshold;
  return typeof entry.enabled === "boolean" && Number.isFinite(entry.min) && Number.isFinite(entry.max) && entry.min <= entry.max;
}
export function resolveThreshold(value: unknown): Threshold {
  return validThreshold(value) ? value : { enabled: true, min: 0, max: 0 };
}
export function defaultThresholds(): Thresholds {
  return Object.fromEntries(metricIds.map(id => [id, resolveThreshold(undefined)])) as Thresholds;
}
export function validThresholds(value: unknown): value is Thresholds {
  if (!value || typeof value !== "object") return false;
  return metricIds.every(id => validThreshold((value as Thresholds)[id]));
}
export function normalizeThresholds(value: unknown): Thresholds {
  const settings = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(metricIds.map(id => [id, resolveThreshold(settings[id])])) as Thresholds;
}
export function restoreThresholds(raw: string | null): Thresholds {
  try {
    return normalizeThresholds(raw ? JSON.parse(raw) : null);
  } catch { return defaultThresholds(); }
}
export function needsAttention(value: number | null | undefined, threshold?: Threshold | null) {
  const limits = resolveThreshold(threshold);
  return limits.enabled && value != null && Number.isFinite(value) && (value < limits.min || value > limits.max);
}
export function outcome(direction: -1 | 0 | 1, higherIsBetter = true) {
  return direction === 0 ? "neutral" : (direction > 0) === higherIsBetter ? "favorable" : "unfavorable";
}
export function formatAmount(value: string, unit: "money" | "ratio", fx?: FxContext | null) {
  if (unit === "money" && fx && fx.currency !== BASE_CURRENCY) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const converted = convertAmount(numeric, fx);
      const [whole, fraction = "00"] = Math.abs(converted).toFixed(2).split(".");
      return `${converted < 0 ? "−" : ""}${fxSymbol(fx)}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
    }
  }
  const negative = value.startsWith("-");
  const [integer, decimal = ""] = value.replace(/^-/, "").split(".");
  // Round for display with integer arithmetic; keep exact saved/calculated
  // values intact, including amounts beyond JavaScript's safe integer limit.
  const cents = BigInt(integer) * BigInt(100) + BigInt(decimal.padEnd(2, "0").slice(0, 2)) + (Number(decimal[2] ?? "0") >= 5 ? BigInt(1) : BigInt(0));
  const whole = (cents / BigInt(100)).toString(), fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "−" : ""}${unit === "money" ? "S$" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}${unit === "ratio" ? "%" : ""}`;
}
export function formatPercentage(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value) < 0.1 ? "<0.1" : Math.abs(value).toFixed(1)}%`;
}

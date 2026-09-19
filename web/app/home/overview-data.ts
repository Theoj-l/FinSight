import { needsAttention, outcome, type KpiData, type Thresholds } from "@/app/dashboard/data/kpi-presentation";

// Explicit labels avoid Node/browser ICU differences (for example, Sep vs Sept).
// Financial reporting timestamps use Singapore's UTC+08:00 offset.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, "0");

export function reportingMonth(period: string) {
  const date = new Date(`${period}-01T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid reporting month");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function timestamp(value: string) {
  const date = new Date(new Date(value).getTime() + SINGAPORE_OFFSET_MS);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid timestamp");
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} SGT`;
}

export function reportingStatus(period: string, loadedAt: string) {
  const today = new Date(new Date(loadedAt).getTime() + SINGAPORE_OFFSET_MS);
  const current = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  if (period > current) return "Future reporting period · these figures are not current performance.";
  if (period === current) return "Current reporting month · figures may be incomplete.";
  const age = (today.getUTCFullYear() - Number(period.slice(0, 4))) * 12 + today.getUTCMonth() + 1 - Number(period.slice(5));
  return age > 1 ? "Historical reporting period · more recent ledger data is not available." : "Monthly ledger totals · subject to subsequent postings.";
}

export function thresholdAlerts(data: KpiData, thresholds: Thresholds) {
  return data.metrics.flatMap(metric => {
    const comparison = metric.id === "budgetVariance" ? metric.budgetComparison : metric.change;
    const value = comparison?.percentage;
    const threshold = thresholds[metric.id];
    if (metric.value === null || !needsAttention(value, threshold) || value == null || !comparison) return [];
    const favorable = outcome(comparison.direction, metric.higherIsBetter) === "favorable";
    if (outcome(comparison.direction, metric.higherIsBetter) !== "unfavorable") return [];
    const side = value < threshold.min ? "below" : "above";
    return [{
      // Keep the first-shown time across refreshes, but distinguish periods and changed limits.
      id: `${data.period}:${metric.id}:${threshold.min}:${threshold.max}:${side}`,
      metric, value, threshold, favorable, side,
    }];
  });
}

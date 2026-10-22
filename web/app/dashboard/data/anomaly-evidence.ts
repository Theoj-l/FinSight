import type { AnomalyAlert } from "./anomalies-utils";

export type EvidenceRecord = {
  id: string; source: "ledger" | "invoice" | "sales_invoice";
  [key: string]: string | number | null;
};
export type AnomalyFinding = {
  code: string; text: string; recordLabel: string; refs: string[];
  comparison: { actual: number | null; baseline: number | null; unit: string; periods: number[]; label: string };
  chart: "revenue" | "gross" | null;
  history: { periodNo: number; value: number | null }[];
};
export type AnomalyEvidence = { version: 1; asOf: string; findings: AnomalyFinding[]; records: Record<string, EvidenceRecord> };
export type AlertDetails = { alert: AnomalyAlert; finding: AnomalyFinding | null; findings: AnomalyFinding[]; records: EvidenceRecord[]; total: number; page: number; pages: number; asOf?: string; missing: number; notice?: string };
export type ChartAnomaly = { alert: AnomalyAlert; finding: AnomalyFinding };

export function readEvidence(value: unknown): AnomalyEvidence | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Partial<AnomalyEvidence>;
  if (e.version !== 1 || !Array.isArray(e.findings) || !e.records || typeof e.asOf !== "string") return null;
  return e as AnomalyEvidence;
}
export function anomalyChartHref(alert: AnomalyAlert, finding: AnomalyFinding): string | null {
  if (alert.kind !== "dept" || !finding.chart) return null;
  const query = new URLSearchParams({ period: String(alert.periodNo), unit: alert.unitKey, anomaly: alert.id, reason: finding.code });
  if (finding.chart === "gross") query.set("profitMode", "gross");
  return `/dashboard?${query}#${finding.chart === "gross" ? "profit-margin-title" : "revenue-expense-title"}`;
}
export function comparisonText(finding: AnomalyFinding) {
  const c = finding.comparison;
  const format = (v: number) => c.unit === "ratio" ? `${(v * 100).toFixed(2)}%` : `${c.unit === "SGD" ? "SGD " : ""}${v.toLocaleString("en-SG", { maximumFractionDigits: 2 })}`;
  return c.actual === null ? c.label : `${format(c.actual)}${c.baseline === null ? "" : ` vs ${format(c.baseline)}`} · ${c.label}`;
}
export function previousCalendarMonths(period: number, count = 12): number[] {
  const date = new Date(Date.UTC(Math.floor(period / 100), period % 100 - 1 - count, 1));
  return Array.from({ length: count + 1 }, (_, i) => {
    const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + i, 1));
    return month.getUTCFullYear() * 100 + month.getUTCMonth() + 1;
  });
}

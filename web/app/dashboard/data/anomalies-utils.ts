// Keep aligned with ml-service/app/anomaly/schema.py FIRST_SCORED_PERIOD.
export const FIRST_ANOMALY_PERIOD = 202201;

export type AnomalyKind = "dept" | "acc" | "cust";

export const ANOMALY_KIND_LABEL: Record<AnomalyKind, string> = {
  dept: "Business unit",
  acc: "Expense account",
  cust: "Customer",
};

export type AnomalyAlert = {
  /** `${kind}:${unitKey}:${periodNo}`. Stable across rescoring, so safe as a notification id. */
  id: string;
  kind: AnomalyKind;
  /** dept_no, acc_no or debtor code, depending on kind. */
  unitKey: string;
  /** Business unit, account or customer name; the key when no name is found. */
  unitLabel: string;
  periodNo: number;
  /** Model probability, 0 to 1. Every stored row is already above the alert threshold. */
  score: number;
  /** Plain-English evidence, strongest first. Safe to show as-is. */
  reasons: string[];
  firstFlaggedAt: string;
  modelVersion: string;
};

export type AnomalyStatus = {
  scoredFrom?: number;
  /** When the alerts on screen were produced. */
  scoredAt: string;
  /** Latest month scored (YYYYMM). Later months are provisional: not scored yet. */
  scoredThrough: number | null;
  dataThrough: number | null;
  modelVersion: string;
  alertCount: number;
};

export type AnomalyAlertRow = {
  unit_kind: string;
  unit_key: string;
  period_no: number;
  score: number;
  reasons: unknown;
  first_flagged_at: Date;
  model_version: string;
};

export type AnomalyLabels = Record<AnomalyKind, Map<string, string | null>>;

export function anomalyId(kind: AnomalyKind, unitKey: string, periodNo: number): string {
  return `${kind}:${unitKey}:${periodNo}`;
}

export function toAnomalyAlert(row: AnomalyAlertRow, labels: AnomalyLabels): AnomalyAlert {
  const kind = row.unit_kind as AnomalyKind;
  const reasons = Array.isArray(row.reasons) ? row.reasons.filter((r): r is string => typeof r === "string") : [];
  return {
    id: anomalyId(kind, row.unit_key, row.period_no),
    kind,
    unitKey: row.unit_key,
    unitLabel: labels[kind]?.get(row.unit_key)?.trim() || row.unit_key,
    periodNo: row.period_no,
    score: row.score,
    reasons,
    firstFlaggedAt: row.first_flagged_at.toISOString(),
    modelVersion: row.model_version,
  };
}

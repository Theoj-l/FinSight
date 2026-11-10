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

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthIndex = (period: number) => Math.floor(period / 100) * 12 + (period % 100) - 1;
const monthName = (period: number) => MONTH_NAMES[(period % 100) - 1];

/**
 * Months as compact runs: [202602..202607] → "Feb–Jul 2026", a run across a
 * year → "Nov 2025 – Jan 2026", gaps → "Mar 2026, May–Jul 2026".
 */
export function describeMonths(periods: number[]): string {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const period of sorted) {
    const last = runs[runs.length - 1];
    if (last && monthIndex(period) === monthIndex(last[1]) + 1) last[1] = period;
    else runs.push([period, period]);
  }
  return runs.map(([from, to]) => {
    const fromYear = Math.floor(from / 100), toYear = Math.floor(to / 100);
    if (from === to) return `${monthName(from)} ${fromYear}`;
    return fromYear === toYear ? `${monthName(from)}–${monthName(to)} ${toYear}` : `${monthName(from)} ${fromYear} – ${monthName(to)} ${toYear}`;
  }).join(", ");
}

export type AnomalyGroup = {
  /** `${kind}:${unitKey}` */
  key: string;
  kind: AnomalyKind;
  unitKey: string;
  unitLabel: string;
  /** This unit's alerts in the selected period, newest first. */
  alerts: AnomalyAlert[];
  /** Every month this unit was flagged, oldest first, including earlier months passed as history. */
  months: number[];
  latestPeriod: number;
  maxScore: number;
  /** Distinct reasons, newest month's first. */
  reasons: string[];
};

/**
 * One group per business unit, account or customer, so a unit flagged in
 * several months is listed once. `history` (earlier months, outside the
 * selected period) only adds to `months`, to show that a flag is recurring.
 * Strongest group first.
 */
export function groupAnomalies(alerts: AnomalyAlert[], history: AnomalyAlert[] = []): AnomalyGroup[] {
  const groups = new Map<string, AnomalyGroup>();
  const newestFirst = [...alerts].sort((a, b) => b.periodNo - a.periodNo || b.score - a.score);
  for (const alert of newestFirst) {
    const key = `${alert.kind}:${alert.unitKey}`;
    const group = groups.get(key) ?? { key, kind: alert.kind, unitKey: alert.unitKey, unitLabel: alert.unitLabel, alerts: [], months: [], latestPeriod: alert.periodNo, maxScore: 0, reasons: [] };
    group.alerts.push(alert);
    group.months.push(alert.periodNo);
    group.maxScore = Math.max(group.maxScore, alert.score);
    for (const reason of alert.reasons) if (!group.reasons.includes(reason)) group.reasons.push(reason);
    groups.set(key, group);
  }
  for (const alert of history) groups.get(`${alert.kind}:${alert.unitKey}`)?.months.push(alert.periodNo);
  for (const group of groups.values()) group.months = [...new Set(group.months)].sort((a, b) => a - b);
  return [...groups.values()].sort((a, b) => b.maxScore - a.maxScore || b.latestPeriod - a.latestPeriod);
}

/**
 * The question an "Ask the assistant" button sends about one flagged unit, laid out on
 * separate lines so it reads well in the chat: what was flagged, why, and the ask.
 */
export function anomalyQuestion(unitLabel: string, kind: AnomalyKind, when: string, reasons: readonly string[]): string {
  const tidy = (reason: string) => {
    const text = reason.trim().replace(/[.;]+$/, "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const shown = reasons.map(tidy).filter(Boolean).slice(0, 3);
  return [
    "Explain this anomaly:",
    `${unitLabel} · ${ANOMALY_KIND_LABEL[kind]} · ${when}`,
    ...(shown.length ? ["", "Why it was flagged:", ...shown.map((reason) => `• ${reason}`)] : []),
    "",
    "What could cause it, and what should I check?",
  ].join("\n");
}

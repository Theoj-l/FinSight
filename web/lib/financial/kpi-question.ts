// ---------------------------------------------------------------------------
// kpi-question.ts — the question the AI button on an amber or red KPI card sends
// to the assistant, laid out on lines like the anomaly one (anomalyQuestion).
// Pure: the card passes the figures already formatted as it shows them.
// ---------------------------------------------------------------------------

import { TRAFFIC_LIGHT_LABEL, type TrafficLight } from "./traffic-light";

/** Only amber ("Attention required") and red ("Unfavourable") figures get the button. */
export const needsExplaining = (status: TrafficLight) => status === "attention" || status === "unfavourable";

export interface KpiQuestionInput {
  label: string;
  status: TrafficLight;
  /** Reporting month, e.g. "Aug 2026", when known. */
  period?: string | null;
  /** The figure as shown, e.g. "S$5,117,060" or "29.22%". */
  value: string;
  /** The change as shown, e.g. "Up S$343,840 (+7.2%)", or null without a comparison. */
  change: string | null;
  /** What it is compared with, e.g. "Jul 2026" or "budget". */
  reference: string;
  /** The comparison figure as shown, when there is one. */
  prior?: string | null;
}

export function kpiQuestion({ label, status, period, value, change, reference, prior }: KpiQuestionInput): string {
  // Short labelled lines: the chat bubble is narrow, and long lines wrap mid-phrase.
  const movement = change ? `${change.charAt(0).toUpperCase()}${change.slice(1)}` : "No change figure";
  return [
    `Explain the movement in ${label.toLowerCase()}${period ? ` (${period})` : ""}.`,
    "",
    `• Now: ${value}`,
    `• Change: ${movement} vs ${reference}`,
    ...(prior ? [`• Before: ${prior}`] : []),
    `• Status: ${TRAFFIC_LIGHT_LABEL[status]}`,
    "",
    "What drove it, and what should I check?",
  ].join("\n");
}

export interface ThresholdQuestionInput {
  label: string;
  /** Reporting month, e.g. "Aug 2026". */
  period: string;
  /** The figure and what it is compared with, as shown, e.g. "29.22%" and "30.00%". */
  value: string;
  reference: string;
  /** What the reference is, e.g. "Budget" or "Same month last year". */
  referenceLabel: string;
  /** The movement as shown, e.g. "-2.60%". */
  movement: string;
  /** The allowed unfavourable movement, in percent. */
  tolerance: number | string;
}

/** The question the AI button on a home-page threshold alert sends, in the same layout as kpiQuestion. */
export function thresholdQuestion({ label, period, value, reference, referenceLabel, movement, tolerance }: ThresholdQuestionInput): string {
  return [
    `Explain why ${label.toLowerCase()} went past its threshold (${period}).`,
    "",
    `• Now: ${value}`,
    `• ${referenceLabel}: ${reference}`,
    `• Movement: ${movement} (threshold ${tolerance}%)`,
    "• Status: Unfavourable",
    "",
    "What drove it, and what should I check?",
  ].join("\n");
}

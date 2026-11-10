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

"use client";
import { useEffect } from "react";
import type { ChartAnomaly } from "../data/anomaly-evidence";
import { comparisonText } from "../data/anomaly-evidence";

export function ChartAnomalyNote({ focus, target, ready }: { focus?: ChartAnomaly | null; target: string; ready: boolean }) {
  useEffect(() => {
    if (!focus || !ready) return;
    const heading = document.getElementById(target);
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start", behavior: "instant" });
  }, [focus, ready, target]);
  if (!focus) return null;
  return <details open className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Anomaly comparison · {focus.alert.unitLabel} · {focus.alert.periodNo}</summary>
    <p className="mt-2">{focus.finding.text}</p>
    <p className="mt-2 font-medium">{comparisonText(focus.finding)}</p>
    <p className="mt-2 text-xs text-muted">The amber marker identifies the flagged month. The model comparison includes other income; the additional model series uses that definition. Standard revenue and gross profit exclude other income. Evidence reflects the last scoring run.</p>
  </details>;
}

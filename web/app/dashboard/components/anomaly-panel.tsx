"use client";
import { useState } from "react";
import { AnomalyAlert } from "@/app/components/anomalies/anomaly-alert";
import { AnomalyStatusText } from "@/app/components/anomalies/anomaly-status";
import { FIRST_ANOMALY_PERIOD, type AnomalyAlert as Alert, type AnomalyStatus } from "../data/anomalies-utils";

export function AnomalyPanel({ alerts, status, error, periodStart, periodEnd, branch }: { alerts: Alert[]; status: AnomalyStatus | null; error?: string; periodStart?: number; periodEnd?: number; branch?: boolean }) {
  const [all, setAll] = useState(false);
  const unchecked = !status?.scoredThrough || !!(periodEnd && periodEnd > status.scoredThrough) || !!(periodStart && periodStart < (status?.scoredFrom ?? FIRST_ANOMALY_PERIOD));
  return <section aria-labelledby="anomaly-heading" className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 id="anomaly-heading" className="text-lg font-semibold text-brand-navy">Anomalies to review{alerts.length ? ` (${alerts.length})` : ""}</h2>
    <div className="mt-2"><AnomalyStatusText status={status} error={error} /></div>
    {branch ? <p role="status" className="mt-3 text-sm text-muted">Branch-level anomaly attribution is unavailable. Select All Branches to review anomalies.</p> : error ? <p role="alert" className="mt-3 text-sm text-red-700">Anomaly results could not be loaded. Refresh to retry.</p> : <>
      {unchecked && <p role="status" className="mt-3 text-sm text-amber-900">The selected period includes months not yet checked by the model.</p>}
      {!alerts.length && !unchecked && <p role="status" className="mt-3 text-sm text-muted">No anomalies detected for this reporting scope.</p>}
      <div className="mt-4 space-y-3">{(all ? alerts : alerts.slice(0, 3)).map(alert => <AnomalyAlert key={alert.id} alert={alert} />)}</div>
      {alerts.length > 3 && <button aria-expanded={all} className="mt-3 text-sm font-semibold text-brand-blue" onClick={() => setAll(!all)}>{all ? "Show fewer" : `View all ${alerts.length}`}</button>}
    </>}
  </section>;
}

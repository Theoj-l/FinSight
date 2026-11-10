"use client";
import { useState } from "react";
import { ChevronDown, Repeat, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnomalyAlert } from "@/app/components/anomalies/anomaly-alert";
import { AnomalyStatusText } from "@/app/components/anomalies/anomaly-status";
import { AskAssistantButton } from "@/app/components/chat/ask-assistant";
import { ANOMALY_KIND_LABEL, FIRST_ANOMALY_PERIOD, anomalyQuestion, describeMonths, groupAnomalies, type AnomalyAlert as Alert, type AnomalyGroup, type AnomalyStatus } from "../data/anomalies-utils";

function explainQuestion(group: AnomalyGroup) {
  return anomalyQuestion(group.unitLabel, group.kind, describeMonths(group.alerts.map(alert => alert.periodNo)), group.reasons);
}

// Months listed before "Show earlier months" in a recurring group.
const SHOWN_MONTHS = 2;

function Group({ group }: { group: AnomalyGroup }) {
  const [all, setAll] = useState(false);
  const recurring = group.months.length > 1;
  const hidden = group.alerts.length - SHOWN_MONTHS;
  return (
    <details data-anomaly-group={group.key} className="group/unit rounded-xl border border-brand-navy/[.08] bg-white/80 shadow-[0_8px_24px_-20px_rgba(31,42,121,0.5)] open:bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-4 focus-visible:outline-2 focus-visible:outline-brand-blue [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-status-watch-soft text-status-watch"><TriangleAlert className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-brand-navy">{group.unitLabel}</span>
          <span className="mt-0.5 block text-xs text-muted">{ANOMALY_KIND_LABEL[group.kind]} · {describeMonths(group.alerts.map(alert => alert.periodNo))}{group.reasons[0] ? ` · ${group.reasons[0]}` : ""}</span>
        </span>
        {recurring && (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-bad-soft px-2.5 py-1 text-[11px] font-semibold text-status-bad" title={`Flagged in ${describeMonths(group.months)}`}>
            <Repeat aria-hidden="true" className="h-3 w-3" />Recurring · {group.months.length} months
          </span>
        )}
        {/* On phones the row wraps and the button would sit where people tap to
            expand, so there it moves inside the expanded group instead. */}
        <span className="hidden sm:contents"><AskAssistantButton question={explainQuestion(group)} /></span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open/unit:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-brand-navy/[.06] px-4 pb-4 pt-3">
        <div className="sm:hidden"><AskAssistantButton question={explainQuestion(group)} /></div>
        {recurring && <p className="text-xs text-muted">Flagged in {describeMonths(group.months)}{group.months.length > group.alerts.length ? " (including months before the selected period)" : ""}.</p>}
        {(all ? group.alerts : group.alerts.slice(0, SHOWN_MONTHS)).map(alert => <AnomalyAlert key={alert.id} alert={alert} inGroup />)}
        {hidden > 0 && <button type="button" aria-expanded={all} onClick={() => setAll(!all)} className="text-xs font-semibold text-brand-blue hover:text-brand-navy">{all ? "Show fewer months" : `Show ${hidden} earlier ${hidden === 1 ? "month" : "months"} (${describeMonths(group.alerts.slice(SHOWN_MONTHS).map(alert => alert.periodNo))})`}</button>}
      </div>
    </details>
  );
}

/**
 * "Anomalies to review" as a compact dropdown: a summary bar that says how many
 * flags there are and where, expanding to one row per business unit, account or
 * customer (a unit flagged in several months is listed once).
 * `history`: the same units' flags from the months before, to mark recurrence.
 */
export function AnomalyPanel({ alerts, history = [], status, error, periodStart, periodEnd, branch }: { alerts: Alert[]; history?: Alert[]; status: AnomalyStatus | null; error?: string; periodStart?: number; periodEnd?: number; branch?: boolean }) {
  const unchecked = !status?.scoredThrough || !!(periodEnd && periodEnd > status.scoredThrough) || !!(periodStart && periodStart < (status?.scoredFrom ?? FIRST_ANOMALY_PERIOD));
  const groups = groupAnomalies(alerts, history);
  const recurring = groups.filter(group => group.months.length > 1).length;
  const flagged = alerts.length > 0 && !branch && !error;
  const headline = branch ? "Not available for branches" : error ? "Unavailable" : !alerts.length ? (unchecked ? "Not checked for part of this period" : "No anomalies found") : `${alerts.length} ${alerts.length === 1 ? "flag" : "flags"} in ${groups.length} ${groups.length === 1 ? "area" : "areas"}${recurring ? ` · ${recurring} recurring` : ""}`;
  return (
    <section aria-labelledby="anomaly-heading" className="mt-8">
      <details className={`group/panel rounded-2xl ${flagged ? "border border-amber-300/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.78))] shadow-[0_18px_40px_-30px_rgba(180,83,9,0.55)]" : "glass"}`}>
        {/* A grid, so the heading can sit directly in <summary> (which allows phrasing and heading content only). */}
        <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 p-5 focus-visible:outline-2 focus-visible:outline-brand-blue [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className={`row-span-2 grid h-11 w-11 place-items-center rounded-2xl ${flagged ? "bg-amber-400/20 text-status-watch" : "bg-brand-blue-light text-brand-navy"}`}>
            {flagged ? <TriangleAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <h2 id="anomaly-heading" className="col-start-2 text-lg font-semibold text-brand-navy">Anomalies to review{alerts.length ? ` (${alerts.length})` : ""}</h2>
          <span className={`col-start-2 row-start-2 mt-0.5 text-sm ${flagged ? "font-medium text-status-watch" : "text-muted"}`}>{headline}</span>
          <span className="col-start-3 row-span-2 row-start-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
            <span className="group-open/panel:hidden">{flagged ? "Review" : "Details"}</span>
            <span className="hidden group-open/panel:inline">Hide</span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open/panel:rotate-180" />
          </span>
        </summary>
        <div className="space-y-3 border-t border-brand-navy/[.06] px-5 pb-5 pt-4">
          <AnomalyStatusText status={status} error={error} />
          {branch ? <p role="status" className="text-sm text-muted">Branch-level anomaly attribution is unavailable. Select All Branches to review anomalies.</p> : error ? <p role="alert" className="text-sm text-red-700">Anomaly results could not be loaded. Refresh to retry.</p> : <>
            {unchecked && <p role="status" className="text-sm text-amber-900">The selected period includes months not yet checked by the model.</p>}
            {!alerts.length && !unchecked && <p role="status" className="text-sm text-muted">No anomalies detected for this reporting scope.</p>}
            {groups.map(group => <Group key={group.key} group={group} />)}
          </>}
        </div>
      </details>
    </section>
  );
}

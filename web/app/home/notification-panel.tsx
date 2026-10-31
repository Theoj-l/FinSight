"use client";

import { AnomalyStatusText } from "@/app/components/anomalies/anomaly-status";
import type { AnomalyStatus } from "@/app/dashboard/data/anomalies-utils";
import { AnomalyAlert } from "@/app/components/anomalies/anomaly-alert";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Bell, CheckCheck, ChevronDown, X } from "lucide-react";
import { formatPercentage } from "@/app/dashboard/data/kpi-presentation";
import { AskAssistantButton } from "@/app/components/chat/ask-assistant";
import { formatWhole } from "@/app/components/financial/kpi-card";
import { ANOMALY_KIND_LABEL } from "@/app/dashboard/data/anomalies-utils";
import { formatPeriod } from "@/app/dashboard/data/revenue-expense-utils";
import { useCurrency } from "@/lib/currency-context";
import type { NotificationEntry } from "@/lib/notifications";
import { reportingMonth, timestamp } from "./overview-data";
import type { useHomeAlerts } from "./use-home-alerts";

type Notifications = ReturnType<typeof useHomeAlerts>;
const PREVIEW_SIZE = 2;

function NotificationRow({ alert, entry, markViewed, clear, period, dashboardHref }: {
  alert: Notifications["alerts"][number]; entry: NotificationEntry;
  markViewed: Notifications["markViewed"]; clear: () => void;
  period: string; priorPeriod: string; dashboardHref: string;
}) {
  const row = useRef<HTMLLIElement>(null);
  const fx = useCurrency();
  useEffect(() => {
    if (entry.viewedAt || !row.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(item => item.isIntersecting && item.intersectionRatio >= 0.5) && document.visibilityState === "visible") {
        markViewed([alert.id]);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(row.current);
    return () => observer.disconnect();
  }, [alert.id, entry.viewedAt, markViewed]);

  const fresh = !entry.viewedAt;
  const badge = <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${fresh ? "bg-brand-red text-white" : "bg-slate-100 text-muted"}`}>{fresh ? "New" : "Viewed"}</span>;

  if (alert.type === "anomaly") {
    const a = alert.anomaly;
    const question = `Explain the anomaly flagged for ${a.unitLabel} (${ANOMALY_KIND_LABEL[a.kind].toLowerCase()}) in ${reportingMonth(formatPeriod(a.periodNo))}${a.reasons.length ? `. The model's reasons: ${a.reasons.slice(0, 3).join("; ")}` : ""}. What could cause it and what should I check?`;
    return <li ref={row} className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted"><span className="flex items-center gap-2">{badge}<span className="font-semibold text-status-watch">Anomaly detected</span><span>· Notified {timestamp(entry.notifiedAt)}</span></span><span className="flex items-center gap-1"><AskAssistantButton question={question} /><button type="button" onClick={clear} aria-label={`Clear ${a.unitLabel} anomaly notification`} className="rounded-lg p-2 hover:bg-slate-100"><X aria-hidden="true" className="h-4 w-4" /></button></span></div>
      <AnomalyAlert alert={a} />
    </li>;
  }

  if (alert.type === "financial") {
    const ratio = alert.metric.id.endsWith("Margin") || alert.metric.id === "expenseRatio";
    const show = (value: string | null) => value === null ? "—" : ratio ? `${Number(value).toFixed(2)}%` : formatWhole(value, fx);
    const month = reportingMonth(period);
    const question = `Why did ${alert.metric.label.toLowerCase()} move ${formatPercentage(alert.value)} against ${alert.label.toLowerCase()} in ${month} (${show(alert.comparison.actual)} vs ${show(alert.comparison.reference)})? It is beyond the ${alert.comparison.tolerance}% threshold.`;
    return <li ref={row} className="rounded-xl border border-brand-red/25 bg-[linear-gradient(135deg,rgba(254,242,242,0.95),rgba(255,255,255,0.85))] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-status-bad">{badge}<span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-red" />Unfavourable</p><h3 className="mt-1.5 text-sm font-semibold text-slate-900">{alert.metric.label}: <span className="tabular-nums">{show(alert.comparison.actual)}</span> <span className="font-normal text-muted">vs {show(alert.comparison.reference)}</span></h3></div><button type="button" onClick={clear} aria-label={`Clear ${alert.metric.label} notification`} className="rounded-lg p-2 hover:bg-white"><X aria-hidden="true" className="h-4 w-4" /></button></div>
      <p className="mt-2 text-sm text-slate-700"><strong className="text-status-bad">{formatPercentage(alert.value)}</strong> against {alert.label}. Your threshold allows {alert.comparison.tolerance}% unfavourable movement.</p>
      <p className="mt-2 text-xs text-muted">Reporting month: {month} · Notified {timestamp(entry.notifiedAt)}</p>
      {alert.comparison.note && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Reference origin</summary>{alert.comparison.note}</details>}
      <div className="mt-3 flex flex-wrap items-center gap-3"><Link href={`${dashboardHref}${dashboardHref.includes("?") ? "&" : "?"}comparison=${alert.source}${alert.budgetId ? `&budgetId=${encodeURIComponent(alert.budgetId)}` : ""}#kpi-heading`} className="text-xs font-semibold text-brand-navy underline">Review financial comparison →</Link><AskAssistantButton question={question} /></div>
    </li>;
  }

  return null;
}

export function NotificationPanel({ notifications, period, priorPeriod, dashboardHref, evaluable, loadedAt, anomalyAvailable = false, anomalyStatus, anomalyError }: {
  notifications: Notifications; period?: string; priorPeriod?: string;
  dashboardHref: string; evaluable: number; loadedAt: string; anomalyAvailable?: boolean; anomalyStatus?: AnomalyStatus | null; anomalyError?: string;
}) {
  const { alerts, inbox, ready, preferences, unreadCount, viewedCount, pendingCount, nextDelivery } = notifications;
  const visible = inbox.collapsed ? alerts.slice(0, PREVIEW_SIZE) : alerts;
  const canExpand = alerts.length > PREVIEW_SIZE;
  const frequency = preferences.frequency === "immediate" ? "As new issues are found" : preferences.frequency === "daily" ? "Daily" : "Weekly";
  const emptyMessage = !preferences.enabled ? "Notifications are paused in Settings." : !period && !anomalyAvailable ? "Notifications unavailable until financial data is loaded." : !evaluable && !anomalyAvailable ? "No enabled threshold checks have a calculable comparison." : pendingCount ? "New alerts are waiting for your next notification update." : "No notifications to review.";

  return (
    <section aria-labelledby="home-attention" className="glass min-w-0 overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center gap-2 p-6 sm:p-7">
        <h2 id="home-attention" className="min-w-0 flex-1">
          <div className="flex w-full items-center gap-3">
            <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ${unreadCount ? "bg-status-bad-soft text-status-bad" : "bg-brand-blue-light text-brand-navy"}`}><Bell aria-hidden="true" className="h-5 w-5" />{ready && unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white ring-2 ring-white">{unreadCount}</span>}</span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-brand-navy">Notifications{ready && alerts.length > 0 ? ` (${alerts.length})` : ""}</span><span className="mt-0.5 block text-xs font-normal text-muted">{!ready ? "Loading…" : unreadCount ? `${unreadCount} unread · Requires attention` : alerts.length ? "All notifications viewed" : !preferences.enabled ? "Paused" : !period && !anomalyAvailable ? "Data unavailable" : !evaluable && !anomalyAvailable ? "No checks available" : pendingCount ? `${pendingCount} scheduled` : "No notifications"}</span></span>
          </div>
        </h2>
      </div>

      <div className="border-t border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-7">
          <p className="text-xs text-muted">{preferences.enabled ? frequency : "Notifications paused"}</p>
          <button type="button" disabled={!viewedCount} onClick={notifications.clearViewed} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-navy hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-blue"><CheckCheck aria-hidden="true" className="h-4 w-4" />Clear all viewed{viewedCount > 0 ? ` (${viewedCount})` : ""}</button>
        </div>
        {alerts.length > 0 ? <ul id="notification-content" key={String(inbox.collapsed)} aria-label="Notifications requiring attention" tabIndex={0} className={`space-y-4 overflow-y-auto overscroll-contain px-6 pb-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue sm:px-7 ${inbox.collapsed ? "max-h-[380px]" : "max-h-[520px]"}`}>
          {visible.map(alert => <NotificationRow key={alert.id} alert={alert} entry={inbox.entries[alert.id]} markViewed={notifications.markViewed} clear={() => notifications.clearOne(alert.id)} period={period ?? ""} priorPeriod={priorPeriod ?? ""} dashboardHref={dashboardHref} />)}
        </ul> : <p role="status" className="px-6 pb-6 text-sm text-muted sm:px-7">{!ready ? "Loading notifications…" : emptyMessage}</p>}

        {canExpand && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-xs text-muted sm:px-7">
          <span>{inbox.collapsed ? `Showing ${PREVIEW_SIZE} of ${alerts.length}` : `${alerts.length} notifications · Scroll to review`}</span>
          <button type="button" aria-expanded={!inbox.collapsed} aria-controls="notification-content" onClick={notifications.toggleCollapsed} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 font-semibold text-brand-navy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">{inbox.collapsed ? `View all ${alerts.length}` : "Show fewer"}<ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${inbox.collapsed ? "" : "rotate-180"}`} /></button>
        </div>}
        {pendingCount > 0 && nextDelivery !== null && <p className="px-6 pb-4 text-xs leading-5 text-muted sm:px-7">{pendingCount} new {pendingCount === 1 ? "alert" : "alerts"} scheduled for <time dateTime={new Date(nextDelivery).toISOString()}>{timestamp(new Date(nextDelivery).toISOString())}</time>, or when you next open Home.</p>}
        <div className="space-y-3 border-t border-slate-100 px-6 py-5 sm:px-7">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-brand-navy"><Link href="/settings#notifications" className="hover:text-brand-red">Notification settings</Link><Link href={"/settings#thresholds"} className="hover:text-brand-red">Threshold settings</Link></div>
          <p className="text-xs text-muted">Data checked <time dateTime={loadedAt}>{timestamp(loadedAt)}</time></p>
          {(anomalyStatus !== undefined || anomalyError) && <div className="space-y-1"><p className="text-xs font-medium text-muted">Anomaly results</p><AnomalyStatusText status={anomalyStatus} error={anomalyError} /></div>}
          <details className="text-xs leading-5 text-muted"><summary className="cursor-pointer">About notification history</summary><p className="mt-2">Clearing a notification does not resolve the underlying issue. {notifications.sessionOnly ? "Browser storage is unavailable; changes last for this visit." : "Notification history is saved for this account in this browser."}</p></details>
        </div>
      </div>
    </section>
  );
}

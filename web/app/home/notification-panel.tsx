"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatPercentage } from "@/app/dashboard/data/kpi-presentation";
import type { NotificationEntry } from "@/lib/notifications";
import { reportingMonth, timestamp } from "./overview-data";
import type { useHomeAlerts } from "./use-home-alerts";

type Notifications = ReturnType<typeof useHomeAlerts>;
const PAGE_SIZE = 3;

function NotificationRow({ alert, entry, markViewed, clear, period, priorPeriod, dashboardHref }: {
  alert: Notifications["alerts"][number]; entry: NotificationEntry;
  markViewed: Notifications["markViewed"]; clear: () => void;
  period: string; priorPeriod: string; dashboardHref: string;
}) {
  const row = useRef<HTMLLIElement>(null);
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

  return (
    <li ref={row} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">{entry.viewedAt ? "Viewed" : "New"} · Threshold alert</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">{alert.metric.label} {alert.side} your configured range</h3>
        </div>
        <button type="button" onClick={clear} aria-label={`Clear ${alert.metric.label} notification`} title="Clear notification" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-blue"><X aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{formatPercentage(alert.value)} {alert.metric.id === "budgetVariance" ? "actual net profit vs budget" : `change vs ${reportingMonth(priorPeriod)}`}. Range: {alert.threshold.min}% to {alert.threshold.max}%.</p>
      <p className="mt-2 text-xs text-muted">Reporting month: {reportingMonth(period)}</p>
      <p className="mt-1 text-xs text-muted">Notified <time dateTime={entry.notifiedAt}>{timestamp(entry.notifiedAt)}</time></p>
      <Link href={`${dashboardHref}#kpi-heading`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy hover:text-brand-red">Review KPI <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
    </li>
  );
}

export function NotificationPanel({ notifications, period, priorPeriod, dashboardHref, evaluable, loadedAt }: {
  notifications: Notifications; period?: string; priorPeriod?: string;
  dashboardHref: string; evaluable: number; loadedAt: string;
}) {
  const [page, setPage] = useState(0);
  const { alerts, inbox, ready, preferences, unreadCount, viewedCount, pendingCount, nextDelivery } = notifications;
  const pageCount = Math.max(1, Math.ceil(alerts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = alerts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const frequency = preferences.frequency === "immediate" ? "As new issues are found" : preferences.frequency === "daily" ? "Daily" : "Weekly";
  const emptyMessage = !preferences.enabled ? "Notifications are paused in Settings." : !period ? "Notifications unavailable until financial data is loaded." : !evaluable ? "No enabled threshold checks have a calculable comparison." : pendingCount ? "New alerts are waiting for your next notification update." : "No notifications to review.";

  return (
    <section aria-labelledby="home-attention" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 p-5">
        <h2 id="home-attention" className="min-w-0 flex-1">
          <button type="button" aria-expanded={!inbox.collapsed} aria-controls="notification-content" onClick={notifications.toggleCollapsed} disabled={!ready} className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><Bell aria-hidden="true" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-brand-navy">Notifications{ready && alerts.length > 0 ? ` (${alerts.length})` : ""}</span><span className="mt-0.5 block text-xs font-normal text-muted">{!ready ? "Loading…" : unreadCount ? `${unreadCount} unread · Requires attention` : alerts.length ? "All notifications viewed" : !preferences.enabled ? "Paused" : !period ? "Data unavailable" : !evaluable ? "No checks available" : pendingCount ? `${pendingCount} scheduled` : "No notifications"}</span></span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted transition-transform ${inbox.collapsed ? "" : "rotate-180"}`} />
          </button>
        </h2>
      </div>

      <div id="notification-content" hidden={inbox.collapsed} className="border-t border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <p className="text-xs text-muted">{preferences.enabled ? frequency : "Notifications paused"}</p>
          <button type="button" disabled={!viewedCount} onClick={notifications.clearViewed} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-navy hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-blue"><CheckCheck aria-hidden="true" className="h-4 w-4" />Clear all viewed{viewedCount > 0 ? ` (${viewedCount})` : ""}</button>
        </div>
        {!inbox.collapsed && alerts.length > 0 && period && priorPeriod ? <ul key={currentPage} aria-label="Notifications requiring attention" className="max-h-[420px] space-y-3 overflow-y-auto px-5 pb-4">
          {visible.map(alert => <NotificationRow key={alert.id} alert={alert} entry={inbox.entries[alert.id]} markViewed={notifications.markViewed} clear={() => notifications.clearOne(alert.id)} period={period} priorPeriod={priorPeriod} dashboardHref={dashboardHref} />)}
        </ul> : <p role="status" className="px-5 pb-4 text-sm text-muted">{emptyMessage}</p>}

        {alerts.length > PAGE_SIZE && <nav aria-label="Notification pages" className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-muted">
          <span>Page {currentPage + 1} of {pageCount}</span>
          <div className="flex gap-2"><button type="button" aria-label="Previous notifications" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 p-2 text-brand-navy hover:bg-slate-50 disabled:opacity-40"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button><button type="button" aria-label="Next notifications" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 p-2 text-brand-navy hover:bg-slate-50 disabled:opacity-40"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button></div>
        </nav>}
        {pendingCount > 0 && nextDelivery !== null && <p className="px-5 pb-3 text-xs leading-5 text-muted">{pendingCount} new {pendingCount === 1 ? "alert" : "alerts"} scheduled for <time dateTime={new Date(nextDelivery).toISOString()}>{timestamp(new Date(nextDelivery).toISOString())}</time>, or when you next open Home.</p>}
        <div className="space-y-2 border-t border-slate-100 px-5 py-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-brand-navy"><Link href="/settings#notifications" className="hover:text-brand-red">Notification settings</Link><Link href={`${dashboardHref}#kpi-settings`} className="hover:text-brand-red">Threshold settings</Link></div>
          <p className="text-xs leading-5 text-muted">Clearing a notification does not resolve the underlying issue. {notifications.sessionOnly ? "Browser storage is unavailable; changes last for this visit." : "Notification history is saved for this account in this browser."}</p>
          <p className="text-xs text-muted">Data checked <time dateTime={loadedAt}>{timestamp(loadedAt)}</time></p>
        </div>
      </div>
    </section>
  );
}

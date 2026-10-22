"use client";

import type { AnomalyAlert, AnomalyStatus } from "@/app/dashboard/data/anomalies-utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, CircleAlert, FileText, Lightbulb, MessageSquare, RefreshCw, Settings } from "lucide-react";
import { PageHeading } from "@/app/components/app-page";
import { formatAmount, formatPercentage, outcome, type KpiData } from "@/app/dashboard/data/kpi-presentation";
import { useCurrency } from "@/lib/currency-context";
import { reportingMonth, reportingStatus, timestamp } from "./overview-data";
import { useHomeAlerts } from "./use-home-alerts";
import { NotificationPanel } from "./notification-panel";
import { TourTarget } from "@/app/components/tour/tour-target";

const features = [
  { title: "Dashboard", href: "/dashboard", icon: BarChart3, copy: "Explore financial trends, compare periods and drill into your accounts." },
  { title: "Assistant", href: "/assistant", icon: MessageSquare, copy: "Visit your conversational workspace. Financial questions and forecast answers are in development." },
  { title: "Forecast", href: "/forecast", icon: Lightbulb, copy: "Compare actual performance with forward-looking projections." },
  { title: "Reports", href: "/reports", icon: FileText, copy: "Visit the reporting workspace and explore available report types." },
  { title: "Settings", href: "/settings", icon: Settings, copy: "Manage your account, display preferences and reporting currency." },
];
const headlineIds = ["revenue", "netProfit", "netMargin", "expenseRatio"];
const tones = { favorable: "text-emerald-700", unfavorable: "text-red-700", neutral: "text-muted" };
const panel = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const linkStyle = "inline-flex items-center gap-2 text-sm font-semibold text-brand-navy hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue";

export function HomeOverview({ userId, data, error, loadedAt, anomalyResult }: { anomalyResult?: { alerts: AnomalyAlert[]; status: AnomalyStatus | null; error?: string }; userId: string; data?: KpiData | null; error?: string; loadedAt: string }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const currency = useCurrency();
  // Do not label unconverted SGD values as a foreign currency while rates load.
  const rate = currency.rates?.[currency.currency];
  const fx = currency.currency === "SGD" || (rate && Number.isFinite(rate) && rate > 0)
    ? currency : { currency: "SGD" as const, rates: null };
  const financialData = error ? null : data;
  const notifications = useHomeAlerts(userId, financialData, anomalyResult?.alerts);
  const { thresholds } = notifications;
  const period = financialData ? reportingMonth(financialData.period) : null;
  const dashboardHref = financialData ? `/dashboard?period=${financialData.period.replace("-", "")}` : "/dashboard";
  const evaluable = financialData?.financialComparisons ? Object.values(financialData.financialComparisons).filter(c => c.enabled && c.percentage !== null).length : financialData?.metrics.filter(metric => metric.value !== null && thresholds[metric.id].enabled && Number.isFinite(metric.id === "budgetVariance" ? metric.budgetComparison?.percentage ?? NaN : metric.change?.percentage ?? NaN)).length ?? 0;

  return (
    <div className="flex flex-col gap-10 pb-4 lg:gap-14">
      <PageHeading eyebrow="Your workspace" title="Home" description="Welcome back. Here’s your financial overview and what needs attention."
        action={<div className="flex flex-wrap gap-3"><Link href="/assistant" className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-dark"><MessageSquare aria-hidden="true" className="h-4 w-4" />Open assistant</Link><button type="button" disabled={refreshing} onClick={() => startTransition(() => router.refresh())} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-navy shadow-sm transition hover:bg-slate-50 disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing…" : "Refresh overview"}</button></div>} />

      <section aria-label="Reporting context" className="relative overflow-hidden rounded-2xl bg-brand-navy px-6 py-8 text-white sm:px-9 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 h-80 w-80 rounded-full border-[45px] border-white/[.04]" />
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">Company overview · All business units</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">A clear view of the numbers.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">Start with performance, review the signals, then explore the detail.</p>
            <Link href={dashboardHref} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-brand-blue-light">Explore dashboard <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>
          <div className="w-full rounded-xl border border-white/15 bg-white/[.06] p-4 sm:w-auto sm:min-w-64">
            <p className="flex items-center gap-2 text-xs font-medium text-blue-200"><CalendarDays aria-hidden="true" className="h-4 w-4" />Latest available reporting month</p>
            <p className="mt-2 text-xl font-semibold">{period ?? "Unavailable"}</p>
            <p className="mt-2 max-w-72 text-xs leading-5 text-blue-100">{financialData ? reportingStatus(financialData.period, loadedAt) : "Connect ledger data to see financial performance."}</p>
            <p className="mt-3 border-t border-white/15 pt-3 text-xs text-blue-100">{error ? "Last attempted" : "Overview loaded"}<br /><time dateTime={loadedAt}>{timestamp(loadedAt)}</time></p>
          </div>
        </div>
      </section>

      <TourTarget id="home-snapshot">
      <section aria-labelledby="home-kpis">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="pl-6"><h2 id="home-kpis" className="text-lg font-semibold text-brand-navy">Financial snapshot</h2><p className="mt-1 text-sm text-muted">{period ? `${period} · All business units · ${fx.currency} · ${financialData?.comparisonLabel ?? "Previous month"}` : "Your key financial measures at a glance."}</p></div>
          <Link href={dashboardHref} className={linkStyle}>View all KPIs <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
        {!financialData ? <div role="status" className={`${panel} p-6`}><p className="font-medium text-brand-navy">{error ? "Financial snapshot unavailable" : "No financial data yet"}</p><p className="mt-2 text-sm text-muted">{error ?? "No ledger balances are available. Your KPIs and threshold alerts will appear when data is available."}</p><p className="mt-3 text-xs text-muted">Checked <time dateTime={loadedAt}>{timestamp(loadedAt)}</time></p></div> : <>
          <div className="grid gap-5 sm:grid-cols-2 lg:gap-6 xl:grid-cols-4">
            {headlineIds.map(id => financialData.metrics.find(metric => metric.id === id)).filter(metric => metric !== undefined).map(metric => {
              const change = metric.change;
              const tone = outcome(change?.direction ?? 0, metric.higherIsBetter);
              return <article key={metric.id} className={`${panel} min-w-0 border-t-[3px] border-t-brand-blue p-6`}>
                <h3 className="text-sm font-medium text-muted">{metric.label}</h3>
                <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-brand-navy tabular-nums">{metric.value === null ? "Unavailable" : formatAmount(metric.value, metric.unit, fx)}</p>
                <p className="mt-2 text-xs font-medium text-muted">Reporting month: <time dateTime={financialData.period}>{period}</time></p>
                <div className={`mt-4 flex items-start gap-1 text-sm font-medium ${tones[tone]}`}>
                  {change && change.direction !== 0 && (change.direction > 0 ? <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" /> : <ArrowDownRight aria-hidden="true" className="h-4 w-4 shrink-0" />)}
                  <span>{!change ? "Comparison unavailable" : change.percentage === null ? "Percentage unavailable · zero baseline" : formatPercentage(change.percentage)}{change && <span className="sr-only"> · {tone}</span>}</span>
                </div>
                <p className="mt-1 text-xs text-muted">vs {financialData.comparisonLabel ?? reportingMonth(financialData.priorPeriod)}{metric.prior !== null ? ` · ${formatAmount(metric.prior, metric.unit, fx)}` : ""}</p>
                <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-muted">{metric.description}</p>
              </article>;
            })}
          </div>
          <p className="mt-5 text-xs leading-5 text-muted">Loaded <time dateTime={loadedAt}>{timestamp(loadedAt)}</time> · Load time is when this overview was retrieved; it is not a ledger sync date. Margin and ratio changes are relative percentages, not percentage points.{fx.currency !== "SGD" && currency.date ? ` Exchange rates dated ${currency.date}.` : ""}{fx.currency !== currency.currency ? " Showing SGD while exchange rates are unavailable." : ""}</p>
        </>}
        {financialData && financialData.notices.length > 0 && (
          <details className="mt-6 border-t border-slate-100 pt-5">
            <summary className="cursor-pointer text-sm font-medium text-brand-navy"><CircleAlert aria-hidden="true" className="mr-2 inline h-4 w-4 text-amber-600" />Data availability</summary>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">{financialData.notices.map(notice => <li key={notice}>{notice}</li>)}</ul>
            <p className="mt-4 text-xs text-muted">Reporting month: {period}</p>
          </details>
        )}
      </section>
      </TourTarget>

      <TourTarget id="home-attention">
      <NotificationPanel notifications={notifications} period={financialData?.period} priorPeriod={financialData?.priorPeriod} dashboardHref={dashboardHref} evaluable={evaluable} loadedAt={loadedAt} anomalyAvailable={!!anomalyResult?.status && !anomalyResult.error} anomalyStatus={anomalyResult?.status} anomalyError={anomalyResult?.error} />
      </TourTarget>

      <section aria-labelledby="explore-heading">
        <h2 id="explore-heading" className="text-lg font-semibold text-brand-navy">Explore FinSight</h2>
        <p className="mt-1 text-sm text-muted">Pick up where your overview leaves off.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:gap-6 xl:grid-cols-5">{features.map(({ title, href, icon: Icon, copy }) => <Link key={href} href={href} className={`${panel} group p-6 transition hover:border-brand-blue/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-blue`}><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-blue-light text-brand-navy"><Icon aria-hidden="true" className="h-5 w-5" /></span><ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-blue" /></div><h3 className="mt-4 font-semibold text-brand-navy">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{copy}</p></Link>)}</div>
      </section>
    </div>
  );
}

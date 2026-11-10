"use client";

// Headline KPI cards shared by Home (Financial snapshot) and the Dashboard
// (Financial overview): dollar figures first, each with a traffic light and
// the change in context; ratios in a separate, smaller strip.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { KpiData, KpiMetric } from "@/app/dashboard/data/kpi-presentation";
import { formatPercentage } from "@/app/dashboard/data/kpi-presentation";
import { reportingMonth } from "@/app/home/overview-data";
import { BASE_CURRENCY, convertAmount, fxSymbol, type FxContext } from "@/lib/currency";
import { kpiQuestion, needsExplaining } from "@/lib/financial/kpi-question";
import { TRAFFIC_LIGHT_LABEL, trafficLight, type TrafficLight } from "@/lib/financial/traffic-light";
import { AskAssistantButton } from "@/app/components/chat/ask-assistant";

const TONE: Record<TrafficLight, { text: string; soft: string; dot: string; bar: string }> = {
  favourable: { text: "text-status-good", soft: "bg-status-good-soft", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  attention: { text: "text-status-watch", soft: "bg-status-watch-soft", dot: "bg-amber-400", bar: "bg-amber-400" },
  unfavourable: { text: "text-status-bad", soft: "bg-status-bad-soft", dot: "bg-brand-red", bar: "bg-brand-red" },
  unavailable: { text: "text-muted", soft: "bg-slate-100", dot: "bg-slate-300", bar: "bg-slate-200" },
};

/** What the figures are compared with, for "vs …" text: a month, or the chosen source. */
export function referenceLabel(data: Pick<KpiData, "comparisonSource" | "priorPeriod" | "comparisonLabel">) {
  switch (data.comparisonSource) {
    case "budget": return "budget";
    case "auto": return "auto forecast";
    case "manual": return "manual forecast";
    case "previous": return reportingMonth(data.priorPeriod);
    default: return data.comparisonLabel ?? reportingMonth(data.priorPeriod);
  }
}

/** Whole currency units for headline figures, e.g. S$6,029,162 (the exact value is in the title). */
export function formatWhole(value: string, fx?: FxContext | null) {
  const amount = Number(value);
  const convert = fx && fx.currency !== BASE_CURRENCY && fx.rates?.[fx.currency];
  const shown = convert ? convertAmount(amount, fx) : amount;
  return `${shown < 0 ? "−" : ""}${convert ? fxSymbol(fx) : "S$"}${Math.round(Math.abs(shown)).toLocaleString("en-US")}`;
}

function formatRatio(value: string) {
  return `${Number(value).toFixed(2)}%`;
}

export function StatusPill({ status, className = "" }: { status: TrafficLight; className?: string }) {
  const tone = TONE[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.soft} ${tone.text} ${className}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot} ${status === "unfavourable" ? "shadow-[0_0_0_3px_rgba(224,39,24,0.15)]" : ""}`} />
      {TRAFFIC_LIGHT_LABEL[status]}
    </span>
  );
}

function ChangeIcon({ direction }: { direction: number }) {
  const Icon = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus;
  return <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />;
}

/** "▲ S$406,648 (+7.2%)", or for a ratio "▼ 0.78 pts (−2.6%)". */
function changeText(metric: KpiMetric, fx?: FxContext | null) {
  const change = metric.change;
  if (!change) return null;
  const amount = metric.unit === "money" ? formatWhole(change.absolute.replace(/^-/, ""), fx) : `${Math.abs(Number(change.absolute)).toFixed(2)} pts`;
  const percent = change.percentage === null ? "no % change from a zero base" : formatPercentage(change.percentage);
  return change.direction === 0 ? "No change" : `${change.direction > 0 ? "Up" : "Down"} ${amount} (${percent})`;
}

/** The AI button on an amber or red figure: asks the assistant what drove the movement. */
function ExplainButton({ metric, status, period, reference, fx }: { metric: KpiMetric; status: TrafficLight; period?: string | null; reference: string; fx?: FxContext | null }) {
  if (!needsExplaining(status) || metric.value === null) return null;
  const show = (value: string) => (metric.unit === "money" ? formatWhole(value, fx) : formatRatio(value));
  const question = kpiQuestion({
    label: metric.label,
    status,
    period,
    value: show(metric.value),
    change: changeText(metric, fx),
    reference,
    prior: metric.prior === null ? null : show(metric.prior),
  });
  return <AskAssistantButton iconOnly question={question} label={`Ask the assistant about ${metric.label.toLowerCase()}`} />;
}

export function HeadlineCard({ metric, reference, fx, period }: { metric: KpiMetric; reference: string; fx?: FxContext | null; period?: string | null }) {
  const status = trafficLight(metric.comparison);
  const tone = TONE[status];
  const change = changeText(metric, fx);
  return (
    <article className="glass relative flex min-w-0 flex-col overflow-hidden rounded-2xl p-5 sm:p-6" data-status={status}>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-muted">{metric.label}</h3>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={status} />
          <ExplainButton metric={metric} status={status} period={period} reference={reference} fx={fx} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-navy tabular-nums xl:text-[2rem]" title={metric.value ?? undefined}>
        {metric.value === null ? "Unavailable" : metric.unit === "money" ? formatWhole(metric.value, fx) : formatRatio(metric.value)}
      </p>
      <p className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${tone.text}`}>
        {metric.change && <ChangeIcon direction={metric.change.direction} />}
        <span>{change ?? "Comparison unavailable"}</span>
      </p>
      <p className="mt-1 text-xs text-muted">
        vs {reference}{metric.prior !== null ? ` · ${metric.unit === "money" ? formatWhole(metric.prior, fx) : formatRatio(metric.prior)}` : ""}
      </p>
      {metric.breakdown && (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-brand-navy/[.06] pt-3 text-xs">
          {metric.breakdown.map(part => (
            <div key={part.label} className="min-w-0">
              <dt className="truncate text-muted">{part.label}</dt>
              <dd className="mt-0.5 font-semibold text-brand-navy tabular-nums">{part.value === null ? "—" : formatWhole(part.value, fx)}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="mt-auto pt-3 text-xs text-muted">
        <summary className="cursor-pointer select-none">Calculation &amp; alert basis</summary>
        <p className="mt-2">{metric.description}</p>
        {metric.comparison && <p className="mt-1">{metric.comparison.enabled ? `Turns red when an unfavourable change exceeds ${metric.comparison.tolerance}%.` : "Alerts are off for this figure, so unfavourable changes show amber."}</p>}
        {metric.comparison?.note && <p className="mt-1">{metric.comparison.note}</p>}
      </details>
    </article>
  );
}

/** A ratio, smaller: value, change in percentage points and a status dot. */
export function RatioTile({ metric, reference, period }: { metric: KpiMetric; reference: string; period?: string | null }) {
  const status = trafficLight(metric.comparison);
  const tone = TONE[status];
  return (
    <div className="glass flex min-w-0 items-center justify-between gap-4 rounded-2xl px-5 py-4" data-status={status}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-medium text-muted">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
          {metric.label}
          <span className="sr-only">: {TRAFFIC_LIGHT_LABEL[status]}</span>
        </p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-brand-navy tabular-nums">{metric.value === null ? "Unavailable" : formatRatio(metric.value)}</p>
      </div>
      <div className="flex items-center gap-3">
        <p className={`text-right text-xs font-semibold ${tone.text}`}>
          {changeText(metric) ?? "No comparison"}
          <span className="mt-0.5 block font-normal text-muted">vs {reference}{metric.prior !== null ? ` · ${formatRatio(metric.prior)}` : ""}</span>
        </p>
        <ExplainButton metric={metric} status={status} period={period} reference={reference} />
      </div>
    </div>
  );
}

/** One line that says at a glance what needs attention, by colour. */
export function AttentionSummary({ metrics }: { metrics: KpiMetric[] }) {
  const by = (status: TrafficLight) => metrics.filter(metric => trafficLight(metric.comparison) === status);
  const red = by("unfavourable"), amber = by("attention");
  if (!red.length && !amber.length) {
    return (
      <p role="status" className="glass mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-status-good">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
        No unfavourable movements beyond your thresholds.
      </p>
    );
  }
  return (
    <div role="status" className={`mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3 text-sm ${red.length ? "border-brand-red/25 bg-status-bad-soft/90" : "border-amber-300/60 bg-status-watch-soft/90"}`}>
      <span className="font-semibold text-brand-navy">Needs attention</span>
      {red.length > 0 && <span className="flex items-center gap-2 text-status-bad"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-red" /><span><strong>{red.length} unfavourable:</strong> {red.map(metric => metric.label).join(", ")}</span></span>}
      {amber.length > 0 && <span className="flex items-center gap-2 text-status-watch"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" /><span><strong>{amber.length} to watch:</strong> {amber.map(metric => metric.label).join(", ")}</span></span>}
    </div>
  );
}

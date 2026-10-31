"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { TourTarget } from "@/app/components/tour/tour-target";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrencyCompact, formatCurrencyExact } from "@/lib/currency";
import { formatPeriod } from "@/app/dashboard/data/revenue-expense-utils";
import {
  FORECAST_METRICS,
  FORECAST_METRIC_LABEL,
  type ForecastMetric,
} from "@/app/dashboard/data/forecast-utils";
import type { ForecastData } from "@/app/dashboard/data/forecast";

type ChartPoint = {
  periodNo: number;
  actual?: number;
  previousProjection?: number;
  projection?: number;
  rangeLow?: number | null;
  rangeSize?: number | null;
};

function metricPoints(data: ForecastData, metric: ForecastMetric): ChartPoint[] {
  const series = data.series[metric];
  const points = new Map<number, ChartPoint>();
  series.history.forEach(point => points.set(point.periodNo, { periodNo: point.periodNo, actual: point.actual }));
  series.pastForecasts.forEach(point => points.set(point.periodNo, { ...points.get(point.periodNo), periodNo: point.periodNo, previousProjection: point.forecast }));
  series.forecast.forEach(point => points.set(point.periodNo, {
    ...points.get(point.periodNo),
    periodNo: point.periodNo,
    projection: point.value,
    rangeLow: point.low,
    rangeSize: point.low !== null && point.high !== null ? point.high - point.low : null,
  }));
  return [...points.values()].sort((a, b) => a.periodNo - b.periodNo);
}

function changeFromLatestActual(data: ForecastData, metric: ForecastMetric) {
  const series = data.series[metric];
  const actual = series.history.at(-1)?.actual;
  const projection = series.forecast[0]?.value;
  if (actual === undefined || projection === undefined || actual === 0) return null;
  return { amount: projection - actual, percent: ((projection - actual) / Math.abs(actual)) * 100 };
}

export function ForecastView({ data }: { data: ForecastData }) {
  const [metric, setMetric] = useState<ForecastMetric>("profit");
  const fx = useCurrency();
  const series = data.series[metric];
  const points = metricPoints(data, metric);
  const next = series.forecast[0];
  const latestActual = series.history.at(-1);
  const forecastStart = series.forecast[0]?.periodNo;
  const nextChange = changeFromLatestActual(data, metric);
  const forecastEnd = series.forecast.at(-1)?.periodNo;

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">Actuals and projections</h2>
          <p className="mt-1 text-sm text-muted">Solid lines show closed-month actuals; dashed lines are projections, not guarantees.</p>
        </div>
        <TourTarget id="forecast-metric" className="rounded-lg">
        <div className="flex rounded-lg border border-brand-navy/15 bg-white p-1" role="group" aria-label="Forecast metric">
          {FORECAST_METRICS.map(option => (
            <button key={option} type="button" onClick={() => setMetric(option)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${metric === option ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-blue-light"}`}>
              {FORECAST_METRIC_LABEL[option]}
            </button>
          ))}
        </div>
        </TourTarget>
      </div>

      <TourTarget id="forecast-summary">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard kind="actual" label="Latest closed actual" value={latestActual ? formatCurrencyExact(latestActual.actual, fx) : "—"} detail={latestActual ? `${formatPeriod(latestActual.periodNo)} · recorded in the ledger` : "No actual available"} accent="navy" />
        <SummaryCard kind="projected" label={`Next-month ${series.label.toLowerCase()}`} value={next ? formatCurrencyExact(next.value, fx) : "—"} detail={next ? `${formatPeriod(next.periodNo)} · model estimate, not a guarantee` : "No projection available"} accent="red" />
        <SummaryCard kind="projected" label="Projected change vs latest actual" value={nextChange ? `${nextChange.amount >= 0 ? "+" : "−"}${formatCurrencyExact(Math.abs(nextChange.amount), fx)}` : "—"} detail={nextChange ? `${nextChange.percent >= 0 ? "+" : ""}${nextChange.percent.toFixed(1)}% ${nextChange.amount >= 0 ? "higher" : "lower"} than ${latestActual ? formatPeriod(latestActual.periodNo) : "the latest actual"}` : "Comparison unavailable"} accent={nextChange && nextChange.percent < 0 ? "red" : "green"} />
      </div>
      </TourTarget>

      <TourTarget id="forecast-chart">
      <section aria-labelledby="forecast-chart-title" className="surface rounded-2xl p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="forecast-chart-title" className="text-base font-semibold text-brand-navy">{series.label} outlook</h3>
            <p className="mt-1 text-sm text-muted">Actuals through {formatPeriod(data.status.historyThrough)} · projections for the next {data.status.horizon} months</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Chart legend">
            <LegendItem color="#1f2a79" label="Actual (closed months)" />
            <LegendItem color="#e02718" label="Projected" dashed />
            <LegendItem color="#6f95d5" label="Earlier projections (accuracy check)" dashed />
            <LegendItem color="#86a9df" label="Typical outcome range" />
          </div>
        </div>
        <div className="h-[360px] w-full" role="img" aria-label={`${series.label} actual and forecast chart`}>
          <ResponsiveContainer width="100%" height="100%">
            {/* ComposedChart, not LineChart: the outcome-range band is drawn with <Area>, which LineChart does not render. */}
            <ComposedChart data={points} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#e6e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="periodNo" tickFormatter={formatPeriod} tick={{ fill: "#5b6079", fontSize: 11 }} minTickGap={28} />
              <YAxis tickFormatter={value => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 11 }} width={64} />
              <Tooltip
                labelFormatter={value => formatPeriod(Number(value))}
                formatter={(value, name) => [value === undefined || value === null ? "—" : formatCurrencyExact(Number(value), fx), name]}
              />
              {forecastStart && forecastEnd && <ReferenceArea x1={forecastStart} x2={forecastEnd} fill="#e02718" fillOpacity={0.045} stroke="none" label={{ value: "PROJECTED", position: "insideTop", fill: "#b42318", fontSize: 11, fontWeight: 600, letterSpacing: 1 }} />}
              {forecastStart && <ReferenceLine x={forecastStart} stroke="#e02718" strokeDasharray="4 4" label={{ value: "Forecast begins", position: "insideTopLeft", fill: "#b42318", fontSize: 11 }} />}
              <Area type="monotone" dataKey="rangeLow" stackId="forecast-range" stroke="none" fill="transparent" dot={false} activeDot={false} tooltipType="none" />
              <Area type="monotone" dataKey="rangeSize" stackId="forecast-range" name="Typical outcome range" stroke="#86a9df" strokeWidth={1} fill="#b9d0f2" fillOpacity={0.65} dot={false} activeDot={false} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#1f2a79" strokeWidth={2.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="previousProjection" name="Earlier projection" stroke="#6f95d5" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="projection" name="Projected" stroke="#e02718" strokeWidth={2.5} strokeDasharray="7 5" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      </TourTarget>

      <TourTarget id="forecast-horizon">
        <section aria-labelledby="forecast-horizon-title" className="surface rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-2"><h3 id="forecast-horizon-title" className="text-base font-semibold text-brand-navy">Forecast horizon</h3><ProjectedBadge /></div>
          <p className="mt-1 text-sm text-muted">Projected months for the selected scope. None of these months has closed yet.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-3">Projected month</th><th className="px-3 py-3 text-right">Projection</th><th className="px-3 py-3 text-right">Typical range</th><th className="px-3 py-3 text-right">Horizon</th></tr></thead>
              <tbody>{series.forecast.map(point => <tr key={point.periodNo} className="border-b border-slate-100 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(224,39,24,0.025)_10px_20px)] last:border-0"><td className="px-3 py-3 font-medium text-brand-navy"><span className="inline-flex items-center gap-2">{formatPeriod(point.periodNo)}<span className="rounded-full border border-dashed border-brand-red/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-bad">Forecast</span></span></td><td className="px-3 py-3 text-right italic text-brand-navy">{formatCurrencyExact(point.value, fx)}</td><td className="px-3 py-3 text-right text-muted">{point.low !== null && point.high !== null ? `${formatCurrencyCompact(point.low, fx)} – ${formatCurrencyCompact(point.high, fx)}` : "Unavailable"}</td><td className="px-3 py-3 text-right text-muted">{point.horizon} mo.</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </TourTarget>
    </div>
  );
}

function ProjectedBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-red/45 bg-status-bad-soft/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-status-bad">Projected</span>;
}

/** Actual figures sit on a solid card; projected ones on a dashed, hatched card with a "Projected" badge. */
function SummaryCard({ kind, label, value, detail, accent }: { kind: "actual" | "projected"; label: string; value: string; detail: string; accent: "navy" | "blue" | "red" | "amber" | "green" }) {
  const accentStyles = { navy: "bg-brand-navy", blue: "bg-brand-blue", red: "bg-brand-red", amber: "bg-amber-500", green: "bg-emerald-500" };
  const projected = kind === "projected";
  return <article data-kind={kind} className={`relative overflow-hidden rounded-2xl p-5 pl-6 ${projected ? "border border-dashed border-brand-red/35 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.86)_0_12px,rgba(254,242,242,0.7)_12px_24px)] shadow-[0_16px_36px_-30px_rgba(31,42,121,0.4)]" : "glass"}`}>
    <span className={`absolute inset-y-0 left-0 w-1 ${accentStyles[accent]}`} />
    <div className="flex items-start justify-between gap-3"><p className="text-sm text-muted">{label}</p>{projected ? <ProjectedBadge /> : <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Actual</span>}</div>
    <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${projected ? "text-brand-navy/90 italic" : "text-brand-navy"}`}>{value}</p>
    <p className="mt-1 text-xs text-muted">{detail}</p>
  </article>;
}

function LegendItem({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-0.5 w-5 ${dashed ? "border-t-2 border-dashed" : ""}`} style={dashed ? { borderColor: color } : { backgroundColor: color }} />{label}</span>;
}

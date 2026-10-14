"use client";

import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
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
  const rangeAvailable = Boolean(next && next.low !== null && next.high !== null);

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">Actuals and projections</h2>
          <p className="mt-1 text-sm text-muted">Solid lines show closed-month actuals; dashed lines are projections, not guarantees.</p>
        </div>
        <div className="flex rounded-lg border border-brand-navy/15 bg-white p-1" role="group" aria-label="Forecast metric">
          {FORECAST_METRICS.map(option => (
            <button key={option} type="button" onClick={() => setMetric(option)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${metric === option ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-blue-light"}`}>
              {FORECAST_METRIC_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label={`Next-month ${series.label.toLowerCase()}`} value={next ? formatCurrencyExact(next.value, fx) : "—"} detail={next ? `${formatPeriod(next.periodNo)} projection` : "No projection available"} accent="navy" />
        <SummaryCard label="Latest closed actual" value={latestActual ? formatCurrencyExact(latestActual.actual, fx) : "—"} detail={latestActual ? `${formatPeriod(latestActual.periodNo)} actual` : "No actual available"} accent="blue" />
        <SummaryCard label="Movement vs latest actual" value={nextChange ? `${nextChange.percent >= 0 ? "+" : ""}${nextChange.percent.toFixed(1)}%` : "—"} detail={nextChange ? `${nextChange.amount >= 0 ? "Higher" : "Lower"} by ${formatCurrencyExact(Math.abs(nextChange.amount), fx)}` : "Comparison unavailable"} accent={nextChange && nextChange.percent < 0 ? "red" : "green"} />
      </div>

      <section aria-labelledby="forecast-chart-title" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="forecast-chart-title" className="text-base font-semibold text-brand-navy">{series.label} outlook</h3>
            <p className="mt-1 text-sm text-muted">Actuals through {formatPeriod(data.status.historyThrough)} · projections for the next {data.status.horizon} months</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Chart legend">
            <LegendItem color="#1f2a79" label="Actual" />
            <LegendItem color="#6f95d5" label="Previous projection" dashed />
            <LegendItem color="#e02718" label="Future projection" dashed />
            <LegendItem color="#86a9df" label="Typical outcome range" />
          </div>
        </div>
        <div className="h-[360px] w-full" role="img" aria-label={`${series.label} actual and forecast chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#e6e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="periodNo" tickFormatter={formatPeriod} tick={{ fill: "#5b6079", fontSize: 11 }} minTickGap={28} />
              <YAxis tickFormatter={value => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 11 }} width={64} />
              <Tooltip
                labelFormatter={value => formatPeriod(Number(value))}
                formatter={(value, name) => [value === undefined || value === null ? "—" : formatCurrencyExact(Number(value), fx), name]}
              />
              {forecastStart && <ReferenceLine x={forecastStart} stroke="#e02718" strokeDasharray="4 4" label={{ value: "Forecast begins", position: "insideTopRight", fill: "#b42318", fontSize: 11 }} />}
              <Area type="monotone" dataKey="rangeLow" stackId="forecast-range" stroke="none" fill="transparent" dot={false} activeDot={false} tooltipType="none" />
              <Area type="monotone" dataKey="rangeSize" stackId="forecast-range" name="Typical outcome range" stroke="#86a9df" strokeWidth={1} fill="#b9d0f2" fillOpacity={0.65} dot={false} activeDot={false} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#1f2a79" strokeWidth={2.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="previousProjection" name="Previous projection" stroke="#6f95d5" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="projection" name="Future projection" stroke="#e02718" strokeWidth={2.5} strokeDasharray="7 5" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div>
        <section aria-labelledby="forecast-horizon-title" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 id="forecast-horizon-title" className="text-base font-semibold text-brand-navy">Forecast horizon</h3>
          <p className="mt-1 text-sm text-muted">Monthly projections for the selected scope.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-3">Month</th><th className="px-3 py-3 text-right">Projection</th><th className="px-3 py-3 text-right">Typical range</th><th className="px-3 py-3 text-right">Horizon</th></tr></thead>
              <tbody>{series.forecast.map(point => <tr key={point.periodNo} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3 font-medium text-brand-navy">{formatPeriod(point.periodNo)}</td><td className="px-3 py-3 text-right">{formatCurrencyExact(point.value, fx)}</td><td className="px-3 py-3 text-right text-muted">{point.low !== null && point.high !== null ? `${formatCurrencyCompact(point.low, fx)} – ${formatCurrencyCompact(point.high, fx)}` : "Unavailable"}</td><td className="px-3 py-3 text-right text-muted">{point.horizon} mo.</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: "navy" | "blue" | "red" | "amber" | "green" }) {
  const accentStyles = { navy: "bg-brand-navy", blue: "bg-brand-blue", red: "bg-brand-red", amber: "bg-amber-500", green: "bg-emerald-500" };
  return <article className="relative overflow-hidden rounded-xl border border-black/10 bg-white p-5 pl-6 shadow-sm"><span className={`absolute inset-y-0 left-0 w-1 ${accentStyles[accent]}`} /><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-brand-navy">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></article>;
}

function LegendItem({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-0.5 w-5 ${dashed ? "border-t-2 border-dashed" : ""}`} style={dashed ? { borderColor: color } : { backgroundColor: color }} />{label}</span>;
}

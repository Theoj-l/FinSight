"use client";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFinancialComparison } from "./comparison-context";
import { formatWhole, referenceLabel } from "./kpi-card";
import { PNL_METRICS } from "@/lib/financial/presentation";
import { bundleMonths, pnlMonthRows, pnlTrend, type ChangeTone, type MonthCell } from "@/lib/financial/pnl-months";
import { TRAFFIC_LIGHT_LABEL, trafficLight } from "@/lib/financial/traffic-light";
import { METRICS, SOURCES, addMonth, monthLabel } from "@/lib/financial/types";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrencyCompact, formatCurrencyExact } from "@/lib/currency";
import { formatPercentage } from "@/app/dashboard/data/kpi-presentation";
import { reportingMonth } from "@/app/home/overview-data";

// The month-by-month table shows at most this many months; the trend chart shows them all.
const TABLE_MONTHS = 6;
const SUBTOTALS = new Set(["grossProfit", "netProfit"]);
const LINES = [
  { key: "revenue", label: "Revenue", color: "#1f2a79" },
  { key: "totalExpenses", label: "Total expenses", color: "#e02718" },
  { key: "grossProfit", label: "Gross profit", color: "#6f95d5" },
  { key: "netProfit", label: "Net profit", color: "#059669" },
] as const;
const TONE: Record<ChangeTone, string> = {
  favourable: "bg-status-good-soft text-status-good",
  unfavourable: "bg-status-bad-soft text-status-bad",
  flat: "bg-slate-100 text-muted",
  none: "text-muted",
};
const DOT = { favourable: "bg-emerald-500", attention: "bg-amber-400", unfavourable: "bg-brand-red", unavailable: "bg-slate-300" } as const;

/** A tiny line of a row's values across the months, newest on the right. */
function Sparkline({ values, tone }: { values: (number | null)[]; tone: ChangeTone }) {
  const points = values.map((v, i) => (v === null ? null : { x: i, y: v })).filter(p => p !== null);
  if (points.length < 2) return <span className="text-muted">—</span>;
  const ys = points.map(p => p.y), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const w = 76, h = 26, step = w / Math.max(1, values.length - 1);
  const xy = points.map(p => [p.x * step, h - 3 - ((p.y - min) / span) * (h - 6)] as const);
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg aria-hidden="true" width={w} height={h} viewBox={`-2 0 ${w + 4} ${h}`} className="overflow-visible">
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#4c6fbb" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.6} className={tone === "unfavourable" ? "fill-brand-red" : tone === "favourable" ? "fill-emerald-600" : "fill-slate-400"} />
    </svg>
  );
}

function ChangeChip({ cell }: { cell: MonthCell }) {
  if (cell.absolute === null) return <span className="text-[11px] text-muted">—</span>;
  const direction = Number(cell.absolute);
  const Icon = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${TONE[cell.tone]}`}>
      <Icon aria-hidden="true" className="h-3 w-3" />
      {cell.percentage === null ? "n/a" : formatPercentage(cell.percentage)}
      <span className="sr-only"> from the previous month ({cell.tone})</span>
    </span>
  );
}

export function FinancialProfitLoss() {
  const context = useFinancialComparison();
  const fx = useCurrency();
  if (!context) return null;
  const { bundle, series, source } = context;
  const point = bundle && series?.[bundle.period];
  const format = (v: string | null | undefined) =>
    v == null ? "—" : formatCurrencyExact(Number(v), fx);
  const label = {
    previous: "Previous Month Actual",
    budget: "Month Budget",
    auto: "Auto Forecast",
    manual: "Manual Forecast",
  }[source];
  const months = bundle ? bundleMonths(bundle) : [];
  const tableMonths = months.slice(-TABLE_MONTHS);
  const rows = bundle ? pnlMonthRows(bundle, PNL_METRICS, tableMonths) : [];
  const trend = bundle ? pnlTrend(bundle, months) : [];
  const reference = bundle ? referenceLabel({ comparisonSource: source, priorPeriod: monthLabel(addMonth(bundle.period, -1)), comparisonLabel: SOURCES[source] }) : "";
  return (
    <section
      aria-labelledby="profit-loss-title"
      className="surface rounded-2xl p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="profit-loss-title"
            className="text-lg font-semibold text-brand-navy"
          >
            Profit & Loss Statement
          </h2>
          <p className="mt-1 text-sm text-muted">
            {bundle ? `Month by month to ${reportingMonth(monthLabel(bundle.period))}, then ${reportingMonth(monthLabel(bundle.period))} against ${reference}.` : "Month-by-month profit and loss."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted" aria-hidden="true">
          {LINES.map(line => <span key={line.key} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: line.color }} />{line.label}</span>)}
        </div>
      </div>
      {!point || context.error ? (
        <p role="status" className="mt-4 text-sm text-muted">
          {context.error ?? "P&L comparisons are unavailable."}
        </p>
      ) : (
        <>
          <div className="mt-5 h-60 w-full" role="img" aria-label={`Revenue, total expenses, gross profit and net profit by month, ${trend.map(p => reportingMonth(p.label)).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="#e6e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickFormatter={value => reportingMonth(String(value))} tick={{ fill: "#5b6079", fontSize: 11 }} />
                <YAxis tickFormatter={value => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 11 }} width={58} />
                <Tooltip labelFormatter={value => reportingMonth(String(value))} formatter={(value, name) => [value == null ? "—" : formatCurrencyExact(Number(value), fx), name]} />
                {LINES.map(line => <Line key={line.key} type="monotone" dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={2.4} dot={{ r: 2.5 }} connectNulls={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* relative: the chips' screen-reader text is absolutely positioned and
              must be clipped here, or it widens the page on phones. */}
          <div
            className="relative mt-6 overflow-x-auto rounded-xl border border-brand-navy/[.07]"
            tabIndex={0}
            role="region"
            aria-label="P&L month by month"
          >
            <table className="w-full min-w-[880px] text-sm">
              <caption className="sr-only">Profit and loss by month, with each month&apos;s change from the month before</caption>
              <thead>
                <tr className="border-b border-brand-navy/[.07] bg-brand-blue-light/50 text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="sticky left-0 bg-[#f2f5fc] p-3 font-medium">Line</th>
                  <th scope="col" className="p-3 font-medium">Trend</th>
                  {tableMonths.map(p => (
                    <th key={p} scope="col" className={`p-3 text-right font-medium ${p === bundle!.period ? "text-brand-navy" : ""}`}>{reportingMonth(monthLabel(p))}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const last = row.cells[row.cells.length - 1];
                  return (
                    <tr key={row.metric} data-metric={row.metric} className={`border-b border-slate-100 last:border-0 ${SUBTOTALS.has(row.metric) ? "bg-brand-blue-light/30 font-semibold" : ""}`}>
                      <th scope="row" className={`sticky left-0 p-3 text-left ${SUBTOTALS.has(row.metric) ? "bg-[#f4f6fc] text-brand-navy" : "bg-white font-medium text-slate-700"}`}>{row.label}</th>
                      <td className="p-3"><Sparkline values={row.cells.map(cell => cell.actual === null ? null : Number(cell.actual))} tone={last?.tone ?? "none"} /></td>
                      {row.cells.map(cell => (
                        <td key={cell.period} className={`p-3 text-right align-top ${cell.period === bundle!.period ? "bg-brand-blue-light/40" : ""}`}>
                          <span className="block tabular-nums text-brand-navy" title={cell.actual ?? undefined}>{cell.actual === null ? "—" : formatWhole(cell.actual, fx)}</span>
                          <span className="mt-1 block"><ChangeChip cell={cell} /></span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Chips show the change from the month before: green favourable, red unfavourable (costs rising, income falling).</p>

          <h3 className="mt-7 text-sm font-semibold text-brand-navy">{reportingMonth(monthLabel(bundle!.period))} against {reference}</h3>
          <div
            className="relative mt-3 overflow-x-auto rounded-xl border border-brand-navy/[.07]"
            tabIndex={0}
            role="region"
            aria-label="P&L comparison table"
          >
            <table className="w-full min-w-[700px] text-sm">
              <caption className="sr-only">P&L for {bundle?.period} against {SOURCES[source]}</caption>
              <thead>
                <tr className="border-b border-brand-navy/[.07] bg-brand-blue-light/50 text-left text-xs uppercase tracking-wide text-muted">
                  {[
                    "Description",
                    "Month Actual",
                    "Year-to-Date Actual",
                    label,
                    "Variance %",
                  ].map((h, i) => (
                    <th
                      scope="col"
                      key={h}
                      className={`p-3 font-medium ${i ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PNL_METRICS.map((metric) => {
                  const c = point.metrics[metric];
                  const status = trafficLight(c);
                  return (
                    <tr
                      key={metric}
                      data-metric={metric}
                      className={`border-b border-slate-100 last:border-0 ${SUBTOTALS.has(metric) ? "bg-brand-blue-light/30 font-semibold" : ""}`}
                    >
                      <th scope="row" className="p-3 text-left text-slate-800">
                        {METRICS[metric].label}
                      </th>
                      <td className="p-3 text-right tabular-nums">{format(c.actual)}</td>
                      <td className="p-3 text-right tabular-nums">
                        {format(bundle?.ytd[metric])}
                      </td>
                      <td className="p-3 text-right tabular-nums">{format(c.reference)}</td>
                      <td
                        className={`p-3 text-right tabular-nums ${status === "unfavourable" ? "text-status-bad" : status === "attention" ? "text-status-watch" : status === "favourable" && c.percentage ? "text-status-good" : "text-muted"}`}
                      >
                        <span className="inline-flex items-center justify-end gap-2">
                          {c.percentage !== null && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${c.percentage === 0 ? "bg-slate-300" : DOT[status]}`} />}
                          {c.percentage === null
                            ? "—"
                            : formatPercentage(c.percentage)}
                        </span>
                        {(status === "unfavourable" || status === "attention") && (
                          <span className="block text-[11px] font-medium">
                            {TRAFFIC_LIGHT_LABEL[status]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer">
              Comparison coverage and origin
            </summary>
            {point.provenance.map((note, i) => (
              <p className="mt-2" key={i}>
                {note}
              </p>
            ))}
            <p className="mt-2">
              Missing comparisons are unavailable, never zero or replaced by
              another source. Year-to-date figures contain actual ledger values
              only.
            </p>
            {source === "auto" && (
              <p className="mt-2">
                {bundle?.forecastNotice}{" "}
                <a href="/forecast" className="underline">
                  View accuracy and outcome ranges
                </a>
                .
              </p>
            )}
          </details>
        </>
      )}
    </section>
  );
}

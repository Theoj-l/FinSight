"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrencyCompact, formatCurrencyExact, type ProfitYoyComparison } from "../data/profit-yoy-comparison-utils";

export function ProfitYoyComparisonChart({ data, error }: { data?: ProfitYoyComparison; error?: string }) {
  const fx = useCurrency();
  const points = data?.points ?? [];
  const change = data?.absoluteChange ?? null;
  const improved = change !== null && change > 0;
  const declined = change !== null && change < 0;
  const statusLabel = change === null ? "Comparison unavailable" : improved ? "Improving" : declined ? "Declining" : "Unchanged";

  return (
    <section aria-labelledby="profit-yoy-title" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="profit-yoy-title" className="text-lg font-semibold text-brand-navy">Profit Year-Over-Year Comparison</h2>
          <p className="mt-1 text-sm text-muted">
            Last three months versus the same three months last year
            {data && ` · ${data.currentPeriods[0]?.label} to ${data.currentPeriods[2]?.label}`}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${improved ? "bg-emerald-50 text-emerald-800" : declined ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"}`}>
          {improved ? "↑" : declined ? "↓" : "→"} {statusLabel}
        </span>
      </div>

      {error ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-brand-red" role="alert">{error}</div>
      ) : !data || points.length === 0 ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted">No profit comparison data is available.</div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Summary label="Current total" value={data.currentTotal === null ? "Incomplete" : formatCurrencyCompact(data.currentTotal, fx)} />
            <Summary label="Last year total" value={data.priorTotal === null ? "Incomplete" : formatCurrencyCompact(data.priorTotal, fx)} />
            <Summary label="Difference" value={data.absoluteChange === null ? "Incomplete" : formatSignedCurrency(data.absoluteChange, fx)} tone={improved ? "positive" : declined ? "negative" : undefined} />
            <Summary label="Change" value={data.percentageChange === null ? "Not available" : formatSignedPercent(data.percentageChange)} tone={improved ? "positive" : declined ? "negative" : undefined} />
          </div>
          {!data.complete && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">This comparison is incomplete because one or more months have no actual ledger data. Totals and percentage change are withheld.</p>}
          <div className="mt-6 h-80 w-full" role="img" aria-label="Grouped bar chart comparing monthly net profit for the current three months with the same months last year">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8f0" />
                <XAxis dataKey="label" tick={{ fill: "#5b6079", fontSize: 12 }} />
                <YAxis tickFormatter={value => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 12 }} width={64} />
                <Tooltip formatter={(value, name) => [value === null ? "Unavailable" : formatCurrencyExact(Number(value), fx), name]} />
                <Legend />
                <Bar dataKey="currentProfit" name="Current year" fill="#1f2a79" radius={[3, 3, 0, 0]} />
                <Bar dataKey="priorProfit" name="Same months last year" fill="#8fb0df" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return <div className="rounded-lg border border-brand-navy/10 bg-brand-blue-light/30 p-3">
    <p className="text-xs text-muted">{label}</p>
    <p className={`mt-1 text-base font-semibold ${tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-brand-red" : "text-brand-navy"}`}>{value}</p>
  </div>;
}

function formatSignedCurrency(value: number, currency: Parameters<typeof formatCurrencyExact>[1]) {
  return `${value >= 0 ? "+" : "−"}${formatCurrencyExact(Math.abs(value), currency)}`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCurrencyCompact,
  formatCurrencyExact,
  type RevenueExpensePoint,
} from "../data/revenue-expense-utils";
import { ChartAnomalyNote } from "./chart-anomaly";
import { previousCalendarMonths, type ChartAnomaly } from "../data/anomaly-evidence";
import { formatPeriod } from "../data/revenue-expense-utils";
import { useCurrency } from "@/lib/currency-context";

type RevenueExpenseChartProps = {
  data?: RevenueExpensePoint[];
  focus?: ChartAnomaly | null;
  error?: string;
  loading?: boolean;
};

export function RevenueExpenseChart({
  data = [],
  error,
  loading = false,
  focus,
}: RevenueExpenseChartProps) {
  const fx = useCurrency();
  const periods = focus ? [...new Set([...previousCalendarMonths(focus.alert.periodNo), ...focus.finding.comparison.periods])].sort((a, b) => a - b) : data.map(p => p.periodNo);
  const chartData = periods.map(periodNo => ({ ...(data.find(p => p.periodNo === periodNo) ?? { periodNo, period: formatPeriod(periodNo), revenue: null, expenses: null }), modelRevenue: focus?.finding.history.find(h => h.periodNo === periodNo)?.value ?? null }));
  return (
    <section aria-labelledby="revenue-expense-title" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="revenue-expense-title" className="text-lg font-semibold text-brand-navy">
            Revenue vs Operating Expenses
          </h2>
          <p className="mt-1 text-sm text-muted">Selected reporting month · Selected business unit</p>
        </div>
      </div>

      <ChartAnomalyNote focus={focus} target="revenue-expense-title" ready={!loading && !error && data.length > 0} />
      {loading ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted" role="status">
          Loading financial data...
        </div>
      ) : error ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-brand-red" role="alert">
          {error}
        </div>
      ) : data.length === 0 ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted">
          No revenue or expense data is available for the selected periods.
        </div>
      ) : (
        <div className="mt-6 h-80 w-full" role="img" aria-label="Clustered bar chart comparing revenue and operating expenses by accounting period">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8f0" />
              <XAxis dataKey="period" tick={{ fill: "#5b6079", fontSize: 12 }} />
              <YAxis tickFormatter={(value) => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 12 }} width={58} />
              <Tooltip formatter={(value, name) => [formatCurrencyExact(Number(value), fx), name]} />
              <Legend />
              {focus && <ReferenceLine x={formatPeriod(focus.alert.periodNo)} stroke="#b45309" strokeWidth={3} label="Anomaly" />}
              {focus && <Bar dataKey="modelRevenue" name="Model revenue (includes other income)" fill="#b45309" radius={[3, 3, 0, 0]} />}
              <Bar dataKey="revenue" name="Revenue" fill="#1f2a79" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#e02718" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

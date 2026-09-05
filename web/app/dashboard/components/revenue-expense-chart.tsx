"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

type RevenueExpenseChartProps = {
  data?: RevenueExpensePoint[];
  error?: string;
  loading?: boolean;
};

export function RevenueExpenseChart({
  data = [],
  error,
  loading = false,
}: RevenueExpenseChartProps) {
  return (
    <section aria-labelledby="revenue-expense-title" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="revenue-expense-title" className="text-lg font-semibold text-brand-navy">
            Revenue vs Operating Expenses
          </h2>
          <p className="mt-1 text-sm text-muted">Last 6 months</p>
        </div>
      </div>

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
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8f0" />
              <XAxis dataKey="period" tick={{ fill: "#5b6079", fontSize: 12 }} />
              <YAxis tickFormatter={formatCurrencyCompact} tick={{ fill: "#5b6079", fontSize: 12 }} width={58} />
              <Tooltip formatter={(value, name) => [formatCurrencyExact(Number(value)), name]} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#1f2a79" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#e02718" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCurrencyCompact,
  formatCurrencyExact,
  type ProfitMarginPoint,
} from "../data/profit-margin-utils";

type ProfitMarginChartProps = {
  data?: ProfitMarginPoint[];
  error?: string;
  loading?: boolean;
};

export function ProfitMarginChart({ data = [], error, loading = false }: ProfitMarginChartProps) {
  return (
    <section aria-labelledby="profit-margin-title" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h2 id="profit-margin-title" className="text-lg font-semibold text-brand-navy">
          Net Profit and Margin
        </h2>
        <p className="mt-1 text-sm text-muted">Last 6 months</p>
      </div>

      {loading ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted" role="status">
          Loading profit data...
        </div>
      ) : error ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-brand-red" role="alert">
          {error}
        </div>
      ) : data.length === 0 ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted">
          No profit or margin data is available for the selected periods.
        </div>
      ) : (
        <div className="mt-6 h-80 w-full" role="img" aria-label="Combined chart showing net profit and net margin percentage by accounting period">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8f0" />
              <XAxis dataKey="period" tick={{ fill: "#5b6079", fontSize: 12 }} />
              <YAxis yAxisId="currency" tickFormatter={formatCurrencyCompact} tick={{ fill: "#5b6079", fontSize: 12 }} width={58} />
              <YAxis yAxisId="percentage" orientation="right" tickFormatter={(value) => `${value}%`} tick={{ fill: "#5b6079", fontSize: 12 }} width={48} />
              <Tooltip
                formatter={(value, name) => [
                  name === "Net Margin %" ? `${Number(value).toFixed(2)}%` : formatCurrencyExact(Number(value)),
                  name,
                ]}
              />
              <Legend />
              <Bar yAxisId="currency" dataKey="netProfit" name="Net Profit" fill="#1f2a79" radius={[3, 3, 0, 0]} />
              <Line yAxisId="percentage" type="monotone" dataKey="netMarginPct" name="Net Margin %" stroke="#e02718" strokeWidth={2.5} connectNulls={false} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
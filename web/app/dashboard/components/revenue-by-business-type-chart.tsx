"use client";

import { Legend, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrencyExact, type RevenueByBusinessTypePoint } from "../data/revenue-by-business-type-utils";
import { DonutLabel } from "./donut-label";

const SEGMENT_COLORS: Record<string, string> = {
  Machining: "#e02718",
  Bulk: "#1f2a79",
};

type RevenueByBusinessTypeChartProps = {
  data?: RevenueByBusinessTypePoint[];
  error?: string;
  loading?: boolean;
};

export function RevenueByBusinessTypeChart({ data = [], error, loading = false }: RevenueByBusinessTypeChartProps) {
  const fx = useCurrency();
  const chartData = data.map((entry) => ({
    ...entry,
    fill: SEGMENT_COLORS[entry.segment],
  }));

  return (
    <section aria-labelledby="revenue-by-business-type-title" className="surface flex h-full flex-col rounded-2xl p-6">
      <div>
        <h2 id="revenue-by-business-type-title" className="text-lg font-semibold text-brand-navy">Revenue by Business Type</h2>
        <p className="mt-1 text-sm text-muted">Machining and Bulk · Selected period or range</p>
      </div>

      {loading ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-muted" role="status">Loading business type revenue...</div>
      ) : error ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-brand-red" role="alert">{error}</div>
      ) : data.length === 0 ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-muted">No business type revenue is available.</div>
      ) : (
        <>
          <div className="mt-6 h-96 w-full shrink-0" role="img" aria-label="Donut chart showing revenue by business type">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="revenue"
                  nameKey="segment"
                  cx="50%"
                  cy="50%"
                  innerRadius="52%"
                  outerRadius="76%"
                  paddingAngle={data.length > 1 ? 2 : 0}
                  label={props => {
                    const point = props.payload as RevenueByBusinessTypePoint;
                    return <DonutLabel {...props} name={point.segment} percentage={point.percentage} />;
                  }}
                  labelLine
                  shape={(props) => <Sector {...props} fill={props.fill} />}
                />
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${formatCurrencyExact(Number(value), fx)} (${Number(item.payload?.percentage ?? 0).toFixed(2)}%)`,
                    item.payload?.segment ?? _name,
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only" aria-label="Revenue by business type details">
            {data.map((entry) => (
              <li key={entry.segment}>
                {entry.segment}: {formatCurrencyExact(entry.revenue, fx)}, {entry.percentage.toFixed(2)}%
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
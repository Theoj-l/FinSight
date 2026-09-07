"use client";

import { Legend, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import {
  formatCurrencyExact,
  type RevenueByGroupPoint,
} from "../data/revenue-by-group-utils";

const GROUP_COLORS = ["#1f2a79", "#4c6fbb", "#e02718", "#b81f12", "#2f8f83", "#d18b2c", "#68708d", "#9b59b6"];

type RevenueByGroupChartProps = {
  data?: RevenueByGroupPoint[];
  error?: string;
  loading?: boolean;
};

export function RevenueByGroupChart({ data = [], error, loading = false }: RevenueByGroupChartProps) {
  const showSliceLabels = data.length <= 6;
  const chartData = data.map((entry, index) => ({
    ...entry,
    fill: GROUP_COLORS[index % GROUP_COLORS.length],
  }));

  return (
    <section aria-labelledby="revenue-by-group-title" className="flex h-full flex-col rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h2 id="revenue-by-group-title" className="text-lg font-semibold text-brand-navy">
          Revenue by Product Group
        </h2>
        <p className="mt-1 text-sm text-muted">Non-cancelled invoices · Selected month, unit and branch</p>
      </div>

      {loading ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-muted" role="status">
          Loading revenue groups...
        </div>
      ) : error ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-brand-red" role="alert">
          {error}
        </div>
      ) : data.length === 0 ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-muted">
          No product group revenue is available.
        </div>
      ) : (
        <>
          <div className="mt-6 h-96 w-full shrink-0" role="img" aria-label="Donut chart showing revenue by product group">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="revenue"
                  nameKey="groupLabel"
                  cx="50%"
                  cy="50%"
                  innerRadius="52%"
                  outerRadius="76%"
                  paddingAngle={data.length > 1 ? 2 : 0}
                  label={showSliceLabels ? ({ payload }) => {
                    const point = payload as unknown as RevenueByGroupPoint;
                    return `${point.groupLabel} ${point.percentage.toFixed(1)}%`;
                  } : false}
                  labelLine={showSliceLabels}
                  shape={(props) => (
                    <Sector {...props} fill={props.fill} />
                  )}
                >
                </Pie>
                <Tooltip
                  formatter={(value, name, item) => [
                    `${formatCurrencyExact(Number(value))} (${Number(item.payload?.percentage ?? 0).toFixed(2)}%)`,
                    name,
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only" aria-label="Revenue by product group details">
            {data.map((entry) => (
              <li key={entry.groupId}>
                {entry.groupLabel}: {formatCurrencyExact(entry.revenue)}, {entry.percentage.toFixed(2)}%
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

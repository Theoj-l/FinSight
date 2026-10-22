"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCurrency } from "@/lib/currency-context";
import {
  formatCurrencyCompact,
  formatCurrencyExact,
  type ExpenseByBusinessTypePeriod,
} from "../data/expense-by-business-type-utils";

type ExpenseByBusinessTypeChartProps = {
  data?: ExpenseByBusinessTypePeriod[];
  error?: string;
  onSegmentClick?: (segment: "Machining" | "Bulk", periodLabel: string) => void;
};

function PercentageLabel({ x, y, width, height, value }: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  if (x === undefined || y === undefined || width === undefined || height === undefined || !value) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={11}
      fontWeight={700}
      stroke="#1f2937"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {`${Math.round(value)}%`}
    </text>
  );
}

export function ExpenseByBusinessTypeChart({ data = [], error, onSegmentClick }: ExpenseByBusinessTypeChartProps) {
  const fx = useCurrency();
  return (
    <section aria-labelledby="expense-by-business-type-title" className="flex h-full flex-col rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h2 id="expense-by-business-type-title" className="text-lg font-semibold text-brand-navy">
          Operating Expenses by Business Type
        </h2>
        <p className="mt-1 text-sm text-muted">Machining and Bulk · percentage mix with total operating expenses</p>
      </div>
      {error ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-brand-red" role="alert">{error}</div>
      ) : data.length === 0 ? (
        <div className="mt-6 flex h-96 items-center justify-center text-sm text-muted">
          No operating expense business type data is available.
        </div>
      ) : (
        <div className="mt-6 h-96 w-full shrink-0" role="img" aria-label="Operating expenses by business type with total operating expenses">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8f0" />
            <XAxis dataKey="period" tick={{ fill: "#5b6079", fontSize: 12 }} />
            <YAxis yAxisId="percentage" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#5b6079", fontSize: 12 }} width={48} />
            <YAxis yAxisId="currency" orientation="right" domain={["auto", "auto"]} tickFormatter={(value) => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 12 }} width={64} />
            <Tooltip
              formatter={(value, name, item) => {
                const point = item.payload as ExpenseByBusinessTypePeriod;
                if (name === "Machining") {
                  return [`${formatCurrencyExact(point.machiningAmount, fx)} (${point.machiningPct.toFixed(1)}%)`, name];
                }
                if (name === "Bulk") {
                  return [`${formatCurrencyExact(point.bulkAmount, fx)} (${point.bulkPct.toFixed(1)}%)`, name];
                }
                return [formatCurrencyExact(Number(value), fx), name];
              }}
            />
            <Legend />
            <Bar
              yAxisId="percentage"
              dataKey="machiningPct"
              name="Machining"
              stackId="opex"
              fill="#e02718"
              onClick={(_, index) => {
                const periodLabel = data[index]?.period;
                if (periodLabel) onSegmentClick?.("Machining", periodLabel);
              }}
            >
              <LabelList dataKey="machiningPct" content={<PercentageLabel />} />
            </Bar>
            <Bar
              yAxisId="percentage"
              dataKey="bulkPct"
              name="Bulk"
              stackId="opex"
              fill="#1f2a79"
              onClick={(_, index) => {
                const periodLabel = data[index]?.period;
                if (periodLabel) onSegmentClick?.("Bulk", periodLabel);
              }}
            >
              <LabelList dataKey="bulkPct" content={<PercentageLabel />} />
            </Bar>
            <Line
              yAxisId="currency"
              type="monotone"
              dataKey="totalOpex"
              name="Total opex ($)"
              stroke="#d18b2c"
              strokeWidth={2.5}
              connectNulls={false}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

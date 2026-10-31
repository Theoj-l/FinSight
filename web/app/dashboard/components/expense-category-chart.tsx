"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  formatCurrencyCompact,
  formatCurrencyExact,
  getCategoriesForPeriod,
  getPercentChange,
  type ExpenseCategoryPeriod,
} from "../data/expense-category-utils";
import { useCurrency } from "@/lib/currency-context";

function expenseColor(change: number | null) {
  return change === null || change === 0 ? "#64748b" : change > 0 ? "#b91c1c" : "#047857";
}

function shortenCategory(category: string) {
  return category.length > 24 ? `${category.slice(0, 21)}...` : category;
}

type ExpenseCategoryChartProps = {
  data?: ExpenseCategoryPeriod[];
  error?: string;
  loading?: boolean;
};

export function ExpenseCategoryChart({ data = [], error, loading = false }: ExpenseCategoryChartProps) {
  const fx = useCurrency();
    const activePeriod = data.at(-1)?.periodNo;
    const activePeriodLabel = data.find((period) => period.periodNo === activePeriod)?.period;
    const categories = activePeriod === undefined ? [] : getCategoriesForPeriod(data, activePeriod);

  return (
    <section aria-labelledby="expense-category-title" className="surface flex h-full flex-col rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="expense-category-title" className="text-lg font-semibold text-brand-navy">
            Operating Expenses by Category
          </h2>
          <p className="mt-1 text-sm text-muted">Selected month (latest, if a range) · Change vs previous calendar month.</p>
        </div>
                {activePeriodLabel && <span className="text-sm font-medium text-muted">Period {activePeriodLabel}</span>}
      </div>

      {loading ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted" role="status">Loading expense categories...</div>
      ) : error ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-brand-red" role="alert">{error}</div>
      ) : data.length === 0 || categories.length === 0 ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted">No operating expense categories are available.</div>
      ) : (
        <div className="mt-6 h-96 w-full shrink-0" role="img" aria-label={`Operating expense categories for ${data.find((period) => period.periodNo === activePeriod)?.period}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categories} layout="vertical" margin={{ top: 8, right: 72, left: 12, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e6e8f0" />
              <XAxis type="number" tickFormatter={(value) => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 12 }} />
              <YAxis type="category" dataKey="category" tickFormatter={shortenCategory} width={180} tick={{ fill: "#5b6079", fontSize: 12 }} />
              <Tooltip
                formatter={(value, name, item) => {
                  const change = getPercentChange(Number(value), item.payload?.priorAmount ?? null);
                  return [`${formatCurrencyExact(Number(value), fx)} (${change === null ? "—" : `${change.toFixed(2)}%`})`, name];
                }}
              />
              <Bar
                dataKey="amount"
                name="Expense"
                radius={[0, 3, 3, 0]}
                fillOpacity={0.9}
                shape={(props) => {
                  const entry = categories[Number(props.index)];
                  const change = entry ? getPercentChange(entry.amount, entry.priorAmount) : null;
                  return (
                    <Rectangle
                      {...props}
                      fill={expenseColor(change)}
                    />
                  );
                }}
              >
                <LabelList
                  dataKey="amount"
                  position="right"
                  content={({ x, y, width, height, index }) => {
                    const entry = categories[Number(index)];
                    if (!entry) return null;
                    const change = getPercentChange(entry.amount, entry.priorAmount);
                    const label = change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
                    return (
                      <text
                        x={Number(x) + Number(width) + 8}
                        y={Number(y) + Number(height) / 2}
                        fill={expenseColor(change)}
                        textAnchor="start"
                        dominantBaseline="middle"
                        fontSize={12}
                        fontWeight={600}
                      >
                        {label}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !error && data.length > 0 && categories.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-4 text-xs text-muted" aria-label="Expense chart color legend">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-700" aria-hidden="true" />
            Increased expense · Unfavorable
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-700" aria-hidden="true" />
            Decreased expense · Favorable
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-500" aria-hidden="true" />
            Unchanged or comparison unavailable
          </span>
        </div>
      )}
    </section>
  );
}

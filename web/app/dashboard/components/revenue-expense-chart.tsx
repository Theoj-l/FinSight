"use client";
import { comparisonStyle, ComparisonLegend } from "./comparison-style";
import { ComparisonHover, ComparisonSource } from "./comparison-hover";

import {
  Bar,
  ComposedChart,
  Line,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCurrencyCompact,
  type RevenueExpensePoint,
} from "../data/revenue-expense-utils";
import { useFinancialComparison, ComparisonNote } from "@/app/components/financial/comparison-context";
import { ChartAnomalyNote } from "./chart-anomaly";
import { previousCalendarMonths, type ChartAnomaly } from "../data/anomaly-evidence";
import { formatPeriod } from "../data/revenue-expense-utils";
import { useCurrency } from "@/lib/currency-context";
import { chartValues } from "@/lib/financial/chart-values";

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
  const financial = useFinancialComparison();
  const periods = focus ? [...new Set([...previousCalendarMonths(focus.alert.periodNo), ...focus.finding.comparison.periods])].sort((a, b) => a - b) : financial?.series ? Object.keys(financial.series).map(Number).sort((a, b) => a - b) : data.map(p => p.periodNo);
  const chartData = periods.map(periodNo => ({ ...(data.find(p => p.periodNo === periodNo) ?? { periodNo, period: formatPeriod(periodNo), revenue: null, expenses: null }), ...(financial?.series?.[periodNo] ? chartValues(financial.series[periodNo]) : {}), modelRevenue: focus?.finding.history.find(h => h.periodNo === periodNo)?.value ?? null }));
  return (
    <section aria-labelledby="revenue-expense-title" className="surface rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="revenue-expense-title" className="text-lg font-semibold text-brand-navy">
            Revenue vs Operating Expenses
          </h2>
          <p className="mt-1 text-sm text-muted">Selected reporting month · Selected business unit</p>
        </div>
      </div>

      <ComparisonNote showSource={false} metric="revenue" />
      <ComparisonNote showSource={false} metric="operatingExpenses" />
      {financial && (financial.source === "auto" || financial.source === "manual") && <p className="mt-1 text-xs text-muted">Operating-expense forecasts are unavailable; total-cost forecasts are not substituted.</p>}
      <ChartAnomalyNote focus={focus} target="revenue-expense-title" ready={!loading && !error && data.length > 0} />
      <ComparisonSource source={financial?.source} />
      {loading ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted" role="status">
          Loading financial data...
        </div>
      ) : error ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-brand-red" role="alert">
          {error}
        </div>
      ) : chartData.length === 0 ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted">
          No revenue or expense data is available for the selected periods.
        </div>
      ) : (
        <div className="mt-6 h-80 w-full" role="group" aria-label="Clustered bar chart comparing revenue and operating expenses by accounting period">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart accessibilityLayer data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8f0" />
              <XAxis dataKey="period" tick={{ fill: "#5b6079", fontSize: 12 }} />
              <YAxis padding={{ top: 12 }} tickFormatter={(value) => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 12 }} width={58} />
              <ComparisonHover source={financial?.source} measures={[{ label: "Revenue", actualKey: "revenue", comparisonKey: "referenceRevenue" }, { label: "Expenses", actualKey: "expenses", comparisonKey: "referenceExpenses" }]} model={focus ? {label: "Model revenue (includes other income)", key: "modelRevenue"} : undefined} />
              <Legend content={<ComparisonLegend />} />
              {financial && <Line dataKey="referenceRevenue" name="Revenue comparison" {...comparisonStyle("monetary")} />}
              {financial && <Line dataKey="referenceExpenses" name="Expenses comparison" {...comparisonStyle("secondary")} />}
              {focus && <ReferenceLine x={formatPeriod(focus.alert.periodNo)} stroke="#b45309" strokeWidth={3} label="Anomaly" />}
              {focus && <Bar dataKey="modelRevenue" name="Model revenue (includes other income)" fill="#b45309" radius={[3, 3, 0, 0]} />}
              <Bar dataKey="revenue" name="Revenue" fill="#1f2a79" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#e02718" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

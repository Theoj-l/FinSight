"use client";
import { comparisonStyle, ComparisonLegend } from "./comparison-style";
import { ComparisonHover, ComparisonSource } from "./comparison-hover";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCurrencyCompact,
  type ProfitMarginPoint,
} from "../data/profit-margin-utils";
import { useFinancialComparison, ComparisonNote } from "@/app/components/financial/comparison-context";
import { useSearchParams } from "next/navigation";
import { ChartAnomalyNote } from "./chart-anomaly";
import { previousCalendarMonths, type ChartAnomaly } from "../data/anomaly-evidence";
import { formatPeriod } from "../data/revenue-expense-utils";
import { useCurrency } from "@/lib/currency-context";
import { chartValues } from "@/lib/financial/chart-values";

type ProfitMarginChartProps = {
  data?: ProfitMarginPoint[];
  mode?: "net" | "gross";
  focus?: ChartAnomaly | null;
  error?: string;
  loading?: boolean;
};

export function ProfitMarginChart({ data = [], error, loading = false, mode = "net", focus }: ProfitMarginChartProps) {
  const fx = useCurrency();
  const financial = useFinancialComparison();
  const params = useSearchParams();
  const selectedMode = params.get("profitMode") ?? mode;
  const gross = selectedMode === "gross";
  // Server-provided evidence remains available for browser Back, but is only
  // shown while its gross comparison is selected in the current URL.
  const activeFocus = gross && params.get("anomaly") === focus?.alert.id && params.get("reason") === focus?.finding.code ? focus : null;
  const name = gross ? "Gross" : "Net";
  const periods = activeFocus ? [...new Set([...previousCalendarMonths(activeFocus.alert.periodNo), ...activeFocus.finding.comparison.periods])].sort((a, b) => a - b) : financial?.series ? Object.keys(financial.series).map(Number).sort((a, b) => a - b) : data.map(p => p.periodNo);
  const chartData = periods.map(periodNo => {
    const modelValue = activeFocus?.finding.history.find(h => h.periodNo === periodNo)?.value;
    const point = financial?.series?.[periodNo];
    const values = point ? chartValues(point) : null;
    return { ...(data.find(p => p.periodNo === periodNo) ?? { periodNo, period: formatPeriod(periodNo), netProfit: null, grossProfit: null, netMarginPct: null, grossMarginPct: null }), ...values,
      referenceProfit: values ? gross ? values.referenceGrossProfit : values.referenceNetProfit : null,
      referenceMargin: values ? gross ? values.referenceGrossMargin : values.referenceNetMargin : null,
      modelMargin: modelValue == null ? null : modelValue * 100 };
  });
  function selectMode(value: string) {
    const query = new URLSearchParams(params.toString());
    query.set("profitMode", value);
    if (value === "net" && focus) { query.delete("anomaly"); query.delete("reason"); }
    // Both series are already loaded. Native history updates Next's client
    // search params without a server navigation or rerunning dashboard queries.
    window.history.pushState(null, "", `${window.location.pathname}?${query}${window.location.hash}`);
  }
  return (
    <section aria-labelledby="profit-margin-title" className="surface rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="profit-margin-title" className="text-lg font-semibold text-brand-navy">
          {name} Profit and Margin
        </h2>
        <label className="text-sm text-brand-navy">View <select aria-label="Profit and margin measure" value={selectedMode} onChange={e => selectMode(e.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5"><option value="net">Net</option><option value="gross">Gross</option></select></label>
        <p className="w-full mt-1 text-sm text-muted">Selected reporting month · Selected business unit</p>
      </div>

      <ComparisonNote showSource={false} metric={gross ? "grossProfit" : "netProfit"} />
      <ComparisonNote showSource={false} metric={gross ? "grossMargin" : "netMargin"} />
      <ChartAnomalyNote focus={activeFocus} target="profit-margin-title" ready={!loading && !error && data.length > 0} />
      <ComparisonSource source={financial?.source} />
      {loading ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted" role="status">
          Loading profit data...
        </div>
      ) : error ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-brand-red" role="alert">
          {error}
        </div>
      ) : chartData.length === 0 ? (
        <div className="mt-6 flex h-80 items-center justify-center text-sm text-muted">
          No profit or margin data is available for the selected periods.
        </div>
      ) : (
        <div className="mt-6 h-80 w-full" role="group" aria-label={`Combined chart showing ${name.toLowerCase()} profit and ${name.toLowerCase()} margin percentage by accounting period`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart accessibilityLayer data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e8f0" />
              <XAxis dataKey="period" tick={{ fill: "#5b6079", fontSize: 12 }} />
              <YAxis padding={{ top: 12 }} yAxisId="currency" tickFormatter={(value) => formatCurrencyCompact(Number(value), fx)} tick={{ fill: "#5b6079", fontSize: 12 }} width={58} />
              <YAxis padding={{ top: 12 }} yAxisId="percentage" orientation="right" tickFormatter={(value) => `${value}%`} tick={{ fill: "#5b6079", fontSize: 12 }} width={48} />
              <ComparisonHover source={financial?.source} measures={[
                { label: `${name} profit`, actualKey: gross ? "grossProfit" : "netProfit", comparisonKey: "referenceProfit" },
                { label: `${name} margin`, actualKey: gross ? "grossMarginPct" : "netMarginPct", comparisonKey: "referenceMargin", percentage: true },
              ]} model={activeFocus ? {label: "Model gross margin (includes other income)", key: "modelMargin", percentage: true} : undefined} />
              <Legend content={<ComparisonLegend />} />
              {financial && <Line yAxisId="currency" dataKey="referenceProfit" name={`${name} profit comparison`} {...comparisonStyle("monetary")} />}
              {financial && <Line yAxisId="percentage" dataKey="referenceMargin" name={`${name} margin comparison`} {...comparisonStyle("secondary")} />}
              {activeFocus && <ReferenceLine yAxisId="currency" x={formatPeriod(activeFocus.alert.periodNo)} stroke="#b45309" strokeWidth={3} label="Anomaly" />}
              {activeFocus && <Line yAxisId="percentage" dataKey="modelMargin" name="Model Gross Margin % (includes other income)" stroke="#b45309" strokeDasharray="4 4" connectNulls={false} />}
              <Bar yAxisId="currency" dataKey={gross ? "grossProfit" : "netProfit"} name={`${name} Profit`} fill="#1f2a79" radius={[3, 3, 0, 0]} />
              <Line yAxisId="percentage" type="monotone" dataKey={gross ? "grossMarginPct" : "netMarginPct"} name={`${name} Margin %`} stroke="#e02718" strokeWidth={2.5} connectNulls={false} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

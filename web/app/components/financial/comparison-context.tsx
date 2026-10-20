"use client";
import { SingleSelect } from "@/app/dashboard/components/single-select";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  SOURCES,
  METRICS,
  isSource,
  type FinancialBundle,
  type Source,
  type SourceSeries,
} from "@/lib/financial/types";
type Context = {
  bundle: FinancialBundle | null;
  source: Source;
  series: SourceSeries | null;
  error?: string;
};
const FinancialContext = createContext<Context | null>(null);
export const useFinancialComparison = () => useContext(FinancialContext);
export function FinancialProvider({
  bundle,
  error,
  children,
}: {
  bundle: FinancialBundle | null;
  error?: string;
  children?: ReactNode;
}) {
  const query = useSearchParams();
  const raw = query.get("comparison") ?? "previous";
  const source = isSource(raw) ? raw : "previous";
  const budget = query.get("budgetId");
  const invalid = !isSource(raw)
    ? "The selected comparison source is invalid."
    : source === "budget" && budget && !bundle?.budgetSources[budget]
      ? "The selected budget scenario is unavailable."
      : undefined;
  const series =
    !invalid && bundle
      ? source === "budget" && budget
        ? bundle.budgetSources[budget]
        : bundle.sources[source]
      : null;
  // Profit-mode/history changes must not broadcast a fresh comparison context
  // to every chart/card when their financial inputs are unchanged.
  const value = useMemo(() => ({ bundle, source, series, error: error ?? invalid }), [bundle, source, series, error, invalid]);
  return (
    <FinancialContext.Provider value={value}>
      {children}
    </FinancialContext.Provider>
  );
}
export function ComparisonSelector() {
  const context = useFinancialComparison();
  const params = useSearchParams();
  const update = (key: string, value: string) => {
    const query = new URLSearchParams(params.toString());
    if (value) query.set(key, value);
    else query.delete(key);
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}?${query}${window.location.hash}`,
    );
  };
  if (!context) return null;
  return (
    <section
      aria-label="Financial comparison source"
      className="mt-5 rounded-xl border border-brand-navy/15 bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 text-sm font-medium text-brand-navy">
          <span>Compare against</span>
          <SingleSelect label="Comparison source" hideLabel disabled={!context.bundle} value={context.source} onChange={value => update("comparison", value)} options={Object.entries(SOURCES).map(([value,label]) => ({value,label}))} className="w-full sm:w-64" />
        </div>
        {context.source === "budget" && context.bundle && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 text-sm text-brand-navy">
            <span>Budget scenario</span>
            <SingleSelect label="Budget scenario" hideLabel value={params.get("budgetId") ?? ""} onChange={value => update("budgetId", value)} options={[{value:"",label:"Unique monthly scenario, if available"},...context.bundle.budgets.map(b => ({value:b.id,label:b.name}))]} className="w-full sm:w-72" />
          </div>
        )}
        <a
          href="/settings#budgets-forecasts"
          className="text-sm font-medium text-brand-blue underline"
        >
          Manage budgets & forecasts
        </a>
      </div>
      <p className="mt-2 text-xs text-muted">
        Actual ledger values stay unchanged. The selected reference applies
        throughout this dashboard. Home notifications use the source saved in
        Settings.
      </p>
      {context.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {context.error}
        </p>
      )}
      {context.bundle?.sourceErrors?.[context.source] && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {context.bundle.sourceErrors[context.source]}
        </p>
      )}
      {context.source === "auto" && (
        <p className="mt-2 text-xs text-muted">
          {context.bundle?.forecastNotice}
        </p>
      )}
    </section>
  );
}
export function ComparisonNote({
  showSource = true,
  metric,
  period,
}: {
  metric: import("@/lib/financial/types").Metric;
  period?: number;
  showSource?: boolean;
}) {
  const context = useFinancialComparison();
  if (!context?.bundle || !context.series) return null;
  const point = context.series[period ?? context.bundle.period];
  const c = point?.metrics[metric];
  return (
    <div className="mt-3 text-xs text-muted">
      <p>
        {METRICS[metric].label} · {showSource && <>{SOURCES[context.source]} · </>}{" "}
        {c?.reference === null || !c
          ? "Comparison unavailable for this metric and scope."
          : c.actual === null
            ? "Actual value and variance unavailable."
          : c.percentage === null
            ? "Percentage variance unavailable for a zero reference."
          : c.breach
            ? "Unfavorable deviation exceeds the shared threshold."
            : "No unfavorable threshold breach."}
      </p>
      {context.source === "auto" && (
        <details className="mt-1">
          <summary className="cursor-pointer">
            Forecast origin and limitations
          </summary>
          <p className="mt-1">{c?.note}</p>
          <a className="underline" href="/forecast">
            View forecast accuracy and outcome ranges
          </a>
        </details>
      )}
    </div>
  );
}
export function ActualOnlyComparisonNote({
  children,
}: {
  children: ReactNode;
}) {
  const context = useFinancialComparison();
  if (!context) return null;
  return <p className="mt-2 px-1 text-xs text-muted">{children}</p>;
}

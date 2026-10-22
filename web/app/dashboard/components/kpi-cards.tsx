"use client";
import Link from "next/link";
import { useCurrency } from "@/lib/currency-context";
import { comparisonKpis } from "@/lib/financial/presentation";
import { useFinancialComparison } from "@/app/components/financial/comparison-context";
import {
  formatAmount,
  formatPercentage,
  type KpiData,
} from "../data/kpi-presentation";
export function KpiCards({
  data,
  error,
}: {
  data?: KpiData | null;
  error?: string;
  userId?: string;
}) {
  const context = useFinancialComparison();
  const fx = useCurrency();
  const current = context
    ? context.bundle && context.series
      ? comparisonKpis(context.bundle, context.source, context.series)
      : null
    : data;
  const message = context?.error ?? error;
  if (!current || message)
    return (
      <section
        aria-label="Financial overview"
        className="mt-8 rounded-xl border p-6"
      >
        <h2 className="text-lg font-semibold">Financial overview</h2>
        <p role="status" className="mt-2 text-sm text-muted">
          {message ?? "No financial data is available."}
        </p>
      </section>
    );
  const flagged = current.metrics.filter((m) => m.comparison?.breach);
  return (
    <section aria-labelledby="kpi-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left padding keeps the walkthrough badge (top-left corner) off the heading text. */}
        <div>
          <h2
            id="kpi-heading"
            className="text-xl font-semibold text-brand-navy pl-3"
          >
            Financial overview
          </h2>
          <p className="mt-1 text-sm text-muted">
            {current.period} · {current.comparisonLabel ?? "Previous month"} ·{" "}
            {fx.currency}
          </p>
        </div>
        <Link
          href="/settings#thresholds"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        >
          Threshold settings
        </Link>
      </div>
      <p
        role="status"
        className={`mt-4 rounded-lg p-3 text-sm ${flagged.length ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-muted"}`}
      >
        {flagged.length
          ? `Attention needed: ${flagged.map((m) => m.label).join(", ")}.`
          : "No calculable unfavorable deviations exceed the shared thresholds."}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {current.metrics
          .filter((m) => m.id !== "budgetVariance")
          .map((metric) => {
            const c = metric.comparison;
            const unfavorable = c?.unfavorable ?? false;
            return (
              <article
                key={metric.id}
                className={`min-w-0 rounded-xl border border-t-4 bg-white p-5 shadow-sm ${c?.breach ? "border-amber-300 border-t-amber-500" : "border-slate-200 border-t-brand-navy"}`}
              >
                <h3 className="text-sm text-muted">{metric.label}</h3>
                <p className="my-3 break-words text-2xl font-semibold text-brand-navy">
                  {metric.value === null
                    ? "Unavailable"
                    : formatAmount(metric.value, metric.unit, fx)}
                </p>
                <p
                  className={`text-sm font-medium ${!metric.change || metric.change.percentage === null ? "text-muted" : unfavorable ? "text-red-700" : metric.change.direction ? "text-emerald-700" : "text-muted"}`}
                >
                  {metric.change?.percentage == null
                    ? "Percentage comparison unavailable"
                    : formatPercentage(metric.change.percentage)}
                  {c?.breach ? " · Attention needed" : ""}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Reference:{" "}
                  {metric.prior === null
                    ? "Unavailable"
                    : formatAmount(metric.prior, metric.unit, fx)}
                </p>
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer">
                    Calculation & alert basis
                  </summary>
                  <p className="mt-2">{metric.description}</p>
                  <p className="mt-1">
                    {c?.enabled
                      ? `Notify only when unfavorable deviation exceeds ${c.tolerance}%.`
                      : "Attention alerts disabled."}
                  </p>
                  {c?.note && <p className="mt-1">{c.note}</p>}
                </details>
              </article>
            );
          })}
      </div>
      {current.notices.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">
            Comparison availability and origin
          </summary>
          {current.notices.map((n, i) => (
            <p className="mt-2" key={i}>
              {n}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}

"use client";
import { useFinancialComparison } from "./comparison-context";
import { PNL_METRICS } from "@/lib/financial/presentation";
import { METRICS, SOURCES } from "@/lib/financial/types";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrencyExact } from "@/lib/currency";
import { formatPercentage } from "@/app/dashboard/data/kpi-presentation";
export function FinancialProfitLoss() {
  const context = useFinancialComparison();
  const fx = useCurrency();
  if (!context) return null;
  const { bundle, series, source } = context;
  const point = bundle && series?.[bundle.period];
  const format = (v: string | null | undefined) =>
    v == null ? "—" : formatCurrencyExact(Number(v), fx);
  const label = {
    previous: "Previous Month Actual",
    budget: "Month Budget",
    auto: "Auto Forecast",
    manual: "Manual Forecast",
  }[source];
  return (
    <section
      aria-labelledby="profit-loss-title"
      className="rounded-xl border border-black/10 bg-white p-6 shadow-sm"
    >
      <h2
        id="profit-loss-title"
        className="text-lg font-semibold text-brand-navy"
      >
        Profit & Loss Statement
      </h2>
      <p className="mt-1 text-sm text-muted">
        {bundle?.period} · {SOURCES[source]} · Gross profit = operating revenue
        − cost of sales. Final profit includes other income and operating
        expenses.
      </p>
      {!point || context.error ? (
        <p role="status" className="mt-4 text-sm text-muted">
          {context.error ?? "P&L comparisons are unavailable."}
        </p>
      ) : (
        <>
          <div
            className="mt-5 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="P&L comparison table"
          >
            <table className="w-full min-w-[700px] text-sm">
              <caption className="sr-only">P&L for {bundle?.period}</caption>
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted">
                  {[
                    "Description",
                    "Month Actual",
                    "Year-to-Date Actual",
                    label,
                    "Variance %",
                  ].map((h, i) => (
                    <th
                      scope="col"
                      key={h}
                      className={`p-3 ${i ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PNL_METRICS.map((metric) => {
                  const c = point.metrics[metric];
                  return (
                    <tr
                      key={metric}
                      data-metric={metric}
                      className={`border-b border-slate-100 ${metric === "grossProfit" || metric === "netProfit" ? "bg-slate-50 font-semibold" : ""}`}
                    >
                      <th scope="row" className="p-3 text-left">
                        {METRICS[metric].label}
                      </th>
                      <td className="p-3 text-right">{format(c.actual)}</td>
                      <td className="p-3 text-right">
                        {format(bundle?.ytd[metric])}
                      </td>
                      <td className="p-3 text-right">{format(c.reference)}</td>
                      <td
                        className={`p-3 text-right ${c.percentage === null ? "text-muted" : c.unfavorable ? "text-red-700" : c.percentage ? "text-emerald-700" : "text-muted"}`}
                      >
                        {c.percentage === null
                          ? "—"
                          : formatPercentage(c.percentage)}
                        {c.breach && (
                          <span className="ml-1 text-xs">
                            {" "}
                            · Attention needed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer">
              Comparison coverage and origin
            </summary>
            {point.provenance.map((note, i) => (
              <p className="mt-2" key={i}>
                {note}
              </p>
            ))}
            <p className="mt-2">
              Missing comparisons are unavailable, never zero or replaced by
              another source. Year-to-date figures contain actual ledger values
              only.
            </p>
            {source === "auto" && (
              <p className="mt-2">
                {bundle?.forecastNotice}{" "}
                <a href="/forecast" className="underline">
                  View accuracy and outcome ranges
                </a>
                .
              </p>
            )}
          </details>
        </>
      )}
    </section>
  );
}

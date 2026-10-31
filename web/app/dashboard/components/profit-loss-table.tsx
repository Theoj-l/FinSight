"use client";

import { useFinancialComparison } from "@/app/components/financial/comparison-context";
import { FinancialProfitLoss } from "@/app/components/financial/financial-pnl";
import { formatCurrencyExact, type ProfitLossStatement } from "../data/profit-loss-utils";
import { formatPercentage } from "../data/kpi-presentation";
import { useCurrency } from "@/lib/currency-context";

type ProfitLossTableProps = {
  data?: ProfitLossStatement;
  error?: string;
};

function rowStyle(rowType: string) {
  if (rowType === "H") return "bg-brand-blue-light/60 font-semibold text-brand-navy";
  if (rowType === "S") return "bg-black/[.035] font-semibold text-brand-navy";
  return "text-foreground";
}

function valueStyle(value: number | null | undefined, higherIsBetter = true) {
  if (value === null || value === undefined || value === 0) return "text-muted";
  return (value > 0) === higherIsBetter ? "text-emerald-700" : "text-red-700";
}

export function ProfitLossTable({ data, error }: ProfitLossTableProps) {
  const fx = useCurrency();
  const financial = useFinancialComparison();
  if (financial) return <FinancialProfitLoss />;
  return (
    <section aria-labelledby="profit-loss-title" className="surface rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="profit-loss-title" className="text-lg font-semibold text-brand-navy">Profit and Loss Statement</h2>
          <p className="mt-1 text-sm text-muted">Actual vs. budget for the selected month (latest month, if a range is selected). Year-to-date runs from January through that month, for the same business unit.</p>
        </div>
        {data?.period && <span className="text-sm font-medium text-muted">Period {data.period}</span>}
      </div>
      {data?.notices?.map(notice => <p key={notice} className="mt-3 text-sm text-muted">{notice}</p>)}

      {error ? (
        <div className="mt-6 text-sm text-brand-red" role="alert">{error}</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="mt-6 text-sm text-muted">No profit and loss data is available.</div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">Profit and loss statement for {data.period}</caption>
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3 text-right">Month-to-Date</th>
                <th className="px-3 py-3 text-right">Year-to-Date</th>
                <th className="px-3 py-3 text-right">Month Budget</th>
                <th className="px-3 py-3 text-right">Variance %</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={`${row.rowType}-${row.description}-${index}`} className={`border-b border-black/5 ${rowStyle(row.rowType)}`}>
                  <td className={`px-3 py-3 ${row.rowType === "A" ? "pl-7" : ""}`}>{row.description}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.monthToDate === undefined ? row.rowType === "H" ? "" : "—" : formatCurrencyExact(row.monthToDate, fx)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.yearToDate === undefined ? "" : formatCurrencyExact(row.yearToDate, fx)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.budgetMonthToDate === undefined ? row.rowType === "H" ? "" : "—" : formatCurrencyExact(row.budgetMonthToDate, fx)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${valueStyle(row.variancePct, row.higherIsBetter)}`}>
                    {row.variancePct === undefined ? "" : row.variancePct === null ? "—" : <span>{row.variancePct !== 0 && <span aria-label={row.variancePct > 0 ? "Increase" : "Decrease"}>{row.variancePct > 0 ? "▲ " : "▼ "}</span>}{formatPercentage(row.variancePct)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

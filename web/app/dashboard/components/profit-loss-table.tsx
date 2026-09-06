import { formatCurrencyExact, type ProfitLossStatement } from "../data/profit-loss-utils";

type ProfitLossTableProps = {
  data?: ProfitLossStatement;
  error?: string;
};

function rowStyle(rowType: string) {
  if (rowType === "H") return "bg-brand-blue-light/60 font-semibold text-brand-navy";
  if (rowType === "S") return "bg-black/[.035] font-semibold text-brand-navy";
  return "text-foreground";
}

function valueStyle(value: number | null | undefined) {
  if (value === null || value === undefined) return "text-muted";
  return value < 0 ? "text-brand-red" : "text-[#16803c]";
}

export function ProfitLossTable({ data, error }: ProfitLossTableProps) {
  return (
    <section aria-labelledby="profit-loss-title" className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="profit-loss-title" className="text-lg font-semibold text-brand-navy">Profit and Loss Statement</h2>
          <p className="mt-1 text-sm text-muted">Ordered by PLFormat sequence. Variance: MTD actual versus MTD budget.</p>
        </div>
        {data?.period && <span className="text-sm font-medium text-muted">Period {data.period}</span>}
      </div>

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
                <th className="px-3 py-3 text-right">Variance %</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={`${row.rowType}-${row.description}-${index}`} className={`border-b border-black/5 ${rowStyle(row.rowType)}`}>
                  <td className={`px-3 py-3 ${row.rowType === "A" ? "pl-7" : ""}`}>{row.description}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.monthToDate === undefined ? "" : formatCurrencyExact(row.monthToDate)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.yearToDate === undefined ? "" : formatCurrencyExact(row.yearToDate)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${valueStyle(row.variancePct)}`}>
                    {row.variancePct === undefined ? "" : row.variancePct === null ? "—" : `${row.variancePct.toFixed(2)}%`}
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
import { METRICS, monthLabel, type FinancialBundle, type Metric } from "./types";

export type ChangeTone = "favourable" | "unfavourable" | "flat" | "none";

export type MonthCell = {
  period: number;
  actual: string | null;
  /** Change from the calendar month before. */
  absolute: string | null;
  percentage: number | null;
  tone: ChangeTone;
};

export type MonthRow = { metric: Metric; label: string; cells: MonthCell[] };

export type TrendPoint = {
  period: number;
  label: string;
  revenue: number | null;
  totalExpenses: number | null;
  grossProfit: number | null;
  netProfit: number | null;
};

/** The months the comparison bundle holds, oldest first: the selected month and the five before it, or every month of a range. */
export function bundleMonths(bundle: FinancialBundle): number[] {
  return Object.keys(bundle.sources.previous).map(Number).sort((a, b) => a - b);
}

/**
 * Month-by-month actuals for each P&L line, each with its change from the month
 * before. Reads the "previous month" comparisons the bundle already holds, so
 * no extra query: their actuals are the same for every comparison source.
 */
export function pnlMonthRows(bundle: FinancialBundle, metrics: Metric[], months = bundleMonths(bundle)): MonthRow[] {
  return metrics.map((metric) => ({
    metric,
    label: METRICS[metric].label,
    cells: months.map((period) => {
      const c = bundle.sources.previous[period]?.metrics[metric];
      if (!c) return { period, actual: null, absolute: null, percentage: null, tone: "none" };
      const tone: ChangeTone = c.absolute === null ? "none" : Number(c.absolute) === 0 ? "flat" : c.unfavorable ? "unfavourable" : "favourable";
      return { period, actual: c.actual, absolute: c.absolute, percentage: c.percentage, tone };
    }),
  }));
}

/** Revenue, total expenses (cost of sales + operating expenses), gross and net profit per month, for the trend chart. */
export function pnlTrend(bundle: FinancialBundle, months = bundleMonths(bundle)): TrendPoint[] {
  const number = (value: string | null | undefined) => (value == null ? null : Number(value));
  return months.map((period) => {
    const m = bundle.sources.previous[period]?.metrics;
    const cost = number(m?.costOfSales.actual), opex = number(m?.operatingExpenses.actual);
    return {
      period,
      label: monthLabel(period),
      revenue: number(m?.revenue.actual),
      totalExpenses: cost === null || opex === null ? null : cost + opex,
      grossProfit: number(m?.grossProfit.actual),
      netProfit: number(m?.netProfit.actual),
    };
  });
}

import type { PeriodComparison } from "./types";

const numeric = (v: string | null) => (v === null ? null : Number(v));
// Charts consume the same scoped, complete comparisons as cards and P&L.
// Conversion to Number happens only at the chart rendering boundary.
export function chartValues(point: PeriodComparison) {
  const m = point.metrics;
  return {
    revenue: numeric(m.revenue.actual),
    expenses: numeric(m.operatingExpenses.actual),
    netProfit: numeric(m.netProfit.actual),
    grossProfit: numeric(m.grossProfit.actual),
    netMarginPct: numeric(m.netMargin.actual),
    grossMarginPct: numeric(m.grossMargin.actual),
    referenceRevenue: numeric(m.revenue.reference),
    referenceExpenses: numeric(m.operatingExpenses.reference),
    referenceNetProfit: numeric(m.netProfit.reference),
    referenceGrossProfit: numeric(m.grossProfit.reference),
    referenceNetMargin: numeric(m.netMargin.reference),
    referenceGrossMargin: numeric(m.grossMargin.reference),
  };
}

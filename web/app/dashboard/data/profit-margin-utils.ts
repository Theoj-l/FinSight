import { formatCurrencyCompact, formatCurrencyExact, formatPeriod } from "./revenue-expense-utils";

export type ProfitMarginPoint = {
  period: string;
  periodNo: number;
  grossProfit: number;
  grossMarginPct: number | null;
  netProfit: number;
  netMarginPct: number | null;
};

export type ProfitBalanceRow = {
  period_no: number;
  home_dr: number | string | { toNumber(): number };
  home_cr: number | string | { toNumber(): number };
  gl_mast: { acc_type: string };
};

function decimalToNumber(value: ProfitBalanceRow["home_dr"]) {
  return typeof value === "object" ? value.toNumber() : Number(value);
}

export function aggregateProfitMargin(rows: ProfitBalanceRow[]): ProfitMarginPoint[] {
  const totals = new Map<number, {
    revenue: number;
    otherIncome: number;
    costOfSales: number;
    operatingExpenses: number;
  }>();

  for (const row of rows) {
    const signedMovement = decimalToNumber(row.home_dr) - decimalToNumber(row.home_cr);
    const total = totals.get(row.period_no) ?? {
      revenue: 0,
      otherIncome: 0,
      costOfSales: 0,
      operatingExpenses: 0,
    };

    if (row.gl_mast.acc_type === "RE") total.revenue -= signedMovement;
    if (row.gl_mast.acc_type === "OI") total.otherIncome -= signedMovement;
    if (row.gl_mast.acc_type === "CS") total.costOfSales += signedMovement;
    if (row.gl_mast.acc_type === "EX") total.operatingExpenses += signedMovement;

    totals.set(row.period_no, total);
  }

  return [...totals.entries()]
    .sort(([firstPeriod], [secondPeriod]) => firstPeriod - secondPeriod)
    .map(([periodNo, total]) => {
      const netProfit =
        total.revenue +
        total.otherIncome -
        total.costOfSales -
        total.operatingExpenses;

      return {
        period: formatPeriod(periodNo),
        periodNo,
        grossProfit: total.revenue - total.costOfSales,
        grossMarginPct: total.revenue <= 0 ? null : ((total.revenue - total.costOfSales) / total.revenue) * 100,
        netProfit,
        netMarginPct: total.revenue === 0 ? null : (netProfit / total.revenue) * 100,
      };
    });
}

export { formatCurrencyCompact, formatCurrencyExact };
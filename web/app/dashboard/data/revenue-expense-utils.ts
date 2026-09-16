export type RevenueExpensePoint = {
  period: string;
  revenue: number;
  expenses: number;
};

export type BalanceRow = {
  period_no: number;
  home_dr: number | { toNumber(): number };
  home_cr: number | { toNumber(): number };
  gl_mast: { acc_type: string };
};

function decimalToNumber(value: BalanceRow["home_dr"]) {
  return typeof value === "object" ? value.toNumber() : Number(value);
}

export function selectLatestPeriods(periods: number[], count = 6) {
  return [...new Set(periods)].sort((first, second) => second - first).slice(0, count);
}

export function formatPeriod(periodNo: number) {
  const value = String(periodNo);
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export { formatCurrencyCompact, formatCurrencyExact } from "@/lib/currency";

export function aggregateRevenueExpense(rows: BalanceRow[]): RevenueExpensePoint[] {
  const totals = new Map<number, { revenue: number; expenses: number }>();

  for (const row of rows) {
    const signedMovement = decimalToNumber(row.home_dr) - decimalToNumber(row.home_cr);
    const total = totals.get(row.period_no) ?? { revenue: 0, expenses: 0 };

    if (row.gl_mast.acc_type === "RE") total.revenue -= signedMovement;
    if (row.gl_mast.acc_type === "EX") total.expenses += signedMovement;

    totals.set(row.period_no, total);
  }

  return [...totals.entries()]
    .sort(([firstPeriod], [secondPeriod]) => firstPeriod - secondPeriod)
    .map(([periodNo, total]) => ({ period: formatPeriod(periodNo), ...total }));
}
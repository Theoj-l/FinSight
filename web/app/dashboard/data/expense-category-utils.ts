import { formatCurrencyCompact, formatCurrencyExact, formatPeriod } from "./revenue-expense-utils";

export type ExpenseCategoryPoint = {
  category: string;
  amount: number;
  priorAmount: number | null;
};

export type ExpenseCategoryPeriod = {
  periodNo: number;
  period: string;
  categories: ExpenseCategoryPoint[];
};

export type ExpenseBalanceRow = {
  period_no: number;
  home_dr: number | string | { toNumber(): number };
  home_cr: number | string | { toNumber(): number };
  gl_mast: { description: string | null; acc_type: string };
};

function decimalToNumber(value: ExpenseBalanceRow["home_dr"]) {
  return typeof value === "object" ? value.toNumber() : Number(value);
}

export function aggregateExpenseCategories(rows: ExpenseBalanceRow[]): ExpenseCategoryPeriod[] {
  const totals = new Map<number, Map<string, number>>();

  for (const row of rows) {
    if (row.gl_mast.acc_type !== "EX") continue;

    const movement = decimalToNumber(row.home_dr) - decimalToNumber(row.home_cr);

    const category = row.gl_mast.description?.trim() || "Uncategorized";
    const periodTotals = totals.get(row.period_no) ?? new Map<string, number>();
    periodTotals.set(category, (periodTotals.get(category) ?? 0) + movement);
    totals.set(row.period_no, periodTotals);
  }

  const periodNumbers = [...totals.keys()].sort((first, second) => first - second);
  let previousByCategory = new Map<string, number>();

  return periodNumbers.map((periodNo) => {
    const periodTotals = totals.get(periodNo) ?? new Map<string, number>();
    const categories = [...periodTotals.entries()]
      .map(([category, signedAmount]) => ({ category, amount: Math.abs(signedAmount) }))
      .filter(({ amount }) => amount !== 0)
      .map(({ category, amount }) => ({
        category,
        amount,
        priorAmount: previousByCategory.get(category) ?? null,
      }))
      .sort((first, second) => second.amount - first.amount);

    previousByCategory = new Map(categories.map(({ category, amount }) => [category, amount]));

    return { periodNo, period: formatPeriod(periodNo), categories };
  });
}

export function getCategoriesForPeriod(data: ExpenseCategoryPeriod[], periodNo: number) {
  return data.find((period) => period.periodNo === periodNo)?.categories ?? [];
}

export function getPercentChange(amount: number, priorAmount: number | null) {
  if (priorAmount === null || priorAmount === 0) return null;
  return ((amount - priorAmount) / priorAmount) * 100;
}

export { formatCurrencyCompact, formatCurrencyExact };
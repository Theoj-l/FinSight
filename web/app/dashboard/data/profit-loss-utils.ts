import { formatCurrencyExact } from "./revenue-expense-utils";

export type PlFormatRow = {
  seq: number;
  row_type: string;
  acc_type: string | null;
  description: string | null;
  credit_as_positive: boolean;
};

export type ProfitLossBalanceRow = {
  period_no: number;
  home_dr: number | string | { toNumber(): number };
  home_cr: number | string | { toNumber(): number };
  gl_mast: { acc_type: string };
};

export type ProfitLossBudgetRow = {
  period_no: number;
  amount: number | string | { toNumber(): number };
  gl_mast: { acc_type: string };
};

export type ProfitLossValueRow = {
  rowType: string;
  description: string;
  monthToDate?: number;
  yearToDate?: number;
  budgetMonthToDate?: number;
  variancePct?: number | null;
};

export type ProfitLossStatement = {
  baseline: "MTD actual versus MTD budget";
  period: string;
  rows: ProfitLossValueRow[];
};

function decimalToNumber(value: number | string | { toNumber(): number }) {
  return typeof value === "object" ? value.toNumber() : Number(value);
}

function actualAmount(row: ProfitLossBalanceRow, creditAsPositive: boolean) {
  const signedMovement = decimalToNumber(row.home_dr) - decimalToNumber(row.home_cr);
  return creditAsPositive ? -signedMovement : signedMovement;
}

function budgetAmount(row: ProfitLossBudgetRow, creditAsPositive: boolean) {
  const debitPositiveAmount = decimalToNumber(row.amount);
  return creditAsPositive ? -debitPositiveAmount : debitPositiveAmount;
}

function aggregateAccountValues<T extends { period_no: number; gl_mast: { acc_type: string } }>(
  rows: T[],
  amount: (row: T, creditAsPositive: boolean) => number,
  formatRows: PlFormatRow[],
  periodFilter: (periodNo: number) => boolean,
) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (!periodFilter(row.period_no)) continue;
    const format = formatRows.find(({ acc_type }) => acc_type === row.gl_mast.acc_type);
    if (!format) continue;
    totals.set(row.gl_mast.acc_type, (totals.get(row.gl_mast.acc_type) ?? 0) + amount(row, format.credit_as_positive));
  }

  return totals;
}

function calculateRows(
  formatRows: PlFormatRow[],
  accountValues: Map<string, number>,
  budgetAccountValues: Map<string, number>,
  yearAccountValues: Map<string, number>,
) {
  const orderedRows = [...formatRows].sort((first, second) => first.seq - second.seq);
  const rows: ProfitLossValueRow[] = [];
  const accountRowsSinceSubtotal: Array<{
    monthToDate: number;
    yearToDate: number;
    budgetMonthToDate: number;
    creditAsPositive: boolean;
  }> = [];
  const subtotalRows: Array<{
    monthToDate: number;
    yearToDate: number;
    budgetMonthToDate: number;
    creditAsPositive: boolean;
  }> = [];

  for (const format of orderedRows) {
    let monthToDate: number | undefined;
    let yearToDate: number | undefined;
    let budgetMonthToDate: number | undefined;

    if (format.row_type === "A" && format.acc_type) {
      monthToDate = accountValues.get(format.acc_type) ?? 0;
      yearToDate = yearAccountValues.get(format.acc_type) ?? 0;
      budgetMonthToDate = budgetAccountValues.get(format.acc_type) ?? 0;
      accountRowsSinceSubtotal.push({ monthToDate, yearToDate, budgetMonthToDate, creditAsPositive: format.credit_as_positive });
    } else if (format.row_type === "S") {
      const sectionTotal = accountRowsSinceSubtotal.reduce(
        (sum, account) => ({
          monthToDate: sum.monthToDate + account.monthToDate,
          yearToDate: sum.yearToDate + account.yearToDate,
          budgetMonthToDate: sum.budgetMonthToDate + account.budgetMonthToDate,
        }),
        { monthToDate: 0, yearToDate: 0, budgetMonthToDate: 0 },
      );
      const sectionContribution = accountRowsSinceSubtotal.reduce(
        (sum, account) => ({
          monthToDate: sum.monthToDate + (account.creditAsPositive ? account.monthToDate : -account.monthToDate),
          yearToDate: sum.yearToDate + (account.creditAsPositive ? account.yearToDate : -account.yearToDate),
          budgetMonthToDate: sum.budgetMonthToDate + (account.creditAsPositive ? account.budgetMonthToDate : -account.budgetMonthToDate),
        }),
        { monthToDate: 0, yearToDate: 0, budgetMonthToDate: 0 },
      );
      const priorSubtotal = subtotalRows.at(-1);
      const isProfitRow = /profit/i.test(format.description ?? "");

      if (accountRowsSinceSubtotal.length > 0) {
        monthToDate = isProfitRow && priorSubtotal ? priorSubtotal.monthToDate + sectionContribution.monthToDate : sectionTotal.monthToDate;
        yearToDate = isProfitRow && priorSubtotal ? priorSubtotal.yearToDate + sectionContribution.yearToDate : sectionTotal.yearToDate;
        budgetMonthToDate = isProfitRow && priorSubtotal ? priorSubtotal.budgetMonthToDate + sectionContribution.budgetMonthToDate : sectionTotal.budgetMonthToDate;
      } else if (priorSubtotal && subtotalRows.length > 1) {
        const beforePrior = subtotalRows.at(-2)!;
        monthToDate = beforePrior.monthToDate + (priorSubtotal.creditAsPositive ? priorSubtotal.monthToDate : -priorSubtotal.monthToDate);
        yearToDate = beforePrior.yearToDate + (priorSubtotal.creditAsPositive ? priorSubtotal.yearToDate : -priorSubtotal.yearToDate);
        budgetMonthToDate = beforePrior.budgetMonthToDate + (priorSubtotal.creditAsPositive ? priorSubtotal.budgetMonthToDate : -priorSubtotal.budgetMonthToDate);
      }

      subtotalRows.push({
        monthToDate: monthToDate ?? 0,
        yearToDate: yearToDate ?? 0,
        budgetMonthToDate: budgetMonthToDate ?? 0,
        creditAsPositive: format.credit_as_positive,
      });
      accountRowsSinceSubtotal.length = 0;
    }

    const variancePct =
      monthToDate === undefined || budgetMonthToDate === undefined
        ? undefined
        : budgetMonthToDate === 0
          ? null
          : ((monthToDate - budgetMonthToDate) / Math.abs(budgetMonthToDate)) * 100;
    rows.push({
      rowType: format.row_type,
      description: format.description ?? "",
      monthToDate,
      yearToDate,
      budgetMonthToDate,
      variancePct,
    });
  }

  return rows;
}

export function aggregateProfitLoss(
  formatRows: PlFormatRow[],
  actualRows: ProfitLossBalanceRow[],
  budgetRows: ProfitLossBudgetRow[],
  latestPeriod: number,
): ProfitLossStatement {
  const year = Math.floor(latestPeriod / 100);
  const accountValues = aggregateAccountValues(actualRows, actualAmount, formatRows, (periodNo) => periodNo === latestPeriod);
  const yearAccountValues = aggregateAccountValues(actualRows, actualAmount, formatRows, (periodNo) => Math.floor(periodNo / 100) === year && periodNo <= latestPeriod);
  const budgetAccountValues = aggregateAccountValues(budgetRows, budgetAmount, formatRows, (periodNo) => periodNo === latestPeriod);

  return {
    baseline: "MTD actual versus MTD budget",
    period: `${String(latestPeriod).slice(0, 4)}-${String(latestPeriod).slice(4)}`,
    rows: calculateRows(formatRows, accountValues, budgetAccountValues, yearAccountValues),
  };
}

export { formatCurrencyExact };
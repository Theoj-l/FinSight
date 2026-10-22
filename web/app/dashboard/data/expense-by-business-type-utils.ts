import { formatCurrencyCompact, formatCurrencyExact, formatPeriod } from "./revenue-expense-utils";
import { VALID_SEGMENTS, type BusinessSegment } from "./revenue-by-business-type-utils";

export type ExpenseByBusinessTypePeriod = {
  periodNo: number;
  period: string;
  machiningAmount: number;
  bulkAmount: number;
  totalOpex: number;
  machiningPct: number;
  bulkPct: number;
};

export type ExpenseBusinessTypeRow = {
  period_no: number;
  segment?: string | null;
  movement: number | string | { toNumber(): number } | null | undefined;
};

function decimalToNumber(value: ExpenseBusinessTypeRow["movement"]): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object" && typeof value.toNumber === "function") return value.toNumber();
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function aggregateExpenseByBusinessType(rows: ExpenseBusinessTypeRow[]): ExpenseByBusinessTypePeriod[] {
  const totals = new Map<number, Record<BusinessSegment, number>>();

  for (const row of rows) {
    if (!row.segment || !VALID_SEGMENTS.includes(row.segment as BusinessSegment)) continue;
    const period = totals.get(row.period_no) ?? { Machining: 0, Bulk: 0 };
    period[row.segment as BusinessSegment] += decimalToNumber(row.movement);
    totals.set(row.period_no, period);
  }

  return [...totals.entries()]
    .sort(([first], [second]) => first - second)
    .map(([periodNo, amounts]) => {
      const machiningAmount = Math.abs(amounts.Machining);
      const bulkAmount = Math.abs(amounts.Bulk);
      const totalOpex = machiningAmount + bulkAmount;
      return {
        periodNo,
        period: formatPeriod(periodNo),
        machiningAmount,
        bulkAmount,
        totalOpex,
        machiningPct: totalOpex === 0 ? 0 : (machiningAmount / totalOpex) * 100,
        bulkPct: totalOpex === 0 ? 0 : (bulkAmount / totalOpex) * 100,
      };
    });
}

export { formatCurrencyCompact, formatCurrencyExact };

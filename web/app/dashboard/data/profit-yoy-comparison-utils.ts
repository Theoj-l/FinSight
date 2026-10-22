import { formatCurrencyCompact, formatCurrencyExact } from "@/lib/currency";

export type ProfitYoyBalanceRow = {
  period_no: number;
  acc_type: string;
  movement: number | string | { toNumber(): number };
};

export type ProfitYoyPeriod = {
  periodNo: number;
  label: string;
};

export type ProfitYoyPoint = ProfitYoyPeriod & {
  currentProfit: number | null;
  priorProfit: number | null;
};

export type ProfitYoyComparison = {
  currentPeriods: ProfitYoyPeriod[];
  priorPeriods: ProfitYoyPeriod[];
  points: ProfitYoyPoint[];
  currentTotal: number | null;
  priorTotal: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  complete: boolean;
};

function decimalToNumber(value: ProfitYoyBalanceRow["movement"]) {
  return typeof value === "object" ? value.toNumber() : Number(value);
}

export function shiftPeriod(periodNo: number, months: number) {
  const year = Math.floor(periodNo / 100);
  const month = periodNo % 100;
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

export function getComparisonPeriods(endPeriod: number) {
  const current = [shiftPeriod(endPeriod, -2), shiftPeriod(endPeriod, -1), endPeriod];
  return {
    current,
    prior: current.map(periodNo => shiftPeriod(periodNo, -12)),
  };
}

export function formatPeriodLabel(periodNo: number) {
  const year = Math.floor(periodNo / 100);
  const month = periodNo % 100;
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function aggregateProfitYoyComparison(rows: ProfitYoyBalanceRow[], endPeriod: number): ProfitYoyComparison {
  const { current, prior } = getComparisonPeriods(endPeriod);
  const totals = new Map<number, { revenue: number; otherIncome: number; costOfSales: number; operatingExpenses: number }>();

  for (const row of rows) {
    const total = totals.get(row.period_no) ?? { revenue: 0, otherIncome: 0, costOfSales: 0, operatingExpenses: 0 };
    const movement = decimalToNumber(row.movement);
    if (row.acc_type === "RE") total.revenue -= movement;
    if (row.acc_type === "OI") total.otherIncome -= movement;
    if (row.acc_type === "CS") total.costOfSales += movement;
    if (row.acc_type === "EX") total.operatingExpenses += movement;
    totals.set(row.period_no, total);
  }

  const profitFor = (periodNo: number) => {
    const total = totals.get(periodNo);
    if (!total) return null;
    return total.revenue + total.otherIncome - total.costOfSales - total.operatingExpenses;
  };
  const currentPeriods = current.map(periodNo => ({ periodNo, label: formatPeriodLabel(periodNo) }));
  const priorPeriods = prior.map(periodNo => ({ periodNo, label: formatPeriodLabel(periodNo) }));
  const points = currentPeriods.map((period, index) => ({
    ...period,
    currentProfit: profitFor(period.periodNo),
    priorProfit: profitFor(prior[index]),
  }));
  const complete = points.every(point => point.currentProfit !== null && point.priorProfit !== null);
  const currentTotal = complete ? points.reduce((sum, point) => sum + point.currentProfit!, 0) : null;
  const priorTotal = complete ? points.reduce((sum, point) => sum + point.priorProfit!, 0) : null;
  const absoluteChange = currentTotal !== null && priorTotal !== null ? currentTotal - priorTotal : null;
  const percentageChange = absoluteChange !== null && priorTotal !== null && priorTotal !== 0
    ? (absoluteChange / Math.abs(priorTotal)) * 100
    : null;

  return {
    currentPeriods,
    priorPeriods,
    points,
    currentTotal,
    priorTotal,
    absoluteChange,
    percentageChange,
    complete,
  };
}

export { formatCurrencyCompact, formatCurrencyExact };

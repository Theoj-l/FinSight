import { Prisma } from "@prisma/client";
import type { Change, KpiData, KpiMetric } from "./kpi-presentation";

// Keep database decimal precision through every sum; round only for display.
const Decimal = Prisma.Decimal.clone({ precision: 40 });
type Amount = string | number | { toString(): string };
export type KpiBalance = { period_no: number; home_dr: Amount; home_cr: Amount; gl_mast: { acc_type: string } };
export type KpiBudget = { period_no: number; amount: Amount; gl_mast: { acc_type: string } };
type Total = ReturnType<typeof totals>;
const zero = () => new Decimal(0);
function totals(rows: KpiBalance[], period: number) {
  const sums = { RE: zero(), OI: zero(), CS: zero(), EX: zero() };
  for (const row of rows) {
    const type = row.gl_mast.acc_type;
    if (row.period_no !== period || !(type in sums)) continue;
    const key = type as keyof typeof sums;
    const movement = new Decimal(row.home_cr.toString()).minus(row.home_dr.toString());
    sums[key] = sums[key].plus(movement);
  }
  const revenue = sums.RE;
  const grossProfit = revenue.plus(sums.CS);
  const netProfit = grossProfit.plus(sums.OI).plus(sums.EX);
  return { revenue, grossProfit, netProfit,
    grossMargin: revenue.isZero() ? null : grossProfit.div(revenue).times(100),
    netMargin: revenue.isZero() ? null : netProfit.div(revenue).times(100) };
}
export function previousPeriod(period: number) {
  if (!Number.isInteger(period) || period < 100001 || period % 100 < 1 || period % 100 > 12) throw new Error("Invalid monthly period");
  return period % 100 === 1 ? (Math.floor(period / 100) - 1) * 100 + 12 : period - 1;
}
function fixed(value: Prisma.Decimal) {
  const rounded = value.toDecimalPlaces(2);
  return rounded.isZero() ? "0.00" : rounded.toFixed(2);
}
export function compare(current: Prisma.Decimal | null, prior: Prisma.Decimal | null): Change | null {
  if (current === null || prior === null) return null;
  const delta = current.minus(prior);
  return { absolute: fixed(delta), direction: delta.isZero() ? 0 : delta.isPositive() ? 1 : -1,
    percentage: prior.isZero() ? (delta.isZero() ? 0 : null) : delta.div(prior.abs()).times(100).toNumber() };
}
export function aggregateKpis(actual: KpiBalance[], budgets: KpiBudget[], period: number): KpiData {
  const priorPeriod = previousPeriod(period);
  const current = actual.some(row => row.period_no === period) ? totals(actual, period) : null;
  const prior = actual.some(row => row.period_no === priorPeriod) ? totals(actual, priorPeriod) : null;
  const budgetBalances = budgets.map(row => ({ ...row, home_dr: row.amount, home_cr: "0" }));
  const budget = budgets.some(row => row.period_no === period) ? totals(budgetBalances, period) : null;
  const priorBudget = budgets.some(row => row.period_no === priorPeriod) ? totals(budgetBalances, priorPeriod) : null;
  const definitions: Array<[keyof Total, string, string]> = [
    ["revenue", "Revenue", "Operating revenue · credits less debits (RE)."],
    ["grossProfit", "Gross profit", "Operating revenue less cost of sales (RE − CS)."],
    ["netProfit", "Net profit", "Revenue − cost of sales + other income − expenses (RE − CS + OI − EX). Tax is included only if posted to EX."],
    ["grossMargin", "Gross margin", "Gross profit ÷ operating revenue × 100."],
    ["netMargin", "Net margin", "Net profit ÷ operating revenue × 100."],
  ];
  const metrics: KpiMetric[] = definitions.map(([id, label, description]) => {
    const value = current?.[id] ?? null;
    const previous = prior?.[id] ?? null;
    return { id, label, description, unit: id.endsWith("Margin") ? "ratio" : "money", value: value === null ? null : fixed(value), prior: previous === null ? null : fixed(previous), change: compare(value, previous) };
  });
  const variance = current && budget ? current.netProfit.minus(budget.netProfit) : null;
  const priorVariance = prior && priorBudget ? prior.netProfit.minus(priorBudget.netProfit) : null;
  metrics.splice(3, 0, { id: "budgetVariance", label: "Budget variance", unit: "money",
    description: "Actual net profit less budgeted net profit. Positive means above plan. Attention limits apply to variance as a percentage of absolute budgeted net profit.",
    value: variance === null ? null : fixed(variance), prior: priorVariance === null ? null : fixed(priorVariance),
    change: compare(variance, priorVariance), budgetComparison: compare(current?.netProfit ?? null, budget?.netProfit ?? null) });
  const notices: string[] = [];
  if (!current) notices.push("No PBalance data for this period.");
  if (!prior) notices.push("Prior-month PBalance data is unavailable; comparisons are not shown as zero.");
  if (!budget) notices.push("A unique budget is unavailable for this period; budget variance cannot be calculated.");
  if (!priorBudget) notices.push("Prior-month budget is unavailable; the budget variance comparison cannot be calculated.");
  const label = (p: number) => `${Math.floor(p / 100)}-${String(p % 100).padStart(2, "0")}`;
  return { period: label(period), priorPeriod: label(priorPeriod), metrics, notices };
}

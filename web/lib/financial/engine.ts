import { Prisma } from "@prisma/client";
import {
  METRICS,
  type Comparison,
  type Components,
  type Metric,
  type Rules,
  type Values,
} from "./types";
const Decimal = Prisma.Decimal.clone({ precision: 40 });
export const emptyValues = (): Values =>
  Object.fromEntries(Object.keys(METRICS).map((k) => [k, null])) as Values;
export function valuesFrom(c: Components): Values {
  const v = emptyValues();
  const calculate = (
    keys: (keyof Components)[],
    operation: (...v: Prisma.Decimal[]) => Prisma.Decimal | null,
  ) => {
    if (keys.some((k) => c[k] === null)) return null;
    const result = operation(...keys.map((k) => new Decimal(c[k]!)));
    return result === null ? null : result.toFixed(4);
  };
  v.revenue = c.RE;
  v.costOfSales = c.CS;
  v.operatingExpenses = c.EX;
  v.otherIncome = c.OI;
  v.grossProfit = calculate(["RE", "CS"], (re, cs) => re.minus(cs));
  v.netProfit = calculate(["RE", "CS", "OI", "EX"], (re, cs, oi, ex) =>
    re.minus(cs).plus(oi).minus(ex),
  );
  v.totalRevenue = calculate(["RE", "OI"], (re, oi) => re.plus(oi));
  v.grossMargin = calculate(["RE", "CS"], (re, cs) =>
    re.lessThanOrEqualTo(0) ? null : re.minus(cs).div(re).times(100),
  );
  v.netMargin = calculate(["RE", "CS", "OI", "EX"], (re, cs, oi, ex) =>
    re.isZero() ? null : re.minus(cs).plus(oi).minus(ex).div(re).times(100),
  );
  v.expenseRatio = calculate(["RE", "EX"], (re, ex) =>
    re.isZero() ? null : ex.div(re).times(100),
  );
  return v;
}
export function sumComplete(values: (string | null)[]): string | null {
  if (!values.length || values.some((v) => v === null)) return null;
  return values.reduce((s, v) => s.plus(v!), new Decimal(0)).toFixed(4);
}
export function compareValue(
  metric: Metric,
  actual: string | null,
  reference: string | null,
  rule: Rules[Metric],
  note?: string,
): Comparison {
  const base = {
    actual,
    reference,
    absolute: null,
    percentage: null,
    unfavorable: false,
    breach: false,
    tolerance: rule.tolerance,
    enabled: rule.enabled,
    note,
  };
  if (actual === null || reference === null) return base;
  const a = new Decimal(actual),
    r = new Decimal(reference),
    delta = a.minus(r);
  const pct = r.isZero()
    ? delta.isZero()
      ? new Decimal(0)
      : null
    : delta.div(r.abs()).times(100);
  const unfavorable =
    !delta.isZero() &&
    (METRICS[metric].higher ? delta.isNegative() : delta.isPositive());
  // Compare decimals before converting percentages for presentation.
  const breach =
    rule.enabled &&
    unfavorable &&
    pct !== null &&
    pct.abs().greaterThan(rule.tolerance);
  return {
    ...base,
    absolute: delta.toFixed(4),
    percentage: pct?.toNumber() ?? null,
    unfavorable,
    breach,
  };
}
export function compareValues(
  actual: Values,
  reference: Values,
  rules: Rules,
  note?: string,
) {
  return Object.fromEntries(
    (Object.keys(METRICS) as Metric[]).map((metric) => [
      metric,
      compareValue(
        metric,
        actual[metric],
        reference[metric],
        rules[metric],
        note,
      ),
    ]),
  ) as Record<Metric, Comparison>;
}
export function validRules(value: unknown): value is Rules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    Object.keys(obj).length === Object.keys(METRICS).length &&
    Object.keys(METRICS).every((k) => {
      const rule = obj[k] as Rules[Metric] | undefined;
      return (
        !!rule &&
        typeof rule.enabled === "boolean" &&
        typeof rule.tolerance === "number" &&
        Number.isFinite(rule.tolerance) &&
        rule.tolerance >= 0 &&
        rule.tolerance <= 1000000
      );
    })
  );
}

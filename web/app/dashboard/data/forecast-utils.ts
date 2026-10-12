// Pure helpers for the forecast data layer (forecast.ts). No database access,
// so every rule here is unit-tested in test/forecast-utils.test.ts.
//
// ml-service stores forecasts per department (forecast_value). A selection of
// units is the sum of its departments, exactly like the dashboard sums actuals,
// so these helpers work on rows that are already summed across departments.

export type ForecastMetric = "revenue" | "cost" | "profit";

export const FORECAST_METRICS: ForecastMetric[] = ["revenue", "cost", "profit"];

export const FORECAST_METRIC_LABEL: Record<ForecastMetric, string> = {
  revenue: "Revenue",
  cost: "Cost",
  profit: "Net profit",
};

export const FORECAST_METRIC_DESCRIPTION: Record<ForecastMetric, string> = {
  revenue: "Operating revenue (RE), credits less debits.",
  cost: "Cost of sales plus operating expenses (CS + EX).",
  profit: "Revenue − cost + other income (RE − CS − EX + OI). Derived from the revenue and cost forecasts.",
};

/** US3.5: 1-month-ahead MAPE must be at most this for a forecast to count as reliable. */
export const DEFAULT_TARGET_MAPE = 15;
/** Accuracy is measured on 1-month-ahead forecasts over this many closed months. */
export const ACCURACY_MONTHS = 12;
/** The band is the 10th–90th percentile of past forecast errors at the same horizon. */
export const BAND_QUANTILES: [number, number] = [0.1, 0.9];

/** mape ≤ target, ignoring floating-point noise (10% and 20% average to 15.000000000000002%). */
export function meetsTarget(mape: number | null, targetMape: number): boolean | null {
  return mape === null ? null : mape <= targetMape + 1e-9;
}

/** forecast_value rows summed across the selected departments. */
export type ForecastRow = {
  kind: string;
  metric: string;
  origin: number;
  period_no: number;
  horizon: number;
  yhat: number;
  actual: number | null;
};

export type ForecastPoint = {
  periodNo: number;
  /** Months ahead of the last closed month (1 = next month). */
  horizon: number;
  value: number;
  /** 80% band from past errors at this horizon; null when there is no backtest yet. */
  low: number | null;
  high: number | null;
};

export type HistoryPoint = { periodNo: number; actual: number };

/** A past month's 1-month-ahead forecast next to what actually happened. */
export type PastForecastPoint = { periodNo: number; forecast: number; actual: number };

export type ForecastAccuracy = {
  /** Closed months the figures cover (1-month-ahead forecasts). */
  months: number;
  /** Mean absolute percentage error, percent. Null when every actual is zero. */
  mape: number | null;
  /** Total absolute error / total absolute actual, percent. Not inflated by near-zero months. */
  wape: number | null;
  /** Mean absolute error, S$. */
  mae: number | null;
  targetMape: number;
  /** mape ≤ targetMape. Null when there is no backtest to judge. */
  meetsTarget: boolean | null;
};

export type ForecastSeries = {
  metric: ForecastMetric;
  label: string;
  description: string;
  history: HistoryPoint[];
  pastForecasts: PastForecastPoint[];
  forecast: ForecastPoint[];
  accuracy: ForecastAccuracy;
};

/** Monthly movement per account type (credit − debit), for the actuals. */
export type BalanceRow = { period_no: number; acc_type: string; net_cr: number };

export function addMonths(period: number, months: number): number {
  const index = Math.floor(period / 100) * 12 + (period % 100) - 1 + months;
  return Math.floor(index / 12) * 100 + (index % 12) + 1;
}

/** Linear-interpolation quantile (numpy's default), so it matches ml-service. */
export function quantile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Actuals per month: revenue = RE, cost = CS + EX, profit = RE + OI − CS − EX. */
export function historyFromBalances(rows: BalanceRow[]): Record<ForecastMetric, HistoryPoint[]> {
  const months = new Map<number, Record<ForecastMetric, number>>();
  for (const row of rows) {
    const month = months.get(row.period_no) ?? { revenue: 0, cost: 0, profit: 0 };
    const value = Number(row.net_cr);
    if (row.acc_type === "RE") month.revenue += value;
    if (row.acc_type === "CS" || row.acc_type === "EX") month.cost -= value;
    if (["RE", "CS", "EX", "OI"].includes(row.acc_type)) month.profit += value;
    months.set(row.period_no, month);
  }
  const periods = [...months.keys()].sort((a, b) => a - b);
  return Object.fromEntries(FORECAST_METRICS.map(metric => [
    metric, periods.map(periodNo => ({ periodNo, actual: months.get(periodNo)![metric] })),
  ])) as Record<ForecastMetric, HistoryPoint[]>;
}

/** Relative errors (actual − forecast) / |forecast| of past forecasts at one horizon. */
export function relativeErrors(backtest: ForecastRow[], horizon: number): number[] {
  return backtest
    .filter(row => row.horizon === horizon && row.actual !== null && row.yhat !== 0)
    .map(row => (row.actual! - row.yhat) / Math.abs(row.yhat));
}

export function band(value: number, errors: number[]): { low: number | null; high: number | null } {
  const low = quantile(errors, BAND_QUANTILES[0]);
  const high = quantile(errors, BAND_QUANTILES[1]);
  if (low === null || high === null) return { low: null, high: null };
  return { low: value + Math.abs(value) * low, high: value + Math.abs(value) * high };
}

/** Accuracy of 1-month-ahead forecasts over the last ACCURACY_MONTHS closed months. */
export function accuracy(backtest: ForecastRow[], historyThrough: number, targetMape = DEFAULT_TARGET_MAPE): ForecastAccuracy {
  const since = addMonths(historyThrough, -ACCURACY_MONTHS);
  const rows = backtest.filter(row => row.horizon === 1 && row.actual !== null && row.period_no > since && row.period_no <= historyThrough);
  const errors = rows.map(row => Math.abs(row.actual! - row.yhat));
  const nonzero = rows.filter(row => row.actual !== 0);
  const totalActual = rows.reduce((sum, row) => sum + Math.abs(row.actual!), 0);
  const mape = nonzero.length ? nonzero.reduce((sum, row) => sum + Math.abs(row.actual! - row.yhat) / Math.abs(row.actual!), 0) / nonzero.length * 100 : null;
  return {
    months: rows.length,
    mape,
    wape: totalActual > 0 ? errors.reduce((a, b) => a + b, 0) / totalActual * 100 : null,
    mae: rows.length ? errors.reduce((a, b) => a + b, 0) / rows.length : null,
    targetMape,
    meetsTarget: meetsTarget(mape, targetMape),
  };
}

/** One metric's chart data: actuals, past 1-month-ahead forecasts, the forecast with its band, and accuracy. */
export function buildSeries(
  metric: ForecastMetric,
  rows: ForecastRow[],
  history: HistoryPoint[],
  historyThrough: number,
  targetMape = DEFAULT_TARGET_MAPE,
): ForecastSeries {
  const own = rows.filter(row => row.metric === metric);
  const backtest = own.filter(row => row.kind === "backtest");
  const firstShown = history[0]?.periodNo ?? historyThrough;
  return {
    metric,
    label: FORECAST_METRIC_LABEL[metric],
    description: FORECAST_METRIC_DESCRIPTION[metric],
    history,
    pastForecasts: backtest
      .filter(row => row.horizon === 1 && row.actual !== null && row.period_no >= firstShown)
      .sort((a, b) => a.period_no - b.period_no)
      .map(row => ({ periodNo: row.period_no, forecast: row.yhat, actual: row.actual! })),
    forecast: own
      .filter(row => row.kind === "forecast" && row.origin === historyThrough)
      .sort((a, b) => a.horizon - b.horizon)
      .map(row => ({ periodNo: row.period_no, horizon: row.horizon, value: row.yhat, ...band(row.yhat, relativeErrors(backtest, row.horizon)) })),
    accuracy: accuracy(backtest, historyThrough, targetMape),
  };
}

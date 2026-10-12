import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ledgerDepartment, type DashboardScope } from "./dashboard-scope";
import {
  addMonths, buildSeries, DEFAULT_TARGET_MAPE, FORECAST_METRICS, historyFromBalances,
  type BalanceRow, type ForecastMetric, type ForecastRow, type ForecastSeries,
} from "./forecast-utils";

export type { ForecastAccuracy, ForecastMetric, ForecastPoint, ForecastSeries, HistoryPoint, PastForecastPoint } from "./forecast-utils";
export { FORECAST_METRIC_LABEL, FORECAST_METRICS } from "./forecast-utils";

export type ForecastStatus = {
  runId: string;
  /** When the stored forecast was produced. */
  forecastAt: string;
  /** Last closed month the forecast was made from (YYYYMM). Forecasts start the month after. */
  historyThrough: number;
  /** Latest month in the ledger when the run started. */
  dataThrough: number | null;
  /** Months forecast ahead. */
  horizon: number;
  modelVersion: string;
  /** Method that forecasts revenue and cost, e.g. "holt_winters". */
  method: string | null;
  targetMape: number;
};

export type ForecastData = {
  status: ForecastStatus;
  /** The dept_no values summed; empty means all units. */
  units: string[];
  series: Record<ForecastMetric, ForecastSeries>;
};

export type ForecastOptions = {
  /** Months of actuals before the forecast when the scope is a single month. Default 24. */
  historyMonths?: number;
};

type RunRow = {
  run_id: bigint;
  started_at: Date;
  finished_at: Date | null;
  data_through: number | null;
  history_through: number | null;
  horizon: number | null;
  model_version: string;
  summary: Prisma.JsonValue;
};

function toStatus(run: RunRow & { history_through: number }): ForecastStatus {
  const summary = (run.summary ?? {}) as { target_mape?: number; specs?: { revenue?: { method?: string } } };
  return {
    runId: run.run_id.toString(),
    forecastAt: (run.finished_at ?? run.started_at).toISOString(),
    historyThrough: run.history_through,
    dataThrough: run.data_through,
    horizon: run.horizon ?? 12,
    modelVersion: run.model_version,
    method: summary.specs?.revenue?.method ?? null,
    targetMape: summary.target_mape ?? DEFAULT_TARGET_MAPE,
  };
}

async function latestRun() {
  return prisma.forecast_run.findFirst({ where: { status: "ok", history_through: { not: null } }, orderBy: { run_id: "desc" } });
}

/** The latest successful forecast run: how fresh the forecast is. Null before the first run. */
export async function getForecastStatus(): Promise<ForecastStatus | null> {
  const run = await latestRun();
  return run && run.history_through !== null ? toStatus({ ...run, history_through: run.history_through }) : null;
}

/**
 * Revenue, cost and net-profit forecasts for the dashboard's unit selection,
 * with the actuals before them, past 1-month-ahead forecasts next to their
 * actuals, an 80% band, and the selection's own accuracy against the 15% MAPE
 * target. Reads forecast_run / forecast_value (written monthly by ml-service);
 * it never calls the model.
 *
 * A selection of several units is the sum of their forecasts. A branch
 * selection throws BRANCH_LEDGER_MESSAGE, like every other ledger panel.
 */
export async function getForecast(scope: DashboardScope = {}, options: ForecastOptions = {}): Promise<ForecastData | null> {
  const department = ledgerDepartment(scope);
  const run = await latestRun();
  if (!run || run.history_through === null) return null;
  const status = toStatus({ ...run, history_through: run.history_through });
  const through = status.historyThrough;

  // A period range on the dashboard sets where the actuals start; a single month shows the trailing window.
  const ranged = scope.periodStart !== undefined && scope.periodEnd !== undefined && scope.periodStart !== scope.periodEnd;
  const from = ranged ? Math.min(scope.periodStart!, through) : addMonths(through, -((options.historyMonths ?? 24) - 1));

  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND p.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const [values, balances] = await Promise.all([
    prisma.forecast_value.groupBy({
      by: ["kind", "metric", "origin", "period_no", "horizon"],
      where: { run_id: run.run_id, ...department },
      _sum: { yhat: true, actual: true },
    }),
    prisma.$queryRaw<BalanceRow[]>(Prisma.sql`
      SELECT p.period_no, g.acc_type, SUM(p.home_cr - p.home_dr)::double precision AS net_cr
      FROM pbalance p
      INNER JOIN gl_mast g ON g.acc_no = p.acc_no
      WHERE g.acc_type IN ('RE', 'CS', 'EX', 'OI')
        AND p.period_no BETWEEN ${from} AND ${through}
        ${departmentSql}
      GROUP BY p.period_no, g.acc_type
    `),
  ]);

  const rows: ForecastRow[] = values.map(row => ({
    kind: row.kind, metric: row.metric, origin: row.origin, period_no: row.period_no, horizon: row.horizon,
    yhat: row._sum.yhat ?? 0, actual: row._sum.actual,
  }));
  const history = historyFromBalances(balances);
  return {
    status,
    units: scope.departmentIds ?? [],
    series: Object.fromEntries(FORECAST_METRICS.map(metric => [
      metric, buildSeries(metric, rows, history[metric], through, status.targetMape),
    ])) as Record<ForecastMetric, ForecastSeries>,
  };
}

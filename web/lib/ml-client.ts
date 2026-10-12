/**
 * Thin typed client for the Python ML service (FastAPI).
 *
 * The web app never talks to models directly — it calls this service over
 * HTTP on an internal URL, authenticating with a shared secret header.
 * Use it only from server code (route handlers, server actions, RSC).
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN ?? "";

export class MlServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MlServiceError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const res = await fetch(`${ML_SERVICE_URL}${path}`, {
    method,
    signal,
    headers: {
      "content-type": "application/json",
      "x-ml-service-token": ML_SERVICE_TOKEN,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new MlServiceError(
      `ML service ${method} ${path} failed: ${detail}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

export type MlHealth = {
  status: string;
  service: string;
};

/** Result of one anomaly scoring run (mirrors ml-service RescoreResult). */
export type AnomalyRescoreResult = {
  run_id: number;
  model_version: string;
  /** Latest period_no (YYYYMM) in the ledger. */
  data_through: number;
  /** Latest closed period_no scored; later months are provisional. */
  scored_through: number;
  n_alerts: number;
  /** Alerts raised for the first time by this run. */
  n_new: number;
  seconds: number;
};

/** Result of one forecast run (mirrors ml-service ForecastRunResult). */
export type ForecastRunResult = {
  run_id: number;
  model_version: string;
  /** Latest period_no (YYYYMM) in the ledger. */
  data_through: number;
  /** Last closed month forecast from; forecasts start the month after. */
  history_through: number;
  horizon: number;
  n_forecast: number;
  n_backtest: number;
  /** Company-level 1-month-ahead MAPE (%) over the last 12 closed months, per metric. */
  accuracy: Record<"revenue" | "cost" | "profit", number | null>;
  seconds: number;
};

export const mlClient = {
  health: (signal?: AbortSignal) => request<MlHealth>("/health", { signal }),

  /**
   * Re-forecast the ledger and store a new forecast_run (about 10–20 s).
   * The monthly cron does this already; call it after the ledger changes.
   * Dashboards read the tables instead, via app/dashboard/data/forecast.ts.
   * A run already in progress gives a 409.
   */
  runForecast: (signal?: AbortSignal) =>
    request<ForecastRunResult>("/forecast/run", { method: "POST", signal }),

  /**
   * Re-score the ledger and refresh the anomaly_alert table (about 5 s).
   * Call after the ledger changes. Dashboards read the table instead, via
   * app/dashboard/data/anomalies.ts. A run already in progress gives a 409.
   */
  rescoreAnomalies: (signal?: AbortSignal) =>
    request<AnomalyRescoreResult>("/anomalies/rescore", { method: "POST", signal }),
};

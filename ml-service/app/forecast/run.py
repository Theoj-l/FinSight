"""Forecast the live ledger and store the result in Postgres.

    python -m app.forecast.run        # run from ml-service/; what the monthly cron runs
    POST /forecast/run                # the same run over HTTP (app/routers/forecast.py)

One run reads monthly P&L per department from pbalance, keeps closed months
only, and with the selected model (models/forecast/<version>/config.json):

  * forecasts the `horizon` months after the last closed month, and
  * replays the last `backtest_origins` months as a rolling backtest (each month
    forecast from the data before it), so the dashboard can show how accurate
    the forecast has been on this ledger and draw the band around it.

From model v2, months the anomaly model flagged (the `anomaly_alert` table) are
left out of every fit, so a one-off event does not distort the forecasts after
it. Run anomaly scoring before forecasting; if it has never run, nothing is
masked and the run says so in its summary.

Both go to `forecast_value` under a new `forecast_run`. Earlier runs are kept,
so past forecasts can be audited against what happened.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pandas as pd
import psycopg
from psycopg.types.json import Jsonb

from app.config import Settings, get_settings
from app.periods import add_months, closed_through, periods_between

from . import anomaly_mask as AM
from . import engine as E
from . import metrics as M
from . import series as S
from .anomaly_mask import Mask
from .model import ForecastModel

TZ = ZoneInfo("Asia/Singapore")
LOCK_ID = 4_721_002     # Postgres advisory-lock id: one forecast run at a time (anomaly uses 4_721_001)
ACCURACY_MONTHS = 12    # summary accuracy: 1-month-ahead forecasts over the last 12 closed months
MIN_HISTORY = 12        # a backtest origin needs at least a year of history behind it

COPY_COLUMNS = ["run_id", "kind", "dept_no", "metric", "origin", "period_no", "horizon", "yhat", "actual",
                "method"]


class AlreadyRunning(RuntimeError):
    pass


@dataclass
class RunSummary:
    run_id: int
    model_version: str
    data_through: int
    history_through: int
    horizon: int
    n_forecast: int
    n_backtest: int
    accuracy: dict[str, float | None]     # company-level 1-month-ahead MAPE per metric
    seconds: float


@dataclass
class Result:
    forecast: pd.DataFrame
    backtest: pd.DataFrame
    data_through: int
    history_through: int
    summary: dict


def model_dir(settings: Settings) -> str:
    return os.path.join(settings.models_dir, "forecast", settings.forecast_model_version)


def load_model(path: str) -> ForecastModel:
    return ForecastModel.load(path)


def forecast_ledger(model: ForecastModel, pl: pd.DataFrame, today: date, n_jobs: int = 1,
                    mask: Mask | None = None) -> Result:
    """Everything a run computes, without touching the database. `mask` is used
    only if the model asks for it (v2+)."""
    mask = mask if model.anomaly_mask else None
    data_through = int(pl["period_no"].max())
    through = closed_through(data_through, today)
    pl = S.truncate(pl, through)
    if pl.empty:
        raise ValueError(f"no closed month to forecast from (ledger ends {data_through})")
    first = int(pl["period_no"].min())

    fc = E.forecast_from(pl, model.specs, [through], model.horizon, n_jobs, mask)

    start = max(add_months(through, -model.backtest_origins), add_months(first, MIN_HISTORY - 1))
    origins = periods_between(start, add_months(through, -1)) if start < through else []
    bt = E.forecast_from(pl, model.specs, origins, model.horizon, n_jobs, mask) if origins else fc.iloc[0:0]
    bt = E.attach_actuals(bt, pl)
    bt = bt[bt["period_no"] <= through].reset_index(drop=True)

    return Result(forecast=fc, backtest=bt, data_through=data_through, history_through=through,
                  summary=summarize(model, bt, through, mask))


def summarize(model: ForecastModel, bt: pd.DataFrame, through: int, mask: Mask | None = None) -> dict:
    """Company-level accuracy of 1-month-ahead forecasts over the last 12 closed months."""
    target = float(model.meta.get("target_mape", M.TARGET_MAPE))
    recent = bt[(bt["horizon"] == 1) & (bt["period_no"] > add_months(through, -ACCURACY_MONTHS))]
    accuracy = {}
    if not recent.empty:
        co = E.to_company(recent)
        for metric, g in co.groupby("metric"):
            s = M.scores(g["actual"], g["yhat"])
            accuracy[metric] = {**s, "months": s["n"], "meets_target": M.meets_target(s["mape"], target)}
    return dict(
        candidate=model.meta.get("selected", {}).get("candidate"),
        specs={m: {"method": s.method, "params": s.params} for m, s in model.specs.items()},
        target_mape=target, accuracy=accuracy,
        backtest=dict(first_origin=int(bt["origin"].min()) if not bt.empty else None,
                      last_origin=int(bt["origin"].max()) if not bt.empty else None),
        anomaly_mask=dict(enabled=model.anomaly_mask, cells=len(mask or ()),
                          masked=AM.describe(mask) if mask else []),
    )


def run(database_url: str, model: ForecastModel, triggered_by: str, today: date | None = None,
        n_jobs: int | None = None) -> RunSummary:
    today = today or datetime.now(TZ).date()
    n_jobs = n_jobs or get_settings().forecast_jobs
    t0 = time.monotonic()
    with psycopg.connect(database_url, autocommit=True) as conn:
        # A session-level lock, so DATABASE_URL must be the session pooler (port 5432).
        if not conn.execute("select pg_try_advisory_lock(%s)", (LOCK_ID,)).fetchone()[0]:  # type: ignore[index]
            raise AlreadyRunning("a forecast run is already in progress")
        try:
            run_id = conn.execute(
                "insert into forecast_run (triggered_by, model_version) values (%s, %s) returning run_id",
                (triggered_by, model.version)).fetchone()[0]  # type: ignore[index]
            try:
                mask = AM.from_postgres(conn) if model.anomaly_mask else None
                res = forecast_ledger(model, S.from_postgres(conn), today, n_jobs, mask)
                with conn.transaction():
                    _copy_values(conn, run_id, res)
                    conn.execute(
                        "update forecast_run set status = 'ok', finished_at = now(), data_through = %s, "
                        "history_through = %s, horizon = %s, n_series = %s, summary = %s where run_id = %s",
                        (res.data_through, res.history_through, model.horizon,
                         res.forecast[["dept_no", "metric"]].drop_duplicates().shape[0],
                         Jsonb(res.summary), run_id))
            except Exception as e:
                conn.execute("update forecast_run set status = 'failed', finished_at = now(), error = %s "
                             "where run_id = %s", (f"{type(e).__name__}: {e}"[:2000], run_id))
                raise
        finally:
            conn.execute("select pg_advisory_unlock(%s)", (LOCK_ID,))
    return RunSummary(run_id=run_id, model_version=model.version, data_through=res.data_through,
                      history_through=res.history_through, horizon=model.horizon,
                      n_forecast=len(res.forecast), n_backtest=len(res.backtest),
                      accuracy={m: a["mape"] for m, a in res.summary["accuracy"].items()},
                      seconds=round(time.monotonic() - t0, 1))


def _copy_values(conn: psycopg.Connection, run_id: int, res: Result) -> None:
    frames = [res.forecast.assign(kind="forecast", actual=None), res.backtest.assign(kind="backtest")]
    with conn.cursor() as cur, cur.copy(f"copy forecast_value ({', '.join(COPY_COLUMNS)}) from stdin") as cp:
        for df in frames:
            for r in df.itertuples(index=False):
                cp.write_row((run_id, r.kind, r.dept_no, r.metric, int(r.origin), int(r.period_no),
                              int(r.horizon), float(r.yhat), None if pd.isna(r.actual) else float(r.actual),
                              r.method))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.forecast.run",
                                 description="Forecast the ledger in DATABASE_URL into forecast_value.")
    ap.parse_args(argv)
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set (ml-service/.env)")
        return 2
    try:
        model = load_model(model_dir(settings))
        s = run(settings.database_url, model, triggered_by="cli")
    except (FileNotFoundError, AlreadyRunning) as e:
        print(e)
        return 2
    acc = ", ".join(f"{m} {v:.1f}%" for m, v in s.accuracy.items() if v is not None) or "no backtest yet"
    print(f"run {s.run_id}: forecast {s.horizon} months after {s.history_through} "
          f"({s.n_forecast} values, {s.n_backtest} backtest), model {s.model_version}, "
          f"1-month-ahead MAPE over the last year: {acc}, {s.seconds}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())

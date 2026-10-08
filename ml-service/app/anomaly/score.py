"""Score the live ledger and store the alerts in Postgres.

    python -m app.anomaly.score       # run from ml-service/; what a nightly cron runs
    POST /anomalies/rescore           # the same run over HTTP (app/routers/anomalies.py)

One run reads the ledger, scores every closed month with the combiner, then
replaces the contents of `anomaly_alert` and records itself in `anomaly_run`.
The dashboard reads those two tables and never calls the model.
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

from . import loaders
from .loaders import Books
from .model import MODEL_FILE, AnomalyModel

TZ = ZoneInfo("Asia/Singapore")
LOCK_ID = 4_721_001     # Postgres advisory-lock id: one scoring run at a time

UPSERT = """
insert into anomaly_alert (unit_kind, unit_key, period_no, score, reasons, model_version, run_id)
values (%s, %s, %s, %s, %s, %s, %s)
on conflict (unit_kind, unit_key, period_no) do update
set score = excluded.score, reasons = excluded.reasons,
    model_version = excluded.model_version, run_id = excluded.run_id
"""


class AlreadyRunning(RuntimeError):
    pass


@dataclass
class RunSummary:
    run_id: int
    model_version: str
    data_through: int
    scored_through: int
    n_alerts: int
    n_new: int
    seconds: float


def model_dir(settings: Settings) -> str:
    return os.path.join(settings.models_dir, "anomaly", settings.anomaly_model_version)


def load_model(path: str) -> AnomalyModel:
    if not os.path.exists(os.path.join(path, MODEL_FILE)):
        raise FileNotFoundError(f"no anomaly model at {path}: run `python -m training.anomaly.train`")
    return AnomalyModel.load(path)


def closed_through(last_period: int, today: date) -> int:
    """The latest month that has ended. A month still in progress has partial
    totals that look like a sudden drop, so it is never scored."""
    previous = today.year * 100 + today.month - 1 if today.month > 1 else (today.year - 1) * 100 + 12
    return min(last_period, previous)


def score_books(model: AnomalyModel, books: Books, today: date) -> tuple[pd.DataFrame, int]:
    through = closed_through(books.last_period, today)
    if through < books.last_period:
        books = loaders.truncate(books, through)
    scored = model.score_units(model.featurize(books).units)
    return model.alerts(scored), through


def run(database_url: str, model: AnomalyModel, triggered_by: str, today: date | None = None) -> RunSummary:
    today = today or datetime.now(TZ).date()
    version = str(model.meta.get("model_version", "unknown"))
    t0 = time.monotonic()
    with psycopg.connect(database_url, autocommit=True) as conn:
        # A session-level lock, so DATABASE_URL must be the session pooler (port 5432).
        if not conn.execute("select pg_try_advisory_lock(%s)", (LOCK_ID,)).fetchone()[0]:  # type: ignore[index]
            raise AlreadyRunning("an anomaly scoring run is already in progress")
        try:
            run_id = conn.execute(
                "insert into anomaly_run (triggered_by, model_version) values (%s, %s) returning run_id",
                (triggered_by, version)).fetchone()[0]  # type: ignore[index]
            try:
                books = loaders.from_postgres(conn)
                alerts, through = score_books(model, books, today)
                with conn.transaction():
                    n_new = _replace_alerts(conn, alerts, run_id, version)
                    conn.execute(
                        "update anomaly_run set status = 'ok', finished_at = now(), data_through = %s, "
                        "scored_through = %s, n_alerts = %s, n_new = %s where run_id = %s",
                        (books.last_period, through, len(alerts), n_new, run_id))
            except Exception as e:
                conn.execute("update anomaly_run set status = 'failed', finished_at = now(), error = %s "
                             "where run_id = %s", (f"{type(e).__name__}: {e}"[:2000], run_id))
                raise
        finally:
            conn.execute("select pg_advisory_unlock(%s)", (LOCK_ID,))
    return RunSummary(run_id=run_id, model_version=version, data_through=books.last_period,
                      scored_through=through, n_alerts=len(alerts), n_new=n_new,
                      seconds=round(time.monotonic() - t0, 1))


def _replace_alerts(conn: psycopg.Connection, alerts: pd.DataFrame, run_id: int, version: str) -> int:
    """Upsert this run's alerts, drop the ones it no longer raises, and return
    how many are new. Upserting keeps first_flagged_at for repeat alerts."""
    existing = {tuple(r) for r in conn.execute("select unit_kind, unit_key, period_no from anomaly_alert")}
    rows = [(a.kind, str(a.key), int(a.period_no), float(a.score), Jsonb(list(a.reasons)), version, run_id)
            for a in alerts.itertuples(index=False)]
    with conn.cursor() as cur:
        cur.executemany(UPSERT, rows)
    conn.execute("delete from anomaly_alert where run_id <> %s", (run_id,))
    return sum(r[:3] not in existing for r in rows)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.anomaly.score",
                                 description="Score the ledger in DATABASE_URL and refresh anomaly_alert.")
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
    print(f"run {s.run_id}: {s.n_alerts} alerts ({s.n_new} new), scored through {s.scored_through}, "
          f"model {s.model_version}, {s.seconds}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())

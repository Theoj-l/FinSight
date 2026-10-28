"""Months to leave out of forecast fits: the cells the anomaly model flagged.

A one-off event (a lost client, a duplicate payment, a revenue posting with no
invoice) distorts every forecast fitted after it: the model learns the dip or
spike as part of the normal pattern. Forecast v2 leaves those months out of the
fit (METHODOLOGY.md §6). The cells come from the anomaly model's alerts:

    dept  a business unit in a month   -> that unit's revenue and cost that month
    acc   a Corporate expense account  -> Corporate (CP) cost that month
    cust  a customer's receivables     -> nothing (no effect on revenue or cost)

Live runs read the stored alerts (`from_postgres`); the benchmark scores each
simulated company with the anomaly model (`from_tables`). Alerts for a month use
only data up to the end of that month, so masking never lets later data in.
"""
from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import psycopg

Mask = frozenset[tuple[str, str, int]]     # (dept_no, metric, period_no)

CORPORATE = "CP"     # anomaly alerts of kind "acc" are always Corporate expense accounts


def from_alerts(alerts: Iterable[tuple[str, str, int]]) -> Mask:
    """(kind, key, period_no) alerts -> masked (dept_no, metric, period_no) cells."""
    cells: set[tuple[str, str, int]] = set()
    for kind, key, period in alerts:
        if kind == "dept":
            cells |= {(str(key), "revenue", int(period)), (str(key), "cost", int(period))}
        elif kind == "acc":
            cells.add((CORPORATE, "cost", int(period)))
    return frozenset(cells)


def from_postgres(conn: psycopg.Connection) -> Mask:
    """From the stored anomaly alerts. Empty if anomaly scoring has never run."""
    with conn.cursor() as cur:
        cur.execute("select to_regclass('public.anomaly_alert') is not null")
        if not cur.fetchone()[0]:  # type: ignore[index]
            return frozenset()
        cur.execute("select unit_kind, unit_key, period_no from anomaly_alert "
                    "where unit_kind in ('dept', 'acc')")
        return from_alerts(cur.fetchall())


def from_tables(tables: dict, model_dir: str) -> Mask:
    """Score a `datagen.pipeline.generate()` ledger with the anomaly model (benchmark use)."""
    from app.anomaly import loaders
    from app.anomaly import score as anomaly_score

    model = _anomaly_model(model_dir)
    alerts, _ = anomaly_score.score_books(model, loaders.from_tables(tables), date(9999, 1, 1))
    return from_alerts(zip(alerts["kind"], alerts["key"], alerts["period_no"], strict=True))


_models: dict = {}


def _anomaly_model(model_dir: str):
    from app.anomaly import score as anomaly_score

    if model_dir not in _models:
        _models[model_dir] = anomaly_score.load_model(model_dir)
    return _models[model_dir]


def describe(mask: Mask) -> list[dict]:
    """The masked cells, for the run summary."""
    cells = sorted(mask, key=lambda c: (c[2], c[0], c[1]))
    return [dict(dept_no=d, metric=m, period_no=p) for d, m, p in cells]

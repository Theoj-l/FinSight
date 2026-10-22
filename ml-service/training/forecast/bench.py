"""The forecasting benchmark: which seeds and months are used for what.

Seed roles are shared with the anomaly model (training/anomaly/bench.py), so
the two models are judged on the same held-out companies:

    validation  seeds 31-40   choose each family's settings and the production model
    test        seeds 41-50   reported results; used once, by evaluate.py
    showcase    20260901      the dataset loaded in Supabase

Train seeds 1-30 are not used: every forecaster is fitted on one company's own
history, so nothing is learned across companies (METHODOLOGY.md §3).

Inside every company history the months are split in time:

    2021-01 .. 2024-08   history only (44 months)
    2024-09 .. 2025-08   validation window
    2025-09 .. 2026-08   test window

A window is scored by rolling origin: for every month t in it, the models see
only months before t (METHODOLOGY.md §4).
"""
from __future__ import annotations

import pandas as pd
from joblib import Parallel, delayed

from app.forecast import engine as E
from app.forecast import series as S
from app.periods import add_months, periods_between
from datagen.pipeline import generate
from training.anomaly.bench import SHOWCASE_SEED, TEST_SEEDS, VAL_SEEDS

__all__ = ["SHOWCASE_SEED", "TEST_SEEDS", "VAL_SEEDS"]

# The live dataset's anomaly regime (A01-A10 over 68 months). Random mode packs
# ~32 anomalies into 56 months for the anomaly benchmark; it is the stress test here.
MODE = "canonical"
STRESS_MODE = "random"

HORIZON = 12
HISTORY_END = 202408
WINDOWS = {"validation": (202409, 202508), "test": (202509, 202608)}


def origins(window: str) -> list[int]:
    """Forecast origins whose 1-month-ahead target falls in the window."""
    start, end = WINDOWS[window]
    return periods_between(add_months(start, -1), add_months(end, -1))


def series(seed: int, mode: str = MODE) -> pd.DataFrame:
    return S.from_tables(generate(seed, anomalies=mode))


def series_many(seeds, mode: str = MODE, jobs: int = -1) -> dict[int, pd.DataFrame]:
    frames = Parallel(n_jobs=jobs)(delayed(series)(s, mode) for s in seeds)
    return dict(zip(seeds, frames, strict=True))


def backtest(pl: pd.DataFrame, specs: dict[str, E.Spec], window: str,
             company_only: bool = False) -> pd.DataFrame:
    """Rolling-origin forecasts scored against actuals, keeping only targets
    inside the window (so a validation run never sees a test month)."""
    if company_only:
        pl = S.company(pl)
    fc = E.attach_actuals(E.forecast_from(pl, specs, origins(window), HORIZON), pl)
    return fc[fc["period_no"] <= WINDOWS[window][1]].reset_index(drop=True)


def backtest_many(tasks: list[tuple[dict, pd.DataFrame, dict[str, E.Spec]]], window: str,
                  jobs: int = -1, company_only: bool = False) -> pd.DataFrame:
    """tasks: (labels, series, specs). The labels become columns of the result."""
    def one(labels, pl, specs):
        return backtest(pl, specs, window, company_only).assign(**labels)
    frames = Parallel(n_jobs=jobs)(delayed(one)(*t) for t in tasks)
    return pd.concat(frames, ignore_index=True)

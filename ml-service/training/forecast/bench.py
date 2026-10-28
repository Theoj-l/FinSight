"""The forecasting benchmark: which seeds and months are used for what.

Seed roles are shared with the anomaly model (training/anomaly/bench.py), so
the two models are judged on the same held-out companies:

    validation  seeds 31-40   choose each family's settings and the production model
    test        seeds 51-60   reported results for v2; used once, by evaluate.py
    showcase    20260901      the dataset loaded in Supabase

v1 was tested on seeds 41-50. Those results had been seen before v2 was
designed, so v2 is reported on fresh companies (51-60) that no model or
decision has touched; 41-50 is kept only to compare v2 with v1 like for like.

Train seeds 1-30 are not used: every forecaster is fitted on one company's own
history, so nothing is learned across companies (METHODOLOGY.md §3).

Inside every company history the months are split in time:

    2021-01 .. 2024-08   history only (44 months)
    2024-09 .. 2025-08   validation window
    2025-09 .. 2026-08   test window

A window is scored by rolling origin: for every month t in it, the models see
only months before t (METHODOLOGY.md §4).

v2 masks anomalous months (METHODOLOGY.md §6): every simulated company is scored
by the anomaly model (models/anomaly/v1) and the flagged cells are left out of
the fits, exactly as the live run does with the stored alerts.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import pandas as pd
from joblib import Parallel, delayed

from app.forecast import anomaly_mask as AM
from app.forecast import engine as E
from app.forecast import series as S
from app.forecast.anomaly_mask import Mask
from app.periods import add_months, periods_between
from datagen.pipeline import generate
from training.anomaly.bench import SHOWCASE_SEED, VAL_SEEDS
from training.anomaly.bench import TEST_SEEDS as V1_TEST_SEEDS

__all__ = ["SHOWCASE_SEED", "TEST_SEEDS", "V1_TEST_SEEDS", "VAL_SEEDS"]

TEST_SEEDS = tuple(range(51, 61))     # fresh companies for v2 (v1 used V1_TEST_SEEDS = 41-50)

ANOMALY_MODEL = os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, "models", "anomaly", "v1")

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


@dataclass
class Company:
    """One simulated company: its monthly series and the cells its anomaly alerts mask."""
    seed: int
    pl: pd.DataFrame
    mask: Mask


def company(seed: int, mode: str = MODE) -> Company:
    tables = generate(seed, anomalies=mode)
    return Company(seed, S.from_tables(tables), AM.from_tables(tables, os.path.abspath(ANOMALY_MODEL)))


def companies(seeds, mode: str = MODE, jobs: int = -1) -> dict[int, Company]:
    out = Parallel(n_jobs=jobs)(delayed(company)(s, mode) for s in seeds)
    return {c.seed: c for c in out}


def series(seed: int, mode: str = MODE) -> pd.DataFrame:
    return S.from_tables(generate(seed, anomalies=mode))


def company_mask(mask: Mask) -> Mask:
    """For a model of the company total: a month is masked if any unit's cell is."""
    return frozenset(("ALL", metric, period) for _, metric, period in mask)


def backtest(pl: pd.DataFrame, specs: dict[str, E.Spec], window: str,
             company_only: bool = False, mask: Mask | None = None) -> pd.DataFrame:
    """Rolling-origin forecasts scored against actuals, keeping only targets
    inside the window (so a validation run never sees a test month)."""
    if company_only:
        pl = S.company(pl)
        mask = company_mask(mask) if mask else None
    fc = E.attach_actuals(E.forecast_from(pl, specs, origins(window), HORIZON, mask=mask), pl)
    return fc[fc["period_no"] <= WINDOWS[window][1]].reset_index(drop=True)


def backtest_many(tasks: list[tuple[dict, pd.DataFrame, dict[str, E.Spec], Mask | None]], window: str,
                  jobs: int = -1, company_only: bool = False) -> pd.DataFrame:
    """tasks: (labels, series, specs, mask). The labels become columns of the result."""
    def one(labels, pl, specs, mask):
        return backtest(pl, specs, window, company_only, mask).assign(**labels)
    frames = Parallel(n_jobs=jobs)(delayed(one)(*t) for t in tasks)
    return pd.concat(frames, ignore_index=True)

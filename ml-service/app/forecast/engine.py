"""Forecasts per department, the derived profit, and the rolling backtest.

One function serves the benchmark (training/forecast) and the live run
(app/forecast/run.py):

    forecast_from(pl, specs, origins, h)

For every origin month it fits each department's series on months up to and
including the origin only, and forecasts the h months after it. A list of
origins is a rolling-origin backtest; a single origin at the last closed
month is the live forecast.

`mask` (forecast v2) is a set of (dept_no, metric, period_no) cells to leave out
of the fits: the months the anomaly model flagged (app/forecast/anomaly_mask.py).
Only cells up to each origin matter, so it never lets later data in.

`n_jobs` fits series in parallel threads. A Prophet fit spends most of its
time waiting on a Stan subprocess, so threads speed up the live run without
the memory cost of extra processes. The result does not depend on n_jobs.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from joblib import Parallel, delayed

from app.periods import add_months

from .anomaly_mask import Mask
from .methods import effective_method, forecast
from .series import BASE

COLUMNS = ["dept_no", "metric", "origin", "horizon", "period_no", "yhat", "method"]
NON_NEGATIVE = ("revenue", "cost")      # a negative revenue or cost forecast is clipped to 0


@dataclass(frozen=True)
class Spec:
    method: str
    params: dict = field(default_factory=dict)

    @property
    def label(self) -> str:
        if not self.params:
            return self.method
        return f"{self.method}({', '.join(f'{k}={v}' for k, v in sorted(self.params.items()))})"


def _one(dept: str, g: pd.DataFrame, metric: str, spec: Spec, origin: int, h: int,
         mask: Mask | None = None) -> list[tuple]:
    hist = g[g["period_no"] <= origin]
    if hist.empty:
        return []
    y = hist[metric].to_numpy(dtype=float)
    if not np.any(y):
        yhat, used = np.zeros(h), "zero"        # nothing ever posted: forecast nothing
    else:
        skip = np.array([(dept, metric, int(p)) in mask for p in hist["period_no"]]) if mask else None
        yhat = forecast(y, h, spec.method, spec.params, int(hist["period_no"].iloc[0]), skip)
        used = effective_method(spec.method, len(y))
    if metric in NON_NEGATIVE:
        yhat = np.maximum(yhat, 0.0)
    return [(dept, metric, origin, k + 1, add_months(origin, k + 1), float(yhat[k]), used) for k in range(h)]


def base_forecasts(pl: pd.DataFrame, metric: str, spec: Spec, origins: list[int], h: int,
                   n_jobs: int = 1, mask: Mask | None = None) -> pd.DataFrame:
    """Forecast one base metric (revenue, cost, other_income) for every department and origin."""
    tasks = [(str(dept), g.sort_values("period_no"), metric, spec, origin, h, mask)
             for dept, g in pl.groupby("dept_no", sort=True) for origin in origins]
    if n_jobs == 1:
        parts = [_one(*t) for t in tasks]
    else:
        parts = Parallel(n_jobs=n_jobs, prefer="threads")(delayed(_one)(*t) for t in tasks)
    return pd.DataFrame([r for part in parts for r in part], columns=COLUMNS)


def forecast_from(pl: pd.DataFrame, specs: dict[str, Spec], origins: list[int], h: int,
                  n_jobs: int = 1, mask: Mask | None = None) -> pd.DataFrame:
    """Revenue, cost and derived profit per department for each origin.
    `specs` maps each BASE metric to the method that forecasts it."""
    base = {m: base_forecasts(pl, m, specs[m], origins, h, n_jobs, mask) for m in BASE}
    key = ["dept_no", "origin", "horizon", "period_no"]
    p = base["revenue"][key + ["yhat"]].rename(columns={"yhat": "rev"})
    p = p.merge(base["cost"][key + ["yhat"]].rename(columns={"yhat": "cost"}), on=key)
    p = p.merge(base["other_income"][key + ["yhat"]].rename(columns={"yhat": "oi"}), on=key)
    profit = p[key].assign(metric="profit", yhat=p["rev"] - p["cost"] + p["oi"], method="derived")
    out = pd.concat([base["revenue"], base["cost"], profit[COLUMNS]], ignore_index=True)
    return out.sort_values(["dept_no", "metric", "origin", "horizon"]).reset_index(drop=True)


def attach_actuals(fc: pd.DataFrame, pl: pd.DataFrame) -> pd.DataFrame:
    """Adds `actual` (NaN where the month is not in the ledger yet)."""
    act = pl.melt(id_vars=["dept_no", "period_no"], value_vars=["revenue", "cost", "profit"],
                  var_name="metric", value_name="actual")
    return fc.merge(act, on=["dept_no", "period_no", "metric"], how="left")


def to_company(fc: pd.DataFrame) -> pd.DataFrame:
    """Sum departments: the company-level forecast (and actual, if attached).
    Any other columns (seed, candidate, ...) are kept as grouping keys."""
    cols = ["yhat", "actual"] if "actual" in fc.columns else ["yhat"]
    keys = [c for c in fc.columns if c not in [*cols, "dept_no", "method"]]
    return fc.groupby(keys, as_index=False, sort=True)[cols].sum(min_count=1).assign(dept_no="ALL")

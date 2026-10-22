"""The shared comparison format (US3.2 / US3.3): one long table that every
model's backtest results are appended to, so a new model can be added
alongside the existing ones without changing anything else.

    models/forecast/<version>/comparison.csv

| column | meaning |
|---|---|
| family | baseline, holt_winters, prophet (or any new family) |
| candidate | method and settings, e.g. `holt_winters(damped=False, seasonal=mul, trend=add)` |
| split | validation or test (bench.WINDOWS) |
| data | canonical (the live dataset's anomaly regime) or random (stress test) |
| seeds | the companies pooled, e.g. `41-50` or `20260901` |
| level | company (all departments summed) or dept |
| series | `ALL` or the dept_no |
| metric | revenue, cost or profit |
| horizon | months ahead, 1-12 |
| n, n_mape | forecasts scored; months with a non-zero actual (MAPE's denominator) |
| mape, wape | percent |
| mae, rmse | S$ |
"""
from __future__ import annotations

import os

import pandas as pd

from app.forecast import engine as E
from app.forecast import metrics as M

COLUMNS = ["family", "candidate", "split", "data", "seeds", "level", "series", "metric", "horizon",
           *M.SCORE_COLUMNS]
FILE = "comparison.csv"


def seeds_label(seeds) -> str:
    seeds = sorted(seeds)
    if len(seeds) > 1 and seeds == list(range(seeds[0], seeds[-1] + 1)):
        return f"{seeds[0]}-{seeds[-1]}"
    return ",".join(map(str, seeds))


def rows(fc: pd.DataFrame, *, family: str, candidate: str, split: str, data: str,
         dept_level: bool = True) -> pd.DataFrame:
    """Comparison rows for one candidate's backtest (forecasts of one or more seeds, with actuals)."""
    labels = dict(family=family, candidate=candidate, split=split, data=data,
                  seeds=seeds_label(fc["seed"].unique()))
    company = E.to_company(fc.drop(columns=[c for c in ("family", "candidate") if c in fc.columns]))
    out = [M.score_frame(company, ["metric", "horizon"]).assign(level="company", series="ALL")]
    if dept_level:
        out.append(M.score_frame(fc, ["dept_no", "metric", "horizon"])
                   .rename(columns={"dept_no": "series"}).assign(level="dept"))
    return pd.concat(out, ignore_index=True).assign(**labels)[COLUMNS]


def write(directory: str, new: pd.DataFrame, replace_split: str) -> str:
    """Replace this split's rows in comparison.csv, keeping the others."""
    path = os.path.join(directory, FILE)
    old = pd.read_csv(path) if os.path.exists(path) else pd.DataFrame(columns=COLUMNS)
    keep = old[old["split"] != replace_split]
    frames = [f for f in (keep, new[COLUMNS]) if not f.empty]
    out = pd.concat(frames, ignore_index=True)
    out.to_csv(path, index=False, float_format="%.6g")
    return path

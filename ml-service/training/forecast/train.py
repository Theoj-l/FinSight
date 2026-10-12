"""Choose the forecaster on the validation window.

    python -m training.forecast.train            # validation seeds 31-40, every candidate (~10 min)
    python -m training.forecast.train --quick    # 2 seeds, 2 Prophet settings (smoke test)

Steps (METHODOLOGY.md §6):
  1. generate the validation seeds (canonical mode) and build their monthly series
  2. rolling-origin backtest of every candidate over the validation window
  3. score each candidate at company level (departments summed) and per department
  4. pick the best settings within each family, and the overall best, which becomes
     the production choice. "Best" = the lowest *worst* company-level 1-month-ahead
     MAPE across revenue, cost and profit, because US3.5 requires all three under
     15% and profit is derived from the other two
  5. save models/forecast/<version>/config.json and the validation rows of comparison.csv
Test seeds and test months are never touched here.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import platform
import sys
import time
from importlib.metadata import PackageNotFoundError, version

import pandas as pd

from app.forecast.model import ForecastModel
from datagen.config import DATASET_VERSION
from training.anomaly.train import git_sha

from . import bench, compare
from . import candidates as C

MODEL_VERSION = "v1"
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, "models", "forecast",
                           MODEL_VERSION)
TARGETS = ("revenue", "cost", "profit")
FAMILY_RANK = {f: i for i, f in enumerate(C.FAMILIES)}   # ties go to the simpler family


def versions() -> dict:
    out = dict(python=platform.python_version(), dataset=DATASET_VERSION)
    for pkg in ("numpy", "pandas", "statsmodels", "prophet"):
        try:
            out[pkg] = version(pkg)
        except PackageNotFoundError:
            out[pkg] = None
    return out


def validation_table(cmp: pd.DataFrame) -> pd.DataFrame:
    """One row per candidate: company-level 1-month-ahead validation MAPE per
    target, and the worst of the three (the selection score)."""
    h1 = cmp[(cmp["level"] == "company") & (cmp["horizon"] == 1)]
    t = h1.pivot_table(index=["family", "candidate"], columns="metric", values="mape").reset_index()
    t["worst"] = t[list(TARGETS)].max(axis=1)
    t["rank"] = t["family"].map(FAMILY_RANK)
    return t.sort_values(["worst", "rank"]).drop(columns="rank").reset_index(drop=True)


def select(table: pd.DataFrame, cands: list[C.Candidate]) -> tuple[dict, dict]:
    """(family_best, selected): within each family and overall, the candidate
    whose worst target MAPE is lowest. One candidate forecasts both revenue and
    cost, so profit comes from a single, consistent model."""
    by_label = {c.label: c for c in cands}

    def pick(row) -> dict:
        return dict(family=row.family, candidate=row.candidate,
                    spec=C.spec_to_dict(by_label[row.candidate].spec),
                    val_mape={t: round(float(getattr(row, t)), 3) for t in TARGETS},
                    val_worst=round(float(row.worst), 3))

    family_best = {f: pick(next(table[table["family"] == f].itertuples()))
                   for f in C.FAMILIES if (table["family"] == f).any()}
    return family_best, pick(next(table.itertuples()))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="training.forecast.train")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--jobs", type=int, default=-1, help="parallel backtests (joblib n_jobs)")
    ap.add_argument("--quick", action="store_true", help="2 seeds, 2 Prophet settings (smoke test)")
    args = ap.parse_args(argv)
    out = os.path.abspath(args.out)
    seeds = bench.VAL_SEEDS[:2] if args.quick else bench.VAL_SEEDS
    cands = C.BASELINES + C.HOLT_WINTERS + (C.PROPHET[:2] if args.quick else C.PROPHET)
    t0 = time.time()

    print(f"· series for {len(seeds)} validation seeds ({bench.MODE})")
    series = bench.series_many(seeds, jobs=args.jobs)

    print(f"· rolling-origin backtest of {len(cands)} candidates over {bench.WINDOWS['validation']}")
    # Slowest first (Prophet) so the parallel pool stays busy.
    ordered = sorted(cands, key=lambda c: -FAMILY_RANK[c.family])
    tasks = [(dict(seed=s, family=c.family, candidate=c.label), series[s], C.specs(c.spec, c.spec))
             for c in ordered for s in seeds]
    fc = bench.backtest_many(tasks, "validation", jobs=args.jobs)
    backtest_s = round(time.time() - t0, 1)

    cmp = pd.concat([compare.rows(fc[fc["candidate"] == c.label], family=c.family, candidate=c.label,
                                  split="validation", data=bench.MODE) for c in cands], ignore_index=True)
    table = validation_table(cmp)
    family_best, selected = select(table, cands)
    print(table.round(2).to_string(index=False))
    print(f"  selected: {selected['candidate']}  (worst validation MAPE {selected['val_worst']:.2f}%)")

    os.makedirs(out, exist_ok=True)
    model = ForecastModel(dict(
        model_version=MODEL_VERSION, created_at=dt.datetime.now().isoformat(timespec="seconds"),
        git_sha=git_sha(), versions=versions(), quick=args.quick,
        specs={"revenue": selected["spec"], "cost": selected["spec"],
               "other_income": C.spec_to_dict(C.OTHER_INCOME)},
        selected=selected, family_best=family_best,
        selection_rule="one candidate forecasts revenue and cost; the one with the lowest worst "
                       "company-level 1-month-ahead validation MAPE across revenue, cost and profit, "
                       "pooled over the validation seeds; ties go to the simpler family",
        horizon=bench.HORIZON, backtest_origins=24, target_mape=15.0,
        benchmark=dict(mode=bench.MODE, stress_mode=bench.STRESS_MODE, history_end=bench.HISTORY_END,
                       windows=bench.WINDOWS, seeds=dict(validation=list(seeds), test=list(bench.TEST_SEEDS),
                                                         showcase=bench.SHOWCASE_SEED)),
        candidates=[dict(family=c.family, candidate=c.label, spec=C.spec_to_dict(c.spec)) for c in cands],
        validation_company_h1_mape={r.candidate: {t: round(float(getattr(r, t)), 3) for t in TARGETS}
                                    for r in table.itertuples()},
        timings=dict(backtest_s=backtest_s, total_s=round(time.time() - t0, 1)),
        command=" ".join(["python -m training.forecast.train", *(argv or sys.argv[1:])]),
    ))
    model.save(out)
    path = compare.write(out, cmp, replace_split="validation")
    print(f"\nsaved -> {out}/config.json, {os.path.basename(path)}  ({time.time() - t0:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Train the anomaly model on the benchmark's training seeds.

    python -m training.anomaly.train                     # full: seeds 1–30 train, 31–40 val
    python -m training.anomaly.train --quick             # smoke run: 3 train + 2 val seeds

Steps (METHODOLOGY.md §7):
  1. generate + featurize train and validation seeds (in memory, parallel)
  2. fit the journal Isolation Forest on training journal lines   (no labels)
  3. attach per-line scores, roll them up to units (max_jscore)
  4. fit one unit Isolation Forest per unit kind on training units (no labels)
  5. fit one gradient-boosted combiner per unit kind on training units, picking
     hyper-parameters by validation average precision
  6. choose each method's alert threshold on validation seeds so it raises
     schema.REVIEW_BUDGET alerts per company-month
  7. save models/anomaly/<version>/model.joblib + meta.json
Test seeds are never touched here.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import platform
import subprocess
import sys
import time

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score

from app.anomaly import features as F
from app.anomaly.detectors.iforest import JournalIForest, UnitIForest
from app.anomaly.model import METHODS, AnomalyModel, feature_matrix
from app.anomaly.schema import FEATURES, KINDS, LINE_FEATURES, REVIEW_BUDGET
from datagen.config import DATASET_VERSION

from . import bench
from . import labels as LB
from . import metrics as M

MODEL_VERSION = "v1"
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, "models", "anomaly",
                           MODEL_VERSION)

GRID = [dict(learning_rate=lr, max_iter=it, max_leaf_nodes=leaves)
        for lr in (0.05, 0.1) for it in (200, 400) for leaves in (15, 31)]
FIXED = dict(min_samples_leaf=20, l2_regularization=1.0, early_stopping=False, random_state=0)
JOURNAL_SAMPLE = 300_000     # lines sampled to fit the journal Isolation Forest


def git_sha() -> str:
    try:
        here = os.path.dirname(__file__)
        sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=here, text=True).strip()
        dirty = subprocess.call(["git", "diff", "--quiet", "HEAD"], cwd=here) != 0
        return sha + ("-dirty" if dirty else "")
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def versions() -> dict:
    return dict(python=platform.python_version(), sklearn=sklearn.__version__, numpy=np.__version__,
                pandas=pd.__version__, dataset=DATASET_VERSION)


def stack(units_by_seed: list[dict[str, pd.DataFrame]], kind: str, train: bool):
    df = pd.concat([u[kind] for u in units_by_seed], ignore_index=True)
    if train:
        df = df[df["train_ok"]]
    return feature_matrix(df, kind), df["y"].to_numpy()


def fit_combiner(kind: str, tr, va) -> tuple[HistGradientBoostingClassifier, list[dict]]:
    Xtr, ytr = stack(tr, kind, train=True)
    Xva, yva = stack(va, kind, train=False)
    results, best, best_ap = [], None, -1.0
    for params in GRID:
        clf = HistGradientBoostingClassifier(**params, **FIXED).fit(Xtr, ytr)
        ap = float(average_precision_score(yva, clf.predict_proba(Xva)[:, 1]))
        results.append(dict(params=params, val_average_precision=round(ap, 4)))
        if ap > best_ap:
            best, best_ap = clf, ap
    return best, results


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="training.anomaly.train")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--jobs", type=int, default=-1, help="parallel seeds (joblib n_jobs)")
    ap.add_argument("--quick", action="store_true", help="3 train + 2 val seeds (smoke test)")
    args = ap.parse_args(argv)
    out = os.path.abspath(args.out)
    train_seeds = bench.TRAIN_SEEDS[:3] if args.quick else bench.TRAIN_SEEDS
    val_seeds = bench.VAL_SEEDS[:2] if args.quick else bench.VAL_SEEDS
    timings: dict[str, float] = {}
    t0 = time.time()

    print(f"· featurize {len(train_seeds)} train + {len(val_seeds)} val seeds")
    train = bench.featurize_many(train_seeds, jobs=args.jobs)
    val = bench.featurize_many(val_seeds, jobs=args.jobs)
    timings["featurize_s"] = round(time.time() - t0, 1)

    print("· journal Isolation Forest (unsupervised)")
    t = time.time()
    lines = pd.concat([sd.fs.lines for sd in train], ignore_index=True)
    sample = lines.sample(n=min(len(lines), JOURNAL_SAMPLE), random_state=0)
    jif = JournalIForest().fit(sample)
    for sd in train + val:
        sd.fs = F.attach_journal_scores(sd.fs, jif)
    timings["journal_iforest_s"] = round(time.time() - t, 1)

    tr = [LB.label_units(sd.fs.units, sd.log) for sd in train]
    va = [LB.label_units(sd.fs.units, sd.log) for sd in val]

    print("· unit Isolation Forests (unsupervised)")
    uif = {k: UnitIForest(FEATURES[k]).fit(pd.concat([u[k] for u in tr], ignore_index=True))
           for k in KINDS}

    print("· combiners (supervised, grid on validation AP)")
    t = time.time()
    comb, grid = {}, {}
    for k in KINDS:
        comb[k], grid[k] = fit_combiner(k, tr, va)
        best = max(grid[k], key=lambda r: r["val_average_precision"])
        print(f"  {k:4s} best val AP {best['val_average_precision']:.3f}  {best['params']}")
    timings["combiner_s"] = round(time.time() - t, 1)

    model = AnomalyModel(journal_iforest=jif, unit_iforest=uif, combiner=comb, thresholds={})
    va_scored = [model.score_units(u) for u in va]
    model.thresholds = {m: M.pick_thresholds(va_scored, m) for m in METHODS}

    val_metrics = {}
    for m in METHODS:
        res = M.evaluate(val, va_scored, m, model.thresholds[m])
        val_metrics[m] = {k: v for k, v in res.items() if not k.startswith("_")}
        print(f"  val {m:9s} event recall {res['event_recall']:.3f}  "
              f"alert precision {res['alert_precision'] or 0:.3f}  "
              f"alerts/month {res['alerts_per_month']:.2f}")

    rows = {k: dict(train_units=int(sum(len(u[k]) for u in tr)),
                    train_positives=int(sum(u[k]["y"].sum() for u in tr)),
                    val_units=int(sum(len(u[k]) for u in va)),
                    val_positives=int(sum(u[k]["y"].sum() for u in va))) for k in KINDS}
    timings["total_s"] = round(time.time() - t0, 1)
    model.meta = dict(
        model_version=MODEL_VERSION, created_at=dt.datetime.now().isoformat(timespec="seconds"),
        git_sha=git_sha(), versions=versions(), quick=args.quick,
        seeds=dict(train=list(train_seeds), val=list(val_seeds), test=list(bench.TEST_SEEDS),
                   showcase=bench.SHOWCASE_SEED),
        review_budget=REVIEW_BUDGET, line_features=LINE_FEATURES, features=FEATURES,
        combiner_fixed_params=FIXED, combiner_grid=grid,
        combiner_chosen={k: {p: comb[k].get_params()[p] for p in GRID[0]} for k in KINDS},
        journal_iforest=dict(sample=len(sample), n_estimators=200, max_samples=512),
        thresholds=model.thresholds, rows=rows, val_metrics=val_metrics, timings=timings,
        command=" ".join(["python -m training.anomaly.train", *(argv or sys.argv[1:])]),
    )
    model.save(out)
    print(f"\nsaved -> {out}  ({timings['total_s']}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Thresholds and metrics shared by train.py (validation) and evaluate.py (test).

Unit level   average precision (area under the precision–recall curve), and at
             the operating threshold: alerts per month, precision, recall, and
             how often an unlabelled look-alike (decoy) was alerted.
Event level  share of anomalies detected (>= 1 alert in the footprint), by
             category / subtype / difficulty, and the detection delay.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from app.anomaly.schema import FIRST_SCORED_PERIOD, KINDS, REVIEW_BUDGET, periods_between
from datagen.config import AS_OF

from . import labels as LB

AS_OF_PERIOD = AS_OF.year * 100 + AS_OF.month
SCORED_MONTHS = len(periods_between(FIRST_SCORED_PERIOD, AS_OF_PERIOD))


def budget_threshold(y: np.ndarray, scores: np.ndarray, n_seeds: int, per_month: float) -> float:
    """The alert threshold with the best unit-level F1 on validation data, among
    thresholds that raise at most `per_month` alerts per company-month.

    The budget is a *cap*, not a quota: if the method is only confident about
    fewer units, it raises fewer alerts. Only cut points between distinct score
    values are considered, so ties are never split."""
    if len(scores) == 0:
        return float("inf")
    order = np.argsort(-scores, kind="stable")
    s, yy = scores[order], y[order]
    k = np.arange(1, len(s) + 1)
    cut = np.r_[s[1:] != s[:-1], True] & (s > -np.inf)
    within = k / (n_seeds * SCORED_MONTHS) <= per_month
    ok = cut & within
    if not ok.any():
        return float("inf")
    if yy.sum() == 0:
        return float(s[np.flatnonzero(ok)[-1]])      # no positives to learn from: spend the budget
    tp = np.cumsum(yy)
    f1 = 2 * tp / (k + yy.sum())
    best = np.flatnonzero(ok)[np.argmax(f1[ok])]
    return float(s[best])


def pick_thresholds(units_by_seed: list[dict[str, pd.DataFrame]], method: str) -> dict[str, float]:
    n = len(units_by_seed)
    out = {}
    for k in KINDS:
        y = np.concatenate([u[k]["y"].to_numpy() for u in units_by_seed])
        s = np.concatenate([u[k][f"score_{method}"].to_numpy() for u in units_by_seed])
        out[k] = budget_threshold(y, s, n, REVIEW_BUDGET[k])
    if method == "rules":
        out = {k: max(v, 1.0) for k, v in out.items()}   # never alert when no rule fired
    return out


def alerts_from(units: dict[str, pd.DataFrame], method: str, thresholds: dict[str, float]) -> pd.DataFrame:
    parts = []
    for k in KINDS:
        df = units[k]
        hit = df[df[f"score_{method}"] >= thresholds[k]]
        parts.append(pd.DataFrame({"kind": k, "key": hit["key"].astype(str),
                                   "period_no": hit["period_no"].astype(int),
                                   "score": hit[f"score_{method}"], "y": hit["y"]}))
    return pd.concat(parts, ignore_index=True)


def evaluate(seeds: list, units_by_seed: list[dict[str, pd.DataFrame]], method: str,
             thresholds: dict[str, float]) -> dict:
    """seeds: bench.SeedData (for logs / decoys), aligned with units_by_seed."""
    n = len(seeds)
    per_kind = {}
    events, all_alerts = [], []
    decoy_hits = decoy_total = 0
    for sd, units in zip(seeds, units_by_seed, strict=True):
        al = alerts_from(units, method, thresholds)
        al["seed"] = sd.seed
        all_alerts.append(al)
        events.append(LB.match_events(al, sd.log, sd.seed))
        dec = LB.decoy_units(sd.decoys)
        # decoys that sit inside a labelled footprint are not false positives
        dec -= {c for a in sd.log for c in LB.footprint(a)}
        hit = set(zip(al["kind"], al["key"], al["period_no"], strict=True))
        decoy_total += len(dec)
        decoy_hits += len(dec & hit)
    alerts = pd.concat(all_alerts, ignore_index=True)
    ev = pd.concat(events, ignore_index=True)

    for k in KINDS:
        y = np.concatenate([u[k]["y"].to_numpy() for u in units_by_seed])
        s = np.concatenate([u[k][f"score_{method}"].to_numpy() for u in units_by_seed])
        a = alerts[alerts["kind"] == k]
        per_kind[k] = dict(
            units=int(len(y)), positives=int(y.sum()),
            average_precision=float(average_precision_score(y, s)) if y.any() else None,
            alerts_per_month=float(len(a) / (n * SCORED_MONTHS)),
            precision=float(a["y"].mean()) if len(a) else None,
            unit_recall=float(a["y"].sum() / y.sum()) if y.any() else None,
        )

    def recall_by(col: str) -> dict:
        g = ev.groupby(col)["detected"]
        return {str(k): dict(recall=float(v.mean()), n=int(v.size)) for k, v in g}

    det = ev[ev["detected"]]
    return dict(
        method=method, seeds=[sd.seed for sd in seeds], thresholds=thresholds,
        per_kind=per_kind,
        alerts_per_month=float(len(alerts) / (n * SCORED_MONTHS)),
        alert_precision=float(alerts["y"].mean()) if len(alerts) else None,
        event_recall=float(ev["detected"].mean()) if len(ev) else None,
        events=int(len(ev)),
        recall_by_category=recall_by("category"),
        recall_by_subtype=recall_by("subtype"),
        recall_by_difficulty=recall_by("difficulty"),
        median_delay_by_subtype={str(k): float(v.median())
                                 for k, v in det.groupby("subtype")["delay_months"]},
        decoy_alert_rate=float(decoy_hits / decoy_total) if decoy_total else None,
        _events=ev, _alerts=alerts,
    )

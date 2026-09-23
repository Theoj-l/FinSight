"""The trained anomaly model: fitted detectors + supervised combiners + thresholds.

Four scoring methods are kept side by side so they can be compared on
identical data (training/anomaly/evaluate.py):

    rules      deterministic accounting rules (no fitting)
    stat       robust-statistics score (no fitting)
    iforest    Isolation Forest per unit kind (unsupervised fit)
    combiner   gradient-boosted trees over all features (supervised fit)

`combiner` is the production method. Thresholds turn scores into alerts and
were chosen on validation seeds to fit the review budget (schema.REVIEW_BUDGET).

Fitting lives in training/ — this module only applies a fitted bundle, so the
serving layer never trains.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd

from . import features as F
from .detectors import rules
from .detectors.iforest import JournalIForest, UnitIForest
from .loaders import Books
from .schema import FEATURES, KINDS

METHODS = ("rules", "stat", "iforest", "combiner")
MODEL_FILE = "model.joblib"
META_FILE = "meta.json"


@dataclass
class AnomalyModel:
    journal_iforest: JournalIForest
    unit_iforest: dict[str, UnitIForest]
    combiner: dict[str, object]                       # kind -> fitted HistGradientBoostingClassifier
    thresholds: dict[str, dict[str, float]]           # method -> kind -> threshold
    meta: dict = field(default_factory=dict)

    # -- scoring ---------------------------------------------------------
    def featurize(self, books: Books) -> F.FeatureSet:
        return F.attach_journal_scores(F.build(books), self.journal_iforest)

    def score_units(self, units: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        """Adds score_<method> columns for every method to each unit frame
        (`FeatureSet.units`, optionally with label columns attached)."""
        out = {}
        for kind in KINDS:
            df = units[kind].copy()
            df["score_rules"] = rules.rules_score(kind, df)
            df["score_stat"] = rules.stat_score(kind, df)
            df["score_iforest"] = self.unit_iforest[kind].score(df)
            df["score_combiner"] = combiner_proba(self.combiner[kind], df, kind)
            out[kind] = df
        return out

    def alerts(self, scored: dict[str, pd.DataFrame], method: str = "combiner",
               with_reasons: bool = True) -> pd.DataFrame:
        rows = []
        for kind in KINDS:
            df = scored[kind]
            thr = self.thresholds[method][kind]
            hit = df[df[f"score_{method}"] >= thr]
            for _, r in hit.iterrows():
                rows.append(dict(kind=kind, key=r["key"], period_no=int(r["period_no"]),
                                 score=float(r[f"score_{method}"]),
                                 reasons=rules.reasons(kind, r) if with_reasons else []))
        cols = ["kind", "key", "period_no", "score", "reasons"]
        return pd.DataFrame(rows, columns=cols).sort_values(["period_no", "kind", "score"],
                                                            ascending=[True, True, False])

    # -- persistence -------------------------------------------------------
    def save(self, directory: str) -> None:
        os.makedirs(directory, exist_ok=True)
        joblib.dump(self, os.path.join(directory, MODEL_FILE))
        with open(os.path.join(directory, META_FILE), "w") as f:
            json.dump(self.meta, f, indent=2, default=str)

    @staticmethod
    def load(directory: str) -> AnomalyModel:
        return joblib.load(os.path.join(directory, MODEL_FILE))


def feature_matrix(df: pd.DataFrame, kind: str) -> np.ndarray:
    """The allow-listed features for a unit kind, in a fixed order. Infinite
    values become NaN (gradient-boosted trees route NaN natively)."""
    return df[FEATURES[kind]].astype(float).replace([np.inf, -np.inf], np.nan).to_numpy()


def combiner_proba(clf, df: pd.DataFrame, kind: str) -> np.ndarray:
    if len(df) == 0:
        return np.zeros(0)
    return clf.predict_proba(feature_matrix(df, kind))[:, 1]

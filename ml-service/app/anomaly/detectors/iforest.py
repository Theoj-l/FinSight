"""Isolation Forests (Liu, Ting & Zhou, 2008) — unsupervised; labels never used.

JournalIForest  scores every P&L journal line ("journal-entry testing"); its
                per-unit maximum becomes the `max_jscore` feature.
UnitIForest     scores alert units directly from their features — the
                label-free baseline the supervised combiner is compared with.

Scores are oriented so that higher = more anomalous.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from ..schema import LINE_FEATURES

# Neutral values for features that are undefined for a line (no cell history yet).
_LINE_FILL = {"log_ratio_cell": 0.0, "pair_freq": 0.0}


class JournalIForest:
    def __init__(self, n_estimators: int = 200, max_samples: int = 512, random_state: int = 0):
        self.features = list(LINE_FEATURES)
        self.model = IsolationForest(n_estimators=n_estimators, max_samples=max_samples,
                                     random_state=random_state, n_jobs=1)

    def _x(self, lines: pd.DataFrame) -> np.ndarray:
        return lines[self.features].fillna(_LINE_FILL).fillna(0.0).to_numpy(dtype=float)

    def fit(self, lines: pd.DataFrame) -> JournalIForest:
        self.model.fit(self._x(lines))
        return self

    def score(self, lines: pd.DataFrame) -> np.ndarray:
        return -self.model.score_samples(self._x(lines))


class UnitIForest:
    """Isolation Forest over one unit kind's features. Missing values are
    imputed with the training medians (Isolation Forest cannot split on NaN)."""

    def __init__(self, features: list[str], n_estimators: int = 300, random_state: int = 0):
        self.features = list(features)
        self.fill: dict[str, float] = {}
        self.model = IsolationForest(n_estimators=n_estimators, max_samples=256,
                                     random_state=random_state, n_jobs=1)

    def _x(self, df: pd.DataFrame) -> np.ndarray:
        x = df[self.features].astype(float)
        x = x.replace([np.inf, -np.inf], np.nan).fillna(self.fill).fillna(0.0)
        return x.to_numpy()

    def fit(self, df: pd.DataFrame) -> UnitIForest:
        med = df[self.features].astype(float).replace([np.inf, -np.inf], np.nan).median()
        self.fill = {k: float(v) if np.isfinite(v) else 0.0 for k, v in med.items()}
        self.model.fit(self._x(df))
        return self

    def score(self, df: pd.DataFrame) -> np.ndarray:
        return -self.model.score_samples(self._x(df))

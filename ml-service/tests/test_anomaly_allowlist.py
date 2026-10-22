"""The models only ever see allow-listed features — never keys, references or
narratives that could identify an injected row."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.anomaly.model import feature_matrix
from app.anomaly.schema import BANNED_COLUMNS, FEATURES, KINDS, LINE_FEATURES


def test_no_banned_column_is_a_feature():
    for kind in KINDS:
        assert not set(FEATURES[kind]) & BANNED_COLUMNS, kind
        assert len(FEATURES[kind]) == len(set(FEATURES[kind])), kind
    assert not set(LINE_FEATURES) & BANNED_COLUMNS


def test_feature_matrix_ignores_everything_else():
    rng = np.random.default_rng(0)
    for kind in KINDS:
        df = pd.DataFrame(rng.normal(size=(5, len(FEATURES[kind]))), columns=FEATURES[kind])
        base = feature_matrix(df, kind)
        noisy = df.assign(gl_trx_id=rng.integers(0, 9, 5), ref_no1="ANOM-X", description="dup",
                          key="HL", period_no=202301, y=1)
        assert np.array_equal(base, feature_matrix(noisy, kind))
        assert base.shape == (5, len(FEATURES[kind]))

"""Causality: a month's features must not change when later data is removed.

If this fails, some feature is peeking at the future — the evaluation would be
optimistic and the model could not be run month by month on a live ledger.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.anomaly import features as F
from app.anomaly import loaders
from app.anomaly.schema import FEATURES, KINDS, LINE_FEATURES
from datagen.pipeline import generate


@pytest.fixture(scope="module")
def books():
    return loaders.from_tables(generate(3, anomalies="random"))


@pytest.fixture(scope="module")
def full(books):
    return F.build(books)


def _same(a: pd.DataFrame, b: pd.DataFrame, keys: list[str], cols: list[str], what: str) -> None:
    a = a.sort_values(keys).reset_index(drop=True)
    b = b.sort_values(keys).reset_index(drop=True)
    assert len(a) == len(b), f"{what}: {len(a)} rows vs {len(b)} after truncation"
    assert (a[keys].astype(str).to_numpy() == b[keys].astype(str).to_numpy()).all(), what
    for c in cols:
        x, y = a[c].to_numpy(dtype=float), b[c].to_numpy(dtype=float)
        assert np.allclose(x, y, rtol=1e-9, atol=1e-9, equal_nan=True), f"{what}.{c} changed"


@pytest.mark.parametrize("cut", [202212, 202406])
def test_unit_features_ignore_the_future(books, full, cut):
    trunc = F.build(loaders.truncate(books, cut))
    for kind in KINDS:
        before = full.units[kind][full.units[kind]["period_no"] <= cut]
        _same(before, trunc.units[kind], ["key", "period_no"],
              [c for c in FEATURES[kind] if c != "max_jscore"], kind)


def test_line_features_ignore_the_future(books, full):
    cut = 202306
    trunc = F.build(loaders.truncate(books, cut))
    before = full.lines[full.lines["period_no"] <= cut]
    _same(before, trunc.lines, ["gl_trx_id", "acc_no", "dept_no", "amt"], LINE_FEATURES, "lines")

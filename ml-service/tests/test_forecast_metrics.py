"""MAPE, WAPE, MAE, RMSE and the empirical band, against hand-computed values."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.forecast import metrics as M


def test_scores_by_hand():
    s = M.scores([100, 200, 400], [110, 180, 400])
    # errors -10, 20, 0 -> APE 10%, 10%, 0%
    assert s["mape"] == pytest.approx(20 / 3)
    assert s["wape"] == pytest.approx(30 / 700 * 100)
    assert s["mae"] == pytest.approx(10)
    assert s["rmse"] == pytest.approx(np.sqrt(500 / 3))
    assert (s["n"], s["n_mape"]) == (3, 3)


def test_mape_skips_zero_actuals_but_mae_does_not():
    s = M.scores([0, 100], [50, 90])
    assert s["mape"] == pytest.approx(10)
    assert s["n_mape"] == 1
    assert s["mae"] == pytest.approx(30)


def test_mape_is_undefined_when_every_actual_is_zero():
    assert M.scores([0, 0], [1, 2])["mape"] is None


def test_score_frame_groups():
    df = pd.DataFrame({"metric": ["a", "a", "b"], "actual": [100, 200, 50], "yhat": [90, 220, 50]})
    out = M.score_frame(df, ["metric"]).set_index("metric")
    assert out.loc["a", "mape"] == pytest.approx(10)
    assert out.loc["b", "mae"] == 0


def test_band_uses_the_10th_and_90th_percentile_of_past_relative_errors():
    rel = M.relative_errors(actual=np.arange(90, 111), forecast=np.full(21, 100.0))   # -10% .. +10%
    lo, hi = M.band(200.0, rel)
    assert lo == pytest.approx(200 * (1 - 0.08))
    assert hi == pytest.approx(200 * (1 + 0.08))
    assert M.band(200.0, np.array([])) == (None, None)

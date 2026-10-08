"""Behaviour of the causal series statistics on toy series."""
from __future__ import annotations

import numpy as np

from app.anomaly.detectors import series as S


def test_robust_z_uses_only_the_past_and_flags_a_spike():
    x = np.full(30, 100.0) + np.tile([0.0, 2.0, -2.0], 10)
    x[20] = 200.0
    z = S.robust_z(x)
    assert np.isnan(z[:6]).all()                     # not enough history yet
    assert z[20] > 10
    assert abs(z[21]) < 2                            # the spike does not poison the baseline


def test_yoy_removes_trend_and_seasonality():
    months = np.arange(48)
    x = 100 * 1.08 ** (months / 12) * (1 + 0.2 * np.sin(2 * np.pi * months / 12))
    r = S.yoy_log_ratio(x)
    assert np.allclose(r[12:], np.log(1.08))


def test_cusum_accumulates_a_level_shift_not_noise():
    z = np.r_[np.zeros(12), np.full(6, -2.0), np.zeros(6)]
    pos, neg = S.cusum(z)
    assert neg[17] == 9.0 and pos.max() == 0.0       # 6 months x (2 - 0.5)
    assert neg[-1] < neg[17]


def test_mann_kendall_sign():
    down = np.linspace(0.30, 0.10, 20)
    up = down[::-1]
    assert S.mann_kendall_z(down)[-1] < -3
    assert S.mann_kendall_z(up)[-1] > 3
    flat = np.tile([0.2, 0.21, 0.19], 7)
    assert abs(S.mann_kendall_z(flat)[-1]) < 2


def test_shift_vs_past_measures_change_against_a_year_ago():
    x = np.r_[np.full(24, 0.30), np.linspace(0.30, 0.20, 12)]
    assert S.shift_vs_past(x)[-1] < -0.08

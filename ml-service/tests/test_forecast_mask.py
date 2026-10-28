"""Forecast v2: months the anomaly model flagged are left out of the fits."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.forecast import anomaly_mask as AM
from app.forecast import engine as E
from app.forecast import series as S
from app.forecast.methods import fill_skipped, forecast
from datagen.pipeline import generate
from training.forecast import candidates as C

SEASON = np.array([0.8, 0.85, 1.0, 1.05, 1.1, 1.2, 1.15, 1.1, 1.0, 0.95, 0.9, 0.9])


def seasonal(years: int) -> np.ndarray:
    t = np.arange(12 * years)
    return 1_000_000.0 * 1.005 ** t * np.tile(SEASON, years)


def test_alerts_map_to_the_cells_they_distort():
    mask = AM.from_alerts([("dept", "EN", 202404), ("acc", "6800", 202503), ("cust", "C0122", 202409)])
    assert mask == {("EN", "revenue", 202404), ("EN", "cost", 202404), ("CP", "cost", 202503)}


def test_skipped_months_are_filled_from_the_same_month_in_neighbouring_years():
    y = np.arange(36, dtype=float)
    skip = np.zeros(36, dtype=bool)
    skip[[14, 35]] = True
    out = fill_skipped(y, skip)
    assert out[14] == pytest.approx((2 + 26) / 2)    # months 2 and 26: one year either side
    assert out[35] == pytest.approx(23)              # last month: only the year before exists
    assert (out[~skip] == y[~skip]).all()


@pytest.mark.parametrize("method, params", [
    ("holt_winters", dict(trend=None, damped=False, seasonal="add")),
    ("snaive_growth", {}),
    ("prophet", dict(seasonality_mode="additive", changepoint_prior_scale=0.01)),
])
def test_a_skipped_month_has_no_influence_on_the_forecast(method, params):
    if method == "prophet":
        pytest.importorskip("prophet")
    y = seasonal(4)
    skip = np.zeros(len(y), dtype=bool)
    skip[[30, 31, 32]] = True
    spiked = y.copy()
    spiked[[30, 31, 32]] *= 3                         # a three-month spike, masked
    a = forecast(y, 6, method, params, 202101, skip)
    b = forecast(spiked, 6, method, params, 202101, skip)
    assert np.allclose(a, b)
    assert not np.allclose(b, forecast(spiked, 6, method, params, 202101))   # unmasked, the spike leaks in


def test_masking_is_ignored_when_it_would_leave_under_two_years():
    y = seasonal(3)
    skip = np.zeros(len(y), dtype=bool)
    skip[:13] = True                                  # 36 - 13 = 23 months left
    assert np.allclose(forecast(y, 3, "snaive", None, 202101, skip), forecast(y, 3, "snaive"))


@pytest.fixture(scope="module")
def ledger():
    tables = generate(31)
    return S.from_tables(tables), AM.from_tables(tables, "models/anomaly/v1")


def test_the_anomaly_model_masks_the_canonical_client_loss(ledger):
    _, mask = ledger
    # A02: Engineering lost a key client from 2024-03 to 2024-08
    assert {("EN", "revenue", p) for p in range(202403, 202409)} <= mask


def test_masked_forecasts_ignore_what_happened_in_masked_months(ledger):
    pl, mask = ledger
    hw = E.Spec("holt_winters", dict(trend=None, damped=False, seasonal="add"))
    specs = C.specs(hw, hw)
    before = E.forecast_from(pl, specs, [202408], 6, mask=mask)
    tampered = pl.copy()
    hit = tampered.apply(lambda r: (r["dept_no"], "revenue", int(r["period_no"])) in mask, axis=1)
    tampered.loc[hit, "revenue"] *= 4
    after = E.forecast_from(tampered, specs, [202408], 6, mask=mask)
    rev = lambda d: d[d["metric"] == "revenue"].reset_index(drop=True)  # noqa: E731
    pd.testing.assert_frame_equal(rev(before), rev(after))


def test_describe_lists_cells_in_month_order():
    mask = AM.from_alerts([("acc", "6800", 202503), ("dept", "EN", 202404)])
    assert [c["period_no"] for c in AM.describe(mask)] == [202404, 202404, 202503]

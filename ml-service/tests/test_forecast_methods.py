"""Each forecasting method on series whose right answer is known."""
from __future__ import annotations

import numpy as np
import pytest

from app.forecast import metrics as M
from app.forecast.methods import effective_method, forecast

SEASON = np.array([0.8, 0.85, 1.0, 1.05, 1.1, 1.2, 1.15, 1.1, 1.0, 0.95, 0.9, 0.9])


def seasonal(years: int, growth: float = 0.0, level: float = 1_000_000.0) -> np.ndarray:
    t = np.arange(12 * years)
    return level * (1 + growth) ** (t / 12) * np.tile(SEASON, years)


def test_naive_repeats_the_last_month():
    assert forecast(np.array([1.0, 2.0, 3.0]), 4, "naive").tolist() == [3.0] * 4


def test_seasonal_naive_repeats_last_year():
    y = seasonal(3)
    assert np.allclose(forecast(y, 12, "snaive"), y[-12:])
    assert np.allclose(forecast(y, 14, "snaive")[12:], y[-12:-10])


def test_seasonal_naive_with_growth_scales_last_year():
    y = seasonal(3, growth=0.10)
    assert np.allclose(forecast(y, 12, "snaive_growth"), y[-12:] * 1.10)


def test_mean12_is_the_trailing_mean():
    y = np.arange(1.0, 25.0)
    assert np.allclose(forecast(y, 3, "mean12"), np.full(3, y[-12:].mean()))


def additive(years: int) -> np.ndarray:
    t = np.arange(12 * years)
    return 1_000_000.0 + 5_000.0 * t + 200_000.0 * (np.tile(SEASON, years) - 1)


@pytest.mark.parametrize("seasonal_kind, make", [("add", additive), ("mul", lambda n: seasonal(n, 0.06))])
def test_holt_winters_recovers_trend_and_season(seasonal_kind, make):
    y, truth = make(5), make(6)[60:]
    yhat = forecast(y, 12, "holt_winters", dict(trend="add", damped=False, seasonal=seasonal_kind))
    assert M.scores(truth, yhat)["mape"] < 1.0


def test_multiplicative_holt_winters_handles_non_positive_series():
    y = seasonal(3) - 900_000          # some months are negative
    yhat = forecast(y, 6, "holt_winters", dict(trend="add", damped=True, seasonal="mul"))
    assert np.isfinite(yhat).all()


@pytest.mark.parametrize("method, n, expected", [
    ("holt_winters", 30, "holt_winters"),
    ("holt_winters", 18, "snaive"),
    ("prophet", 23, "snaive"),
    ("snaive_growth", 18, "snaive"),
    ("snaive", 11, "naive"),
    ("holt_winters", 6, "naive"),
])
def test_short_history_falls_back_to_a_simpler_method(method, n, expected):
    assert effective_method(method, n) == expected
    assert np.isfinite(forecast(np.linspace(1, 2, n), 3, method, first_period=202101)).all()


def test_prophet_forecasts_a_seasonal_series():
    pytest.importorskip("prophet")
    y = seasonal(4, growth=0.06)
    truth = seasonal(5, growth=0.06)[48:54]
    yhat = forecast(y, 6, "prophet", dict(seasonality_mode="multiplicative", changepoint_prior_scale=0.05),
                    first_period=202101)
    assert M.scores(truth, yhat)["mape"] < 2.0


def test_unknown_method_is_refused():
    with pytest.raises(ValueError, match="unknown"):
        forecast(np.ones(30), 3, "arima")

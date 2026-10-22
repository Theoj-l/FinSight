"""The forecasting methods, behind one function:

    forecast(y, h, method, params, first_period) -> np.ndarray of length h

`y` is a complete monthly series (oldest first) whose first month is
`first_period`; the forecasts are for the h months after its last value.

    naive          last month, repeated                                  baseline
    snaive         same month last year                                  baseline
    snaive_growth  same month last year x trailing year-on-year growth   baseline
    mean12         mean of the last 12 months (used for other income)    baseline
    holt_winters   exponential smoothing with trend and seasonality      statsmodels
    prophet        additive regression with trend changepoints           prophet

Short series fall back to a simpler method instead of failing: Holt-Winters
and Prophet need two full years, seasonal methods need one. `effective_method`
says what actually ran.
"""
from __future__ import annotations

import logging
import warnings
from typing import Literal

import numpy as np
import pandas as pd

SEASON = 12
FAMILY = {"naive": "baseline", "snaive": "baseline", "snaive_growth": "baseline", "mean12": "baseline",
          "holt_winters": "holt_winters", "prophet": "prophet"}
METHODS = tuple(FAMILY)


def effective_method(method: str, n: int) -> str:
    """What runs on a series of n months: models fall back when history is short."""
    if method in ("holt_winters", "prophet") and n < 2 * SEASON:
        method = "snaive"
    if method in ("snaive", "snaive_growth") and n < SEASON:
        method = "naive"
    if method == "snaive_growth" and n < 2 * SEASON:
        method = "snaive"
    return method


def forecast(y: np.ndarray, h: int, method: str, params: dict | None = None,
             first_period: int | None = None) -> np.ndarray:
    y = np.asarray(y, dtype=float)
    if len(y) == 0:
        raise ValueError("cannot forecast an empty series")
    params = params or {}
    method = effective_method(method, len(y))
    if method == "naive":
        return np.full(h, y[-1])
    if method == "snaive":
        return _snaive(y, h)
    if method == "snaive_growth":
        return _snaive_growth(y, h)
    if method == "mean12":
        return np.full(h, y[-SEASON:].mean())
    if method == "holt_winters":
        out = _holt_winters(y, h, **params)
    elif method == "prophet":
        if first_period is None:
            raise ValueError("prophet needs first_period to date the series")
        out = _prophet(y, h, first_period, **params)
    else:
        raise ValueError(f"unknown forecasting method {method!r}")
    # A model that blows up (non-finite output) is replaced by the seasonal naive.
    return out if np.all(np.isfinite(out)) else _snaive(y, h)


def _snaive(y: np.ndarray, h: int) -> np.ndarray:
    last_year = y[-SEASON:]
    return np.array([last_year[k % SEASON] for k in range(h)])


def _snaive_growth(y: np.ndarray, h: int) -> np.ndarray:
    """Same month last year, scaled by the growth of the last 12 months over the 12 before."""
    recent, prior = y[-SEASON:].sum(), y[-2 * SEASON:-SEASON].sum()
    growth = recent / prior if prior > 0 and recent > 0 else 1.0
    years_ahead = 1 + np.arange(h) // SEASON
    return _snaive(y, h) * growth ** years_ahead


def _holt_winters(y: np.ndarray, h: int, trend: str | None = "add", damped: bool = False,
                  seasonal: str = "mul") -> np.ndarray:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    if seasonal == "mul" and y.min() <= 0:
        seasonal = "add"      # multiplicative seasonality needs a strictly positive series
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")     # convergence chatter on short, smooth series
        fit = ExponentialSmoothing(y, trend=trend, damped_trend=damped and trend is not None,
                                   seasonal=seasonal, seasonal_periods=SEASON,
                                   initialization_method="estimated").fit()
    return np.asarray(fit.forecast(h), dtype=float)


def _prophet(y: np.ndarray, h: int, first_period: int,
             seasonality_mode: Literal["additive", "multiplicative"] = "additive",
             changepoint_prior_scale: float = 0.05) -> np.ndarray:
    _quiet_prophet()
    from prophet import Prophet

    start = pd.Timestamp(year=first_period // 100, month=first_period % 100, day=1)
    ds = pd.date_range(start, periods=len(y) + h, freq="MS")
    m = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False,
                seasonality_mode=seasonality_mode, changepoint_prior_scale=changepoint_prior_scale,
                uncertainty_samples=0)
    m.fit(pd.DataFrame({"ds": ds[:len(y)], "y": y}))
    return m.predict(pd.DataFrame({"ds": ds[len(y):]}))["yhat"].to_numpy(dtype=float)


def _quiet_prophet() -> None:
    """Prophet logs every fit, and an error on import when plotly (unused here) is missing."""
    for name in ("cmdstanpy", "prophet", "prophet.plot"):
        logging.getLogger(name).disabled = True


def available(method: str) -> bool:
    """Whether the library a method needs is installed (Prophet is training-only
    unless it is the selected method)."""
    try:
        if method == "holt_winters":
            import statsmodels  # noqa: F401
        elif method == "prophet":
            _quiet_prophet()
            import prophet  # noqa: F401
    except ImportError:
        return False
    return method in FAMILY

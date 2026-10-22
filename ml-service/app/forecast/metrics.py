"""Forecast accuracy: MAPE, MAE, RMSE, and the empirical band.

MAPE is in percent and skips months whose actual is exactly 0 (the
percentage is undefined there); `n_mape` says how many months it covers.

WAPE (total absolute error / total absolute actual, in percent) is reported
alongside: unlike MAPE it is not inflated by a few months whose actual is
close to zero, which matters for profit.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

TARGET_MAPE = 15.0      # US3.5: 1-month-ahead MAPE must be at most this, per target
BAND = (0.10, 0.90)     # empirical band: 10th-90th percentile of past relative errors


def scores(actual, forecast) -> dict:
    a = np.asarray(actual, dtype=float)
    f = np.asarray(forecast, dtype=float)
    err = a - f
    nz = a != 0
    total = np.abs(a).sum()
    return dict(
        n=int(len(a)),
        n_mape=int(nz.sum()),
        mape=float(np.mean(np.abs(err[nz]) / np.abs(a[nz])) * 100) if nz.any() else None,
        wape=float(np.abs(err).sum() / total * 100) if total > 0 else None,
        mae=float(np.mean(np.abs(err))) if len(a) else None,
        rmse=float(np.sqrt(np.mean(err ** 2))) if len(a) else None,
    )


SCORE_COLUMNS = ["n", "n_mape", "mape", "wape", "mae", "rmse"]


def score_frame(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    """scores() for every group of a frame with `actual` and `yhat` columns."""
    rows = [{**dict(zip(by, key if isinstance(key, tuple) else (key,), strict=True)),
             **scores(g["actual"], g["yhat"])}
            for key, g in df.groupby(by, sort=True)]
    return pd.DataFrame(rows, columns=[*by, *SCORE_COLUMNS])


def meets_target(mape: float | None, target: float = TARGET_MAPE) -> bool:
    """mape <= target, ignoring floating-point noise (10% and 20% average to 15.000000000000002%)."""
    return mape is not None and mape <= target + 1e-9


def relative_errors(actual, forecast) -> np.ndarray:
    """(actual - forecast) / |forecast|: how far actuals land from a forecast,
    as a share of it. Months with a zero forecast are skipped."""
    a = np.asarray(actual, dtype=float)
    f = np.asarray(forecast, dtype=float)
    ok = f != 0
    return (a[ok] - f[ok]) / np.abs(f[ok])


def band(yhat: float, rel_errors: np.ndarray) -> tuple[float | None, float | None]:
    """The range 80% of past forecasts at this horizon landed in, applied to a new forecast."""
    if len(rel_errors) == 0:
        return None, None
    lo, hi = np.quantile(rel_errors, BAND)
    return yhat + abs(yhat) * lo, yhat + abs(yhat) * hi

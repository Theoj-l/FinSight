"""Causal, robust time-series statistics on dense monthly arrays.

Every function maps an array x[0..n) (one value per month, NaN = unknown) to an
array of the same length whose value at t depends only on x[..t]. Baselines
come from months strictly before t, so the current month never contaminates
its own reference.

Robust = median / MAD instead of mean / std, so one past anomaly does not
inflate the baseline and hide the next one.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import kendalltau, theilslopes

MAD_TO_SD = 1.4826   # MAD * 1.4826 estimates the standard deviation under normality


def _hist(x: np.ndarray, t: int, lo: int, hi: int) -> np.ndarray:
    """Finite values of x over months [t-lo, t-hi) — i.e. lo..hi+1 months back."""
    h = x[max(0, t - lo): max(0, t - hi)]
    return h[np.isfinite(h)]


def robust_z(x: np.ndarray, window: int = 12, min_periods: int = 6,
             rel_floor: float = 0.05, abs_floor: float = 1e-9) -> np.ndarray:
    """z_t = (x_t - median(x[t-window:t])) / (1.4826 * MAD), with the scale
    floored at rel_floor * |median| (so near-constant series such as rent or
    depreciation do not give infinite z for a small wobble) and at abs_floor."""
    out = np.full(len(x), np.nan)
    for t in range(len(x)):
        if not np.isfinite(x[t]):
            continue
        h = _hist(x, t, window, 0)
        if len(h) < min_periods:
            continue
        med = np.median(h)
        scale = max(MAD_TO_SD * np.median(np.abs(h - med)), rel_floor * abs(med), abs_floor)
        out[t] = (x[t] - med) / scale
    return out


def trailing_median(x: np.ndarray, window: int = 12, min_periods: int = 3) -> np.ndarray:
    """median(x[t-window:t]) — the baseline level before month t."""
    out = np.full(len(x), np.nan)
    for t in range(len(x)):
        h = _hist(x, t, window, 0)
        if len(h) >= min_periods:
            out[t] = np.median(h)
    return out


def yoy_log_ratio(x: np.ndarray) -> np.ndarray:
    """log(x_t / x_{t-12}) for positive values: removes trend *and* seasonality
    in one step, which suits monthly business series with ~5 years of history."""
    out = np.full(len(x), np.nan)
    with np.errstate(divide="ignore", invalid="ignore"):
        cur, prev = x[12:], x[:-12]
        ok = (cur > 0) & (prev > 0)
        out[12:][ok] = np.log(cur[ok] / prev[ok])
    return out


def level_shift(x: np.ndarray, recent: int = 3, base_lo: int = 15, base_hi: int = 3,
                min_periods: int = 6) -> np.ndarray:
    """log( mean(last `recent` months incl. t) / median(months t-base_lo .. t-base_hi-1) ).
    Picks up sustained drops / rises that a single-month z-score dilutes."""
    out = np.full(len(x), np.nan)
    for t in range(len(x)):
        r = x[max(0, t - recent + 1): t + 1]
        r = r[np.isfinite(r)]
        b = _hist(x, t, base_lo, base_hi)
        if len(r) == recent and len(b) >= min_periods and np.median(b) > 0 and r.mean() > 0:
            out[t] = np.log(r.mean() / np.median(b))
    return out


def shift_vs_past(x: np.ndarray, recent: int = 3, base_lo: int = 24, base_hi: int = 12,
                  min_periods: int = 6) -> np.ndarray:
    """median(last `recent` months incl. t) - median(months t-base_lo .. t-base_hi-1):
    the change against the same stretch roughly a year earlier, in the series'
    own units (e.g. margin points). Catches slow erosion a 12-month baseline
    would have absorbed."""
    out = np.full(len(x), np.nan)
    for t in range(len(x)):
        r = x[max(0, t - recent + 1): t + 1]
        r = r[np.isfinite(r)]
        b = _hist(x, t, base_lo, base_hi)
        if len(r) >= 2 and len(b) >= min_periods:
            out[t] = np.median(r) - np.median(b)
    return out


def cusum(z: np.ndarray, k: float = 0.5, cap: float = 5.0) -> tuple[np.ndarray, np.ndarray]:
    """One-sided CUSUMs of standardised residuals (Page, 1954):
    S+_t = max(0, S+_{t-1} + z_t - k),  S-_t = max(0, S-_{t-1} - z_t - k).
    Residuals are capped so one spike cannot dominate a level-shift test.
    Unknown residuals (NaN) reset nothing and add nothing."""
    pos, neg = np.zeros(len(z)), np.zeros(len(z))
    sp = sn = 0.0
    for t, v in enumerate(z):
        if np.isfinite(v):
            v = float(np.clip(v, -cap, cap))
            sp = max(0.0, sp + v - k)
            sn = max(0.0, sn - v - k)
        pos[t], neg[t] = sp, sn
    return pos, neg


def mann_kendall_z(x: np.ndarray, window: int = 12, min_periods: int = 9) -> np.ndarray:
    """Mann–Kendall trend statistic over the last `window` months (incl. t), as a
    z-score: Kendall's tau vs time rescaled by its null standard deviation
    sqrt(2(2n+5) / (9n(n-1))). Negative = downward trend. Monotonic but not
    necessarily linear trends count — right for gradual margin erosion."""
    out = np.full(len(x), np.nan)
    for t in range(len(x)):
        w = x[max(0, t - window + 1): t + 1]
        idx = np.flatnonzero(np.isfinite(w))
        n = len(idx)
        if n < min_periods:
            continue
        tau = kendalltau(idx, w[idx]).statistic
        if np.isfinite(tau):
            out[t] = tau / np.sqrt(2 * (2 * n + 5) / (9 * n * (n - 1)))
    return out


def theil_sen_slope(x: np.ndarray, window: int = 12, min_periods: int = 9) -> np.ndarray:
    """Median-of-pairwise-slopes trend (per month) over the last `window` months
    incl. t. Robust to a single outlier month inside the window."""
    out = np.full(len(x), np.nan)
    for t in range(len(x)):
        w = x[max(0, t - window + 1): t + 1]
        idx = np.flatnonzero(np.isfinite(w))
        if len(idx) >= min_periods:
            out[t] = theilslopes(w[idx], idx).slope
    return out

"""Monthly ledger features for the two ledger alert units.

    dept  one business unit in one month — revenue, cost-of-sales and gross
          margin series, GL-to-invoice reconciliation, account-dept coherence
    acc   one Corporate (CP) expense account in one month — level, year-on-year
          and journal-shape features

Series come from `pbalance` (monthly movement per account x dept) on the
*natural* sign: revenue as a positive credit, cost / expense as a positive debit.
All statistics are causal (see detectors/series.py).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..detectors import series as S
from ..loaders import PL_TYPES, Books
from ..schema import periods_between

ACTIVE_EPS = 0.005
NEW_PAIR_FREQ = 0.10      # a cell active in < 10% of prior months counts as "new"
NEW_PAIR_MIN_HISTORY = 12


def _cells(books: Books) -> tuple[list[int], pd.DataFrame]:
    """Dense matrix of natural-sign monthly amounts: rows = (acc_no, dept_no, acc_type)."""
    periods = periods_between(books.first_period, books.last_period)
    pb = books.pbalance.copy()
    pb["acc_type"] = pb["acc_no"].map(books.acc_type)
    pb = pb[pb["acc_type"].isin(PL_TYPES)]
    sign = np.where(pb["acc_type"].isin(["RE", "OI"]), -1.0, 1.0)
    pb["natural"] = (pb["home_dr"] - pb["home_cr"]) * sign
    mat = (pb.pivot_table(index=["acc_no", "dept_no", "acc_type"], columns="period_no",
                          values="natural", aggfunc="sum")
             .reindex(columns=periods).fillna(0.0))
    return periods, mat


def cell_activity(books: Books) -> pd.DataFrame:
    """Long frame (acc_no, dept_no, period_no, active, pair_freq): pair_freq is the
    share of *prior* months in which the account-dept cell had any posting."""
    periods, mat = _cells(books)
    active = (mat.abs() > ACTIVE_EPS).to_numpy()
    prior = np.cumsum(active, axis=1) - active
    with np.errstate(divide="ignore", invalid="ignore"):
        freq = prior / np.arange(len(periods))
    freq[:, 0] = np.nan
    idx = mat.index.droplevel("acc_type")
    long = pd.DataFrame(freq, index=idx, columns=periods).stack(future_stack=True).rename("pair_freq")
    act = pd.DataFrame(active, index=idx, columns=periods).stack(future_stack=True).rename("active")
    return pd.concat([long, act], axis=1).rename_axis(["acc_no", "dept_no", "period_no"]).reset_index()


def business_units(books: Books) -> list[str]:
    """Departments that earn revenue — data-driven, so Corporate / unallocated
    departments are excluded without hard-coding their codes."""
    pb = books.pbalance
    rev = pb[pb["acc_no"].map(books.acc_type).isin(["RE", "OI"])]
    return sorted(set(rev["dept_no"]))


def dept_features(books: Books) -> pd.DataFrame:
    periods, mat = _cells(books)
    t_idx = np.arange(len(periods))
    active = mat.abs() > ACTIVE_EPS
    prior = np.cumsum(active.to_numpy(), axis=1) - active.to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        freq = np.where(t_idx > 0, prior / np.maximum(t_idx, 1), np.nan)
    freq = pd.DataFrame(freq, index=mat.index, columns=periods)

    ivrev = (books.iv_dtl.groupby(["dept_no", "period_no"])["local_sub_total"].sum()
             .unstack("period_no").reindex(columns=periods).fillna(0.0))

    frames = []
    for d in business_units(books):
        cells = mat.xs(d, level="dept_no", drop_level=False)
        types = cells.index.get_level_values("acc_type")
        rev = cells[types.isin(["RE", "OI"])].sum().to_numpy()
        rev_re = cells[types == "RE"].sum().to_numpy()
        cost = cells[types == "CS"].sum().to_numpy()
        with np.errstate(divide="ignore", invalid="ignore"):
            gm = np.where(rev > 0, 1.0 - cost / rev, np.nan)
        iv = ivrev.loc[d].to_numpy() if d in ivrev.index else np.zeros(len(periods))

        rev_z12 = S.robust_z(rev)
        rev_zyoy = S.robust_z(S.yoy_log_ratio(rev), window=24, rel_floor=0.0, abs_floor=0.02)
        gm_z12 = S.robust_z(gm, rel_floor=0.0, abs_floor=0.005)
        # CUSUM on year-on-year residuals, not on the trailing-12m z: a unit with
        # a steady trend (e.g. TR shrinking 6%/yr) sits permanently below its
        # trailing median and would accumulate a CUSUM forever.
        rev_cp, rev_cn = S.cusum(rev_zyoy)

        # account-dept coherence over the unit's revenue / cost-of-sales cells
        rc = cells[types.isin(["RE", "OI", "CS"])]
        rc_abs = rc.abs().to_numpy()
        rc_act = rc_abs > ACTIVE_EPS
        rc_freq = freq.loc[rc.index].to_numpy()
        new = rc_act & (rc_freq < NEW_PAIR_FREQ) & (t_idx >= NEW_PAIR_MIN_HISTORY)
        with np.errstate(divide="ignore", invalid="ignore"):
            new_share = np.where(rc_abs.sum(0) > 0, (rc_abs * new).sum(0) / rc_abs.sum(0), 0.0)
        min_freq = np.where(rc_act, rc_freq, np.inf).min(0)
        min_freq = np.where(np.isfinite(min_freq), min_freq, np.nan)

        frames.append(pd.DataFrame({
            "key": d, "period_no": periods,
            "rev": rev, "cost": cost,
            "rev_z12": rev_z12,
            "rev_zyoy": rev_zyoy,
            "rev_level": S.level_shift(rev),
            "rev_cusum_pos": rev_cp, "rev_cusum_neg": rev_cn,
            "cost_z12": S.robust_z(cost),
            "cost_zyoy": S.robust_z(S.yoy_log_ratio(cost), window=24, rel_floor=0.0, abs_floor=0.02),
            "gm": gm,
            "gm_base": S.trailing_median(gm),
            "gm_z12": gm_z12,
            "gm_shift": S.shift_vs_past(gm),
            "gm_mkz12": S.mann_kendall_z(gm),
            "gm_slope12": S.theil_sen_slope(gm) * 12.0,
            "gm_cusum_neg": S.cusum(gm_z12)[1],
            "recon_gap": (rev_re - iv) / np.maximum(iv, 1.0),
            "new_pair_share": new_share,
            "min_pair_freq": min_freq,
        }))
    out = pd.concat(frames, ignore_index=True)
    out["gm_dev12"] = out["gm"] - out["gm_base"]
    return out


def acc_features(books: Books) -> pd.DataFrame:
    periods, mat = _cells(books)
    cp = mat[(mat.index.get_level_values("dept_no") == "CP")
             & (mat.index.get_level_values("acc_type") == "EX")]
    frames = []
    for (acc, _, _), row in cp.iterrows():
        x = row.to_numpy()
        base = S.trailing_median(x)
        zyoy = S.robust_z(S.yoy_log_ratio(x), window=24, rel_floor=0.0, abs_floor=0.02)
        with np.errstate(divide="ignore", invalid="ignore"):
            lr = np.where((x > 0) & (base > 0), np.log(x / base), np.nan)
        frames.append(pd.DataFrame({
            "key": acc, "period_no": periods, "amount": x,
            "z12": S.robust_z(x),
            "zyoy": zyoy,
            "log_ratio_med12": lr,
            "cusum_pos": S.cusum(zyoy)[0],   # year-on-year residuals: immune to opex growth
            "active": np.abs(x) > ACTIVE_EPS,
        }))
    out = pd.concat(frames, ignore_index=True)
    return out[out["active"]].drop(columns="active")


def add_manual_baseline(dept: pd.DataFrame) -> pd.DataFrame:
    """n_manual_dev: manual journals this month minus the unit's trailing median."""
    parts = []
    for _, g in dept.sort_values("period_no").groupby("key", sort=False):
        n = g["n_manual"].fillna(0).to_numpy(dtype=float)
        g = g.copy()
        g["n_manual_dev"] = n - np.nan_to_num(S.trailing_median(n), nan=0.0)
        parts.append(g)
    return pd.concat(parts)


def add_journal_count_baseline(acc: pd.DataFrame) -> pd.DataFrame:
    """n_journals_dev: journals this month minus the account's trailing median.
    Computed over the account's *active* months (acc units exist only then)."""
    parts = []
    for _, g in acc.sort_values("period_no").groupby("key", sort=False):
        n = g["n_journals"].fillna(0).to_numpy(dtype=float)
        g = g.copy()
        g["n_journals_dev"] = n - np.nan_to_num(S.trailing_median(n), nan=0.0)
        parts.append(g)
    return pd.concat(parts)

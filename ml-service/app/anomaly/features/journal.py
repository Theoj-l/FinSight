"""Journal-line features for P&L postings, and their roll-up to alert units.

A line is one gl_dtl row on a revenue / cost / expense account. Features are
computed from the line itself plus history of its account-dept cell *before*
the line's month (cell medians, pair frequency). The duplicate signature looks
+/-3 days around the line but never past the end of the line's own month, so a
month's features are final once that month is closed.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..detectors.series import trailing_median
from ..loaders import PL_TYPES, Books
from ..schema import periods_between

JT_CODE = {"SALES": 0, "RECEIPT": 1, "PAYMENT": 2, "GENERAL": 3, "OPENING": 4}
CREDIT_NATURAL = ("RE", "OI")     # revenue-type accounts normally carry credits
DUP_WINDOW_DAYS = 3


def _trailing_zeros(cents: pd.Series) -> pd.Series:
    """0 if the amount has cents; else trailing zeros of whole dollars (cap 6).
    100,000.00 -> 5;  52,357.47 -> 0;  1,250.00 -> 1."""
    dollars = cents // 100
    whole = (cents % 100 == 0) & (dollars > 0)
    tz = pd.Series(0, index=cents.index, dtype="int64")
    for k in range(1, 7):
        tz += (whole & (dollars % (10 ** k) == 0)).astype("int64")
    return tz


def _dup_counts(lines: pd.DataFrame) -> pd.Series:
    """For each line: number of *other* journals with the same account, dept and
    amount (to the cent) dated within +/-3 days and not after the line's month end."""
    out = pd.Series(0, index=lines.index, dtype="int64")
    key = ["acc_no", "dept_no", "cents"]
    cand = lines[lines.duplicated(key, keep=False)]
    for _, g in cand.groupby(key, sort=False):
        d = g["trans_date"].to_numpy()
        me = g["month_end_date"].to_numpy()
        trx = g["gl_trx_id"].to_numpy()
        for i, idx in enumerate(g.index):
            near = (np.abs(d - d[i]) <= np.timedelta64(DUP_WINDOW_DAYS, "D")) & (d <= me[i]) & (trx != trx[i])
            out[idx] = int(np.unique(trx[near]).size)
    return out


def line_features(books: Books, cell_activity: pd.DataFrame) -> pd.DataFrame:
    """One row per P&L gl line with LINE_FEATURES plus keys (acc_no, dept_no,
    period_no, gl_trx_id, acc_type). `cell_activity`: from ledger.cell_activity()."""
    gl = books.gl
    n_lines = gl.groupby("gl_trx_id").size().rename("n_lines")
    at = gl["acc_no"].map(books.acc_type)
    pl = gl[at.isin(PL_TYPES)].copy()
    pl["acc_type"] = at[pl.index]
    net_dr = pl["home_dr"] - pl["home_cr"]
    pl["amt"] = net_dr.abs()
    pl = pl[pl["amt"] > 0.004].copy()
    net_dr = net_dr[pl.index]

    pl["log_amt"] = np.log10(pl["amt"] + 1.0)
    pl["cents"] = (pl["amt"] * 100).round().astype("int64")
    pl["trailing_zeros"] = _trailing_zeros(pl["cents"])
    pl["dom"] = pl["trans_date"].dt.day
    days_in_month = pl["trans_date"].dt.days_in_month
    pl["month_end"] = ((days_in_month - pl["dom"]) <= 2).astype("int64")
    pl["month_end_date"] = pl["trans_date"] + pd.to_timedelta(days_in_month - pl["dom"], unit="D")
    pl["jt_code"] = pl["journal_type"].map(JT_CODE).fillna(5).astype("int64")
    pl["is_contra"] = np.where(pl["acc_type"].isin(CREDIT_NATURAL), net_dr > 0, net_dr < 0).astype("int64")
    pl = pl.join(n_lines, on="gl_trx_id")

    # trailing-12-month median line amount of the same account-dept cell
    periods = periods_between(books.first_period, books.last_period)
    med = pl.groupby(["acc_no", "dept_no", "period_no"])["amt"].median().unstack("period_no")
    med = med.reindex(columns=periods)
    base = np.vstack([trailing_median(row, window=12, min_periods=3) for row in med.to_numpy()])
    base_long = (pd.DataFrame(base, index=med.index, columns=pd.Index(periods, name="period_no"))
                 .stack(future_stack=True).rename("cell_median").reset_index())
    pl = pl.merge(base_long, on=["acc_no", "dept_no", "period_no"], how="left")
    with np.errstate(divide="ignore", invalid="ignore"):
        pl["log_ratio_cell"] = np.log10(pl["amt"] / pl["cell_median"])

    pl = pl.merge(cell_activity[["acc_no", "dept_no", "period_no", "pair_freq"]],
                  on=["acc_no", "dept_no", "period_no"], how="left")
    pl["dup_count"] = _dup_counts(pl)
    return pl[[c for c in ("gl_dtl_key",) if c in pl.columns] + ["gl_trx_id", "acc_no", "dept_no", "acc_type", "period_no", "journal_type",
               "amt", "log_amt", "log_ratio_cell", "trailing_zeros", "month_end", "dom",
               "jt_code", "n_lines", "pair_freq", "dup_count", "is_contra"]]


def dept_line_aggregates(lines: pd.DataFrame, depts: list[str]) -> pd.DataFrame:
    """Per (dept, period) over the unit's revenue and cost-of-sales lines."""
    x = lines[lines["dept_no"].isin(depts) & lines["acc_type"].isin(["RE", "OI", "CS"])].copy()
    x["manual_amt"] = np.where(x["jt_code"] != JT_CODE["SALES"], x["amt"], 0.0)
    g = x.groupby(["dept_no", "period_no"])
    agg = pd.DataFrame({
        "n_manual": g.apply(lambda s: s.loc[s["jt_code"] == JT_CODE["GENERAL"], "gl_trx_id"].nunique(),
                            include_groups=False),
        "manual_share": g["manual_amt"].sum() / g["amt"].sum(),
        "max_line_ratio": g["log_ratio_cell"].max(),
    })
    if "jscore" in x.columns:
        agg["max_jscore"] = g["jscore"].max()
    return agg.reset_index().rename(columns={"dept_no": "key"})


def acc_line_aggregates(lines: pd.DataFrame, accounts: list[str]) -> pd.DataFrame:
    """Per (account, period) over Corporate (CP) expense lines."""
    x = lines[(lines["dept_no"] == "CP") & lines["acc_no"].isin(accounts)].copy()
    x["round_me"] = np.where((x["trailing_zeros"] >= 3) & (x["month_end"] == 1), x["log_amt"], 0.0)
    g = x.groupby(["acc_no", "period_no"])
    agg = pd.DataFrame({
        "n_journals": g["gl_trx_id"].nunique(),
        "max_line_share": g["amt"].max() / g["amt"].sum(),
        "max_line_ratio": g["log_ratio_cell"].max(),
        "max_trailing_zeros": g["trailing_zeros"].max(),
        "round_month_end": g["round_me"].max(),
        "dup_max": g["dup_count"].max(),
    })
    if "jscore" in x.columns:
        agg["max_jscore"] = g["jscore"].max()
    return agg.reset_index().rename(columns={"acc_no": "key"})

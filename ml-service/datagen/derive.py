"""Derived tables: pbalance (from gl_dtl), budget and budget_pbalance.

Governing rule: nothing derivable is generated independently.
"""
from __future__ import annotations

import pandas as pd

from . import config as C
from . import reference as R

PL_TYPES = {"RE", "CS", "EX", "OI"}
ACC_TYPE = {a: t for (a, d, t, p) in R.ACCOUNTS}


def _period(d) -> int:
    return d.year * 100 + d.month


def pbalance_rows(gl: list[dict]) -> list[dict]:
    df = pd.DataFrame(gl, columns=["acc_no", "dept_no", "trans_date", "home_dr", "home_cr"])
    df["period_no"] = df["trans_date"].map(_period)
    g = (df.groupby(["period_no", "acc_no", "dept_no"], as_index=False)[["home_dr", "home_cr"]]
           .sum().round(2))
    return g.to_dict("records")


def budget_rows() -> list[dict]:
    out = []
    for y in range(C.START.year, C.AS_OF.year + 1):
        out.append(dict(budget_key=y, budget_name=f"BUDGET FY{y}"))
    return out


def budget_pbalance_rows(pbalance: list[dict]) -> list[dict]:
    """Budget = prior-year actual net movement per (account, dept), lifted and
    spread evenly across the 12 months. FY2021 is its own actuals * 0.97.
    Stored on the same debit-positive basis as pbalance (home_dr - home_cr).
    Only P&L accounts are budgeted."""
    df = pd.DataFrame(pbalance)
    df = df[df["acc_no"].map(lambda a: ACC_TYPE.get(a) in PL_TYPES)].copy()
    if df.empty:
        return []
    df["year"] = df["period_no"] // 100
    df["net"] = (df["home_dr"] - df["home_cr"]).round(2)
    yearly = df.groupby(["year", "acc_no", "dept_no"], as_index=False)["net"].sum()

    rows = []
    years = list(range(C.START.year, C.AS_OF.year + 1))
    for y in years:
        prior = yearly[yearly["year"] == (y - 1)]
        if prior.empty:                       # FY2021: base on own actuals
            prior = yearly[yearly["year"] == y].copy()
            prior["net"] *= 0.97
        for _, r in prior.iterrows():
            acc = r["acc_no"]
            uplift = C.BUDGET_REVENUE_UPLIFT if ACC_TYPE.get(acc) in {"RE", "OI"} \
                else C.BUDGET_EXPENSE_UPLIFT
            annual = r["net"] * uplift
            months = 12 if y < C.AS_OF.year else C.AS_OF.month
            per_month = round(annual / 12.0, 2)
            for mth in range(1, months + 1):
                rows.append(dict(budget_key=y, period_no=y * 100 + mth,
                                 acc_no=acc, dept_no=r["dept_no"], amount=per_month))
    return rows

"""Monthly P&L series per department, from pbalance.

Sources mirror app/anomaly/loaders.py: an in-memory `datagen.pipeline.generate()`
result, or the live Postgres database. Both reduce to the same rows
(period_no, dept_no, acc_type, net credit), so they produce identical frames.

The result is a complete grid: one row per department per month from the first
to the last month in the ledger, with months that have no postings set to 0.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import pandas as pd

from app.periods import periods_between

if TYPE_CHECKING:
    import psycopg

BASE = ("revenue", "cost", "other_income")   # forecast directly
METRICS = ("revenue", "cost", "profit")      # stored and reported; profit is derived

PG_QUERY = """
select p.period_no, p.dept_no, g.acc_type, sum(p.home_cr - p.home_dr)::float8 as net_cr
from pbalance p
join gl_mast g on g.acc_no = p.acc_no
where g.acc_type in ('RE', 'CS', 'EX', 'OI')
group by p.period_no, p.dept_no, g.acc_type
"""


def build(rows: pd.DataFrame) -> pd.DataFrame:
    """rows: period_no, dept_no, acc_type, net_cr (credit - debit).
    Returns dept_no, period_no, revenue, cost, other_income, profit."""
    if rows.empty:
        raise ValueError("pbalance has no P&L rows: there is nothing to forecast")
    r = rows.copy()
    r["period_no"] = r["period_no"].astype("int64")
    r["dept_no"] = r["dept_no"].astype("string")
    sign = r["acc_type"].map({"RE": 1.0, "OI": 1.0, "CS": -1.0, "EX": -1.0})
    metric = r["acc_type"].map({"RE": "revenue", "OI": "other_income", "CS": "cost", "EX": "cost"})
    r = r.assign(metric=metric, value=r["net_cr"].astype(float) * sign).dropna(subset=["metric"])
    wide = r.pivot_table(index=["dept_no", "period_no"], columns="metric", values="value",
                         aggfunc="sum", fill_value=0.0)

    periods = periods_between(int(r["period_no"].min()), int(r["period_no"].max()))
    depts = sorted(r["dept_no"].unique())
    grid = pd.MultiIndex.from_product([depts, periods], names=["dept_no", "period_no"])
    df = wide.reindex(grid, fill_value=0.0).reindex(columns=list(BASE), fill_value=0.0)
    df = df.reset_index().rename_axis(columns=None)
    df["profit"] = df["revenue"] - df["cost"] + df["other_income"]

    # A department with no P&L activity at all (e.g. the NA sentinel) has nothing to forecast.
    active = df.groupby("dept_no")[list(BASE)].apply(lambda g: g.abs().to_numpy().sum() > 0)
    return df[df["dept_no"].isin(active[active].index)].reset_index(drop=True)


def from_tables(tables: dict) -> pd.DataFrame:
    """From a `datagen.pipeline.generate()` result (lists of row dicts)."""
    pb = pd.DataFrame(tables["pbalance"])
    acc_type = {r["acc_no"]: r["acc_type"] for r in tables["gl_mast"]}
    pb["acc_type"] = pb["acc_no"].map(acc_type)
    pb = pb[pb["acc_type"].isin(["RE", "CS", "EX", "OI"])]
    pb["net_cr"] = pb["home_cr"].astype(float) - pb["home_dr"].astype(float)
    rows = pb.groupby(["period_no", "dept_no", "acc_type"], as_index=False)["net_cr"].sum()
    return build(rows)


def from_postgres(conn: psycopg.Connection) -> pd.DataFrame:
    """From the live database: one aggregate query over pbalance."""
    with conn.cursor() as cur:
        cur.execute(PG_QUERY)
        rows = cur.fetchall()
    return build(pd.DataFrame(rows, columns=["period_no", "dept_no", "acc_type", "net_cr"]))


def truncate(df: pd.DataFrame, through: int) -> pd.DataFrame:
    """The series as they stood at the end of month `through`."""
    return df[df["period_no"] <= through].reset_index(drop=True)


def company(df: pd.DataFrame) -> pd.DataFrame:
    """All departments summed: the company-level series."""
    cols = [*BASE, "profit"]
    return df.groupby("period_no", as_index=False)[cols].sum().assign(dept_no="ALL")

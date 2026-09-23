"""Build every feature frame for one set of books.

    fs = build(books)                     # label-free, deterministic
    fs = attach_journal_scores(fs, jif)   # adds max_jscore once a journal
                                          # Isolation Forest has been fitted

`fs.units[kind]` has one row per alert unit (key, period_no) with that kind's
allow-listed features; `fs.lines` has one row per P&L journal line.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..loaders import Books
from ..schema import FEATURES, FIRST_SCORED_PERIOD
from . import journal, ledger, receivables


@dataclass
class FeatureSet:
    units: dict[str, pd.DataFrame]
    lines: pd.DataFrame


def build(books: Books) -> FeatureSet:
    activity = ledger.cell_activity(books)
    lines = journal.line_features(books, activity)

    dept = ledger.dept_features(books)
    dept = dept.merge(journal.dept_line_aggregates(lines, sorted(dept["key"].unique())),
                      on=["key", "period_no"], how="left")
    dept["n_manual"] = dept["n_manual"].fillna(0)
    dept = ledger.add_manual_baseline(dept)

    acc = ledger.acc_features(books)
    acc = acc.merge(journal.acc_line_aggregates(lines, sorted(acc["key"].unique())),
                    on=["key", "period_no"], how="left")
    acc = ledger.add_journal_count_baseline(acc)

    cust = receivables.cust_features(books)

    units = {}
    for kind, df in (("dept", dept), ("acc", acc), ("cust", cust)):
        df = df[df["period_no"] >= FIRST_SCORED_PERIOD].copy()
        df["kind"] = kind
        if "max_jscore" in FEATURES[kind] and "max_jscore" not in df.columns:
            df["max_jscore"] = np.nan
        units[kind] = df.sort_values(["period_no", "key"]).reset_index(drop=True)
    return FeatureSet(units=units, lines=lines)


def attach_journal_scores(fs: FeatureSet, journal_model) -> FeatureSet:
    """Score every line with the fitted journal Isolation Forest and roll the
    maximum up to the dept and acc units."""
    lines = fs.lines.copy()
    lines["jscore"] = journal_model.score(lines)
    units = dict(fs.units)
    d = lines[lines["acc_type"].isin(["RE", "OI", "CS"])].groupby(["dept_no", "period_no"])["jscore"].max()
    a = lines[lines["dept_no"] == "CP"].groupby(["acc_no", "period_no"])["jscore"].max()
    for kind, s in (("dept", d), ("acc", a)):
        u = units[kind].drop(columns="max_jscore")
        s = s.rename("max_jscore").rename_axis(["key", "period_no"]).reset_index()
        units[kind] = u.merge(s, on=["key", "period_no"], how="left")
    return FeatureSet(units=units, lines=lines)

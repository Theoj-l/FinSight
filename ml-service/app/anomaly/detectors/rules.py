"""Deterministic rules, a robust-statistics score, and plain-English reasons.

rules_score   number of hard accounting rules a unit breaks (0 = none). These
              are the checks an auditor would run by hand: GL vs sub-ledger
              reconciliation, first-ever account/department combination,
              exact duplicate payment, large round figure at month end, a
              customer who has stopped paying.
stat_score    the largest robust z-type statistic among the unit's series
              tests — a label-free "how many robust SDs from normal" score.
reasons       why a unit looks unusual, strongest first, for the reviewer.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

ROUND_MIN_LOG = math.log10(25_000)  # round-number rule applies from S$25k


def _col(df: pd.DataFrame, c: str) -> pd.Series:
    return df[c].astype(float) if c in df.columns else pd.Series(np.nan, index=df.index)


def rule_flags(kind: str, df: pd.DataFrame) -> pd.DataFrame:
    c = lambda name: _col(df, name)  # noqa: E731
    if kind == "dept":
        flags = {
            "recon_break": c("recon_gap").abs() > 0.005,
            "new_account_pair": c("new_pair_share") > 0.02,
        }
    elif kind == "acc":
        flags = {
            "duplicate_amount": c("dup_max") >= 1,
            "round_month_end": c("round_month_end") >= ROUND_MIN_LOG,
        }
    else:
        flags = {
            "stopped_paying": (c("overdue90_share") > 0.5) & (c("days_since_receipt") > 120),
        }
    return pd.DataFrame({k: v.fillna(False).astype(bool) for k, v in flags.items()}, index=df.index)


def rules_score(kind: str, df: pd.DataFrame) -> np.ndarray:
    return rule_flags(kind, df).sum(axis=1).to_numpy(dtype=float)


# Components of the robust-statistics score: (column, weight, direction).
# direction +1: large positive is unusual; -1: large negative; 0: either way.
STAT_COMPONENTS = {
    "dept": [
        ("rev_z12", 1.0, 0),
        ("rev_zyoy", 1.0, 0),
        ("gm_z12", 1.0, -1),
        ("gm_mkz12", 1.0, -1),
        ("rev_cusum_neg", 0.5, +1),
        ("rev_cusum_pos", 0.5, +1),
        ("gm_cusum_neg", 0.5, +1),
    ],
    "acc": [("z12", 1.0, +1), ("zyoy", 1.0, +1), ("cusum_pos", 0.5, +1)],
    "cust": [("dpd_z", 1.0, +1)],
}


def stat_score(kind: str, df: pd.DataFrame) -> np.ndarray:
    parts = []
    for col, w, direction in STAT_COMPONENTS[kind]:
        v = _col(df, col).to_numpy()
        v = np.abs(v) if direction == 0 else np.maximum(direction * v, 0.0)
        parts.append(w * np.nan_to_num(v, nan=0.0))
    return np.max(np.vstack(parts), axis=0)


def _fmt_pct(x: float) -> str:
    return f"{x:.0%}"


def reason_details(kind: str, r: pd.Series) -> list[dict[str, str]]:
    """Human-readable evidence for one unit row, strongest first."""
    out: list[tuple[float, str, str]] = []

    def g(name: str) -> float:
        v = r.get(name, np.nan)
        return float(v) if v is not None and pd.notna(v) else float("nan")

    if kind == "dept":
        if abs(g("recon_gap")) > 0.005:
            out.append(
                (10, f"GL revenue differs from sales invoices by {g('recon_gap'):+.1%}", "reconciliation")
            )
        if g("new_pair_share") > 0.02:
            out.append(
                (
                    9,
                    f"{_fmt_pct(g('new_pair_share'))} of the unit's revenue/cost is on an "
                    "account this unit has never used",
                    "new_account_pair",
                )
            )
        if abs(g("rev_z12")) >= 3:
            word = "above" if g("rev_z12") > 0 else "below"
            out.append(
                (
                    abs(g("rev_z12")),
                    f"revenue {abs(g('rev_z12')):.1f} robust SDs {word} its trailing 12 months",
                    "revenue_outlier",
                )
            )
        if g("rev_cusum_neg") >= 4:
            out.append(
                (
                    g("rev_cusum_neg") / 2,
                    f"revenue persistently below last year's pattern (CUSUM {g('rev_cusum_neg'):.1f})",
                    "revenue_shortfall",
                )
            )
        if g("gm_z12") <= -3 and g("gm_dev12") <= -0.03:
            out.append(
                (
                    abs(g("gm_z12")),
                    f"gross margin {_fmt_pct(g('gm'))} vs typical {_fmt_pct(g('gm') - g('gm_dev12'))}",
                    "gross_margin_outlier",
                )
            )
        if g("gm_mkz12") <= -2 and g("gm_shift") <= -0.02:
            out.append(
                (
                    abs(g("gm_mkz12")) + 1,
                    f"gross margin trending down: {g('gm_shift') * 100:+.1f} pts vs a year "
                    f"earlier (Mann–Kendall z {g('gm_mkz12'):.1f})",
                    "gross_margin_decline",
                )
            )
    elif kind == "acc":
        if g("dup_max") >= 1:
            out.append((10, "the same amount was posted twice within 3 days", "duplicate_posting"))
        if g("round_month_end") >= ROUND_MIN_LOG:
            amount = 10 ** g("round_month_end") - 1.0  # round_month_end = log10(amount + 1)
            out.append((8, f"round-number journal of {amount:,.0f} at month end", "round_month_end"))
        if g("z12") >= 3:
            ratio = math.exp(g("log_ratio_med12")) if pd.notna(r.get("log_ratio_med12")) else float("nan")
            txt = f"{ratio:.1f}x its trailing median" if math.isfinite(ratio) else "far above normal"
            out.append(
                (g("z12"), f"monthly total {g('amount'):,.0f} is {txt} (z {g('z12'):.1f})", "expense_outlier")
            )
        if g("n_journals_dev") >= 1:
            out.append(
                (
                    3,
                    f"{g('n_journals'):.0f} postings this month, usually "
                    f"{g('n_journals') - g('n_journals_dev'):.0f}",
                    "posting_count",
                )
            )
    else:
        if g("overdue90_share") >= 0.3:
            out.append(
                (
                    6,
                    f"{_fmt_pct(g('overdue90_share'))} of unpaid invoices are 90+ days overdue",
                    "overdue_invoices",
                )
            )
        if g("dpd_z") >= 3:
            out.append(
                (
                    g("dpd_z"),
                    f"days past due {g('wavg_dpd'):.0f} vs the customer's own history (z {g('dpd_z'):.1f})",
                    "payment_delay",
                )
            )
        if g("gap_ratio") >= 2.5 and g("days_since_receipt") > 60:
            out.append(
                (
                    g("gap_ratio"),
                    f"no receipt for {g('days_since_receipt'):.0f} days (usually every "
                    f"{g('typical_gap'):.0f})",
                    "receipt_gap",
                )
            )
        if g("collect_ratio_90") < 0.2 and g("log_billed_90") > 3:
            out.append(
                (
                    4,
                    f"collected {_fmt_pct(g('collect_ratio_90'))} of the last 90 days' billing",
                    "low_collections",
                )
            )
    out.sort(key=lambda x: -x[0])
    if not out:
        # nothing crossed a headline threshold: name the strongest weaker signals
        weak = []
        for col, w, direction in STAT_COMPONENTS[kind]:
            v = g(col)
            mag = abs(v) if direction == 0 else max(direction * v, 0.0)
            if math.isfinite(mag) and w * mag >= 1.5:
                weak.append((w * mag, f"{STAT_LABEL.get(col, col)} {v:+.1f}"))
        weak.sort(key=lambda x: -x[0])
        if weak:
            return [{"code": "model_pattern", "text": "weaker signals: " + ", ".join(t for _, t in weak[:3])}]
    return [{"code": code, "text": text} for _, text, code in out]


STAT_LABEL = {
    "rev_z12": "revenue z vs 12m",
    "rev_zyoy": "revenue year-on-year z",
    "gm_z12": "gross-margin z vs 12m",
    "gm_mkz12": "gross-margin trend (Mann–Kendall z)",
    "rev_cusum_neg": "revenue shortfall CUSUM",
    "rev_cusum_pos": "revenue excess CUSUM",
    "gm_cusum_neg": "gross-margin shortfall CUSUM",
    "z12": "amount z vs 12m",
    "zyoy": "year-on-year z",
    "cusum_pos": "overspend CUSUM",
    "dpd_z": "days-past-due z",
}


def reasons(kind: str, r: pd.Series) -> list[str]:
    """Backwards-compatible model explanations; evidence shares these rules."""
    return [item["text"] for item in reason_details(kind, r)]

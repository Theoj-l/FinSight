"""Customer-month receivables features (the `cust` alert unit).

The position at each month end is *rebuilt* from invoices (ar_invoice: doc
date, due date, gross amount) and GL receipts (RECEIPT lines crediting 1200,
linked to their invoice by ref_no1 = doc_no). ar_invoice.outstanding is never
read: it is the balance at extract date, so using it for an earlier month
would leak the future.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..detectors import series as S
from ..loaders import Books
from ..schema import periods_between

AR_ACCOUNT = "1200"
OPEN_EPS = 0.01


def _month_ends(periods: list[int]) -> np.ndarray:
    first = pd.to_datetime([f"{p // 100}-{p % 100:02d}-01" for p in periods])
    return (first + pd.offsets.MonthEnd(0)).to_numpy()


def _receipts(books: Books) -> pd.DataFrame:
    gl = books.gl
    rec = gl[(gl["journal_type"] == "RECEIPT") & (gl["acc_no"] == AR_ACCOUNT)]
    rec = rec.assign(amount=rec["home_cr"] - rec["home_dr"])
    return (rec.groupby("ref_no1").agg(rec_date=("trans_date", "min"), rec_amt=("amount", "sum"))
               .rename_axis("doc_no").reset_index())


def cust_features(books: Books) -> pd.DataFrame:
    periods = periods_between(books.first_period, books.last_period)
    ends = _month_ends(periods)
    inv = books.ar.merge(_receipts(books), on="doc_no", how="left")
    inv["rec_amt"] = inv["rec_amt"].fillna(0.0)

    doc = inv["doc_date"].to_numpy()
    due = inv["due_date"].to_numpy()
    net = inv["local_net_total"].to_numpy(dtype=float)
    rdt = inv["rec_date"].to_numpy()          # NaT where never paid
    ramt = inv["rec_amt"].to_numpy(dtype=float)
    has_rec = ~pd.isna(inv["rec_date"]).to_numpy()
    cust = inv["debtor_code"].to_numpy()

    day = np.timedelta64(1, "D")
    rows = []
    for t, end in enumerate(ends):
        issued = doc <= end
        paid = has_rec & (rdt <= end)
        open_amt = np.where(issued, net - np.where(paid, ramt, 0.0), 0.0)
        # Lateness is measured on *wholly unpaid* invoices. Short-payment
        # residuals (an invoice settled 80–97%) stay open indefinitely and would
        # otherwise dominate days-past-due; they are a dispute, not delinquency.
        unpaid = issued & ~paid
        dpd = np.where(unpaid, np.maximum((end - due) / day, 0.0), 0.0)
        unpaid_amt = np.where(unpaid, net, 0.0)
        billed90 = np.where(issued & (doc > end - 90 * day), net, 0.0)
        recv90 = np.where(paid & (rdt > end - 90 * day), ramt, 0.0)
        rows.append(pd.DataFrame({
            "key": cust, "t": t, "open": open_amt, "unpaid": unpaid_amt, "is_open": unpaid,
            "od30": np.where(dpd > 30, unpaid_amt, 0.0), "od90": np.where(dpd > 90, unpaid_amt, 0.0),
            "dpd_w": unpaid_amt * dpd, "billed90": billed90, "recv90": recv90,
            "n_od30": unpaid & (dpd > 30),
        }))
    long = pd.concat(rows, ignore_index=True)
    g = long.groupby(["key", "t"]).sum().reset_index()

    # receipt history per customer: last receipt, typical gap, typical lateness
    rec = inv[has_rec][["debtor_code", "rec_date", "due_date"]].sort_values("rec_date")
    hist_rows = []
    for c, r in rec.groupby("debtor_code"):
        dates = r["rec_date"].to_numpy()
        lags = ((r["rec_date"] - r["due_date"]).dt.days).to_numpy(dtype=float)
        for t, end in enumerate(ends):
            k = int(np.searchsorted(dates, end, side="right"))
            if k == 0:
                continue
            gaps = np.diff(dates[:k]) / day
            hist_rows.append((c, t, (end - dates[k - 1]) / day,
                              float(np.median(gaps)) if len(gaps) else np.nan,
                              float(np.median(lags[:k]))))
    hist = pd.DataFrame(hist_rows, columns=["key", "t", "days_since_receipt", "typical_gap", "hist_lag"])
    g = g.merge(hist, on=["key", "t"], how="left")

    with np.errstate(divide="ignore", invalid="ignore"):
        g["overdue30_share"] = np.where(g["unpaid"] > OPEN_EPS, g["od30"] / g["unpaid"], 0.0)
        g["overdue90_share"] = np.where(g["unpaid"] > OPEN_EPS, g["od90"] / g["unpaid"], 0.0)
        g["wavg_dpd"] = np.where(g["unpaid"] > OPEN_EPS, g["dpd_w"] / g["unpaid"], 0.0)
        g["collect_ratio_90"] = np.where(g["billed90"] > 0, g["recv90"] / g["billed90"], np.nan)
        g["gap_ratio"] = g["days_since_receipt"] / np.maximum(g["typical_gap"], 7.0)
    g["log_outstanding"] = np.log10(g["open"].clip(lower=0) + 1.0)
    g["log_billed_90"] = np.log10(g["billed90"] + 1.0)
    g["dpd_excess"] = g["wavg_dpd"] - g["hist_lag"].clip(lower=0)
    g = g.rename(columns={"is_open": "n_open", "n_od30": "n_overdue30"})

    parts = []
    for _, c in g.sort_values("t").groupby("key", sort=False):
        c = c.copy()
        dense = np.full(len(periods), np.nan)
        dense[c["t"].to_numpy()] = c["wavg_dpd"].to_numpy()
        c["dpd_z"] = S.robust_z(dense, rel_floor=0.0, abs_floor=5.0)[c["t"].to_numpy()]
        lo = np.full(len(periods), np.nan)
        lo[c["t"].to_numpy()] = c["log_outstanding"].to_numpy()
        prev = np.concatenate([np.full(3, np.nan), lo[:-3]])
        c["out_growth_3m"] = (lo - prev)[c["t"].to_numpy()]
        parts.append(c)
    g = pd.concat(parts, ignore_index=True)

    g["period_no"] = [periods[t] for t in g["t"]]
    live = (g["open"] > OPEN_EPS) | (g["billed90"] > 0)
    return (g[live].drop(columns=["t", "od30", "od90", "dpd_w", "recv90", "billed90", "unpaid"])
             .reset_index(drop=True))

"""Consistency checks. Hard checks must pass or the run aborts; soft checks are
reported for information."""
from __future__ import annotations

import pandas as pd

from . import config as C
from . import reference as R

TOL = 0.01


def run_checks(t: dict) -> tuple[bool, list[str]]:
    out: list[str] = []
    hard_ok = True

    def hard(name, cond, detail=""):
        nonlocal hard_ok
        mark = "PASS" if cond else "FAIL"
        if not cond:
            hard_ok = False
        out.append(f"[{mark}] {name}{(' — ' + detail) if detail else ''}")

    def soft(name, detail):
        out.append(f"[INFO] {name} — {detail}")

    gl = pd.DataFrame(t["gl_dtl"])
    iv = pd.DataFrame(t["iv"])
    ivd = pd.DataFrame(t["iv_dtl"])
    ar = pd.DataFrame(t["ar_invoice"])
    pb = pd.DataFrame(t["pbalance"])

    # 1. every journal balances
    j = gl.groupby("gl_trx_id")[["home_dr", "home_cr"]].sum()
    bad = j[(j["home_dr"] - j["home_cr"]).abs() > TOL]
    hard("every journal balances", bad.empty, f"{len(bad)} unbalanced")

    # 2. global trial balance
    gd, gc = gl["home_dr"].sum(), gl["home_cr"].sum()
    hard("global debits == credits", abs(gd - gc) < 0.5, f"dr {gd:,.2f} cr {gc:,.2f}")

    # 3. trial balance per period
    gl["_p"] = gl["trans_date"].map(lambda d: d.year * 100 + d.month)
    per = gl.groupby("_p").apply(lambda x: x["home_dr"].sum() - x["home_cr"].sum())
    hard("each period's trial balance nets to zero", (per.abs() < 0.5).all(),
         f"max off {per.abs().max():,.2f}")

    # 4. invoice line sums tie to header
    ld = ivd.groupby("doc_key")[["local_sub_total", "local_total_cost"]].sum().round(2)
    j = iv.set_index("doc_key")[["local_ex_tax", "local_total_cost"]].join(ld, rsuffix="_line")
    rev_off = (j["local_sub_total"] - j["local_ex_tax"]).abs()
    cost_off = (j["local_total_cost_line"] - j["local_total_cost"]).abs()
    hard("iv line revenue ties to header (local_ex_tax)", (rev_off < TOL).all(),
         f"max off {rev_off.max():.4f}")
    hard("iv line cost ties to header (local_total_cost)", (cost_off < TOL).all(),
         f"max off {cost_off.max():.4f}")

    # 5. AR outstanding column is consistent
    od = (ar["local_net_total"] - ar["local_payment_amt"] - ar["outstanding"]).abs()
    hard("ar_invoice.outstanding == net_total - payment_amt", (od < TOL).all(),
         f"max off {od.max():.4f}")

    # 6. AR control reconciliation to GL 1200 (excluding the injected unbilled
    #    revenue_cutoff accruals, which legitimately sit in 1200 with no
    #    sub-ledger invoice). The amount comes from the anomaly plan — the
    #    ledger itself carries no marker.
    log = t.get("_anomaly_log", [])
    cutoffs = [a for a in log if a["subtype"] == "revenue_cutoff"]
    accrual = sum(a["actual_amount"] for a in cutoffs)
    ar_out = ar.loc[~ar["cancelled"], "outstanding"].sum()
    g1200 = gl[gl["acc_no"] == "1200"]
    gl_1200 = g1200["home_dr"].sum() - g1200["home_cr"].sum()
    hard("SUM(ar outstanding) == GL 1200 less unbilled cut-off accruals",
         abs(ar_out - (gl_1200 - accrual)) < 1.0,
         f"ar {ar_out:,.2f} vs gl {gl_1200:,.2f} (accruals {accrual:,.2f}, n={len(cutoffs)})")

    # 7. pbalance == gl aggregation
    reagg = (gl.assign(period_no=gl["_p"])
               .groupby(["period_no", "acc_no", "dept_no"])[["home_dr", "home_cr"]]
               .sum().round(2).reset_index())
    merged = reagg.merge(pb, on=["period_no", "acc_no", "dept_no"], how="outer",
                         suffixes=("_gl", "_pb")).fillna(0.0)
    dd = (merged["home_dr_gl"] - merged["home_dr_pb"]).abs().max()
    dc = (merged["home_cr_gl"] - merged["home_cr_pb"]).abs().max()
    hard("pbalance reproduces gl_dtl aggregation", max(dd, dc) < TOL,
         f"max off dr {dd:.4f} cr {dc:.4f}")

    # 8. referential integrity
    accs = {a[0] for a in R.ACCOUNTS}
    depts = {d[0] for d in C.DEPARTMENTS}
    debtors = {d["acc_no"] for d in t["debtor"]}
    items = {i["item_code"] for i in t["item"]}
    ivkeys = set(iv["doc_key"])
    hard("gl_dtl.acc_no all in gl_mast", set(gl["acc_no"]).issubset(accs),
         str(set(gl["acc_no"]) - accs))
    hard("gl_dtl.dept_no all in dept", set(gl["dept_no"]).issubset(depts),
         str(set(gl["dept_no"]) - depts))
    hard("iv.debtor_code all in debtor", set(iv["debtor_code"]).issubset(debtors))
    hard("ar_invoice.debtor_code all in debtor", set(ar["debtor_code"]).issubset(debtors))
    hard("iv_dtl.doc_key all in iv", set(ivd["doc_key"]).issubset(ivkeys))
    hard("iv_dtl.item_code all in item", set(ivd["item_code"]).issubset(items))

    # 9. not-null on NOT NULL columns
    nn = {
        "gl_dtl": ["gl_dtl_key", "gl_trx_id", "acc_no", "dept_no", "trans_date",
                   "journal_type", "home_dr", "home_cr"],
        "iv": ["doc_key", "doc_no", "debtor_code", "doc_date", "local_ex_tax",
               "local_net_total", "local_total_cost", "cancelled"],
        "ar_invoice": ["doc_key", "doc_no", "debtor_code", "doc_date", "due_date",
                       "local_net_total", "local_payment_amt", "outstanding", "cancelled"],
    }
    for tbl, cols in nn.items():
        dfx = pd.DataFrame(t[tbl])
        nulls = {c: int(dfx[c].isna().sum()) for c in cols if dfx[c].isna().any()}
        hard(f"{tbl}: NOT NULL columns populated", not nulls, str(nulls))

    # 10. document numbers are unique (receipts link to invoices via ref_no1 = doc_no)
    hard("iv.doc_no unique", not iv["doc_no"].duplicated().any(),
         f"{int(iv['doc_no'].duplicated().sum())} duplicates")
    hard("ar_invoice.doc_no unique", not ar["doc_no"].duplicated().any(),
         f"{int(ar['doc_no'].duplicated().sum())} duplicates")

    # 11. keys follow the calendar: gl_trx_id order never goes back in time
    trx = gl.groupby("gl_trx_id")["trans_date"].agg(["min", "max"]).sort_index()
    hard("each journal has one trans_date", (trx["min"] == trx["max"]).all())
    hard("gl_trx_id is in trans_date order", trx["min"].is_monotonic_increasing)
    hard("gl_dtl_key is in gl_trx_id order", gl["gl_trx_id"].is_monotonic_increasing)

    # 12. leakage guards: injected journals use only normal bookkeeping conventions
    combos = set(zip(gl["journal_type"], gl["source_type"], strict=True))
    allowed = {("OPENING", "O"), ("SALES", "I"), ("RECEIPT", "R"),
               ("PAYMENT", "P"), ("GENERAL", "J")}
    hard("journal_type/source_type pairs are all conventional", combos <= allowed,
         str(combos - allowed))
    refs = gl["ref_no1"].dropna().astype(str)
    leaky = refs[refs.str.match(r"^(ANOM|DUP)")]
    hard("no anomaly markers in ref_no1", leaky.empty, str(sorted(set(leaky))))

    # 13. GL revenue ties to the sales sub-ledger for every dept-month except
    #     exactly the injected revenue cut-offs
    rev_types = {a[0]: a[2] for a in R.ACCOUNTS}
    glrev = gl[gl["acc_no"].map(lambda a: rev_types.get(a) == "RE")].copy()
    glrev_m = (glrev.groupby(["_p", "dept_no"])
               .apply(lambda x: x["home_cr"].sum() - x["home_dr"].sum())
               .rename("gl_rev"))
    ivd_p = ivd.merge(iv[["doc_key", "doc_date"]], on="doc_key")
    ivd_p["_p"] = ivd_p["doc_date"].map(lambda d: d.year * 100 + d.month)
    ivrev_m = ivd_p.groupby(["_p", "dept_no"])["local_sub_total"].sum().rename("iv_rev")
    cmp = pd.concat([glrev_m, ivrev_m], axis=1).fillna(0.0)
    cmp["diff"] = (cmp["gl_rev"] - cmp["iv_rev"]).round(2)
    breaks = cmp[cmp["diff"].abs() > 1.0]
    expected = {(a["period_start"], a["affected_dept"]) for a in cutoffs}
    hard("GL revenue vs sales sub-ledger differs only at injected cut-offs",
         set(breaks.index) == expected,
         f"{len(breaks)} dept-month(s) differ, {len(expected)} expected. "
         + "; ".join(f"{i}:{v:,.0f}" for i, v in breaks["diff"].items()))

    # --- soft / informational ---
    by_sub: dict[str, int] = {}
    for a in log:
        by_sub[a["subtype"]] = by_sub.get(a["subtype"], 0) + 1
    soft("labelled anomalies", f"{len(log)} — "
         + ", ".join(f"{k}={v}" for k, v in sorted(by_sub.items())))
    if t.get("_decoy_log"):
        soft("unlabelled look-alikes (decoys)", str(len(t["_decoy_log"])))

    bank = gl.loc[gl["acc_no"] == "1010"].sort_values("trans_date")
    bank_bal = (bank["home_dr"] - bank["home_cr"]).cumsum() + 0
    soft("bank (1010) balance range", f"{bank_bal.min():,.0f} .. {bank_bal.max():,.0f}")

    soft("row counts", ", ".join(f"{k}={len(v):,}" for k, v in t.items()
                                 if isinstance(v, list)))
    return hard_ok, out

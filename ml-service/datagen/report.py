"""Human-readable summary of a generated dataset (written to output/SUMMARY.md)."""
from __future__ import annotations

import pandas as pd

from . import config as C
from . import reference as R

ACC_TYPE = {a: t for (a, d, t, p) in R.ACCOUNTS}
ACC_NAME = {a: d for (a, d, t, p) in R.ACCOUNTS}
BU_NAME = {b.code: b.name for b in C.BUSINESS_UNITS}


def _fmt(x):
    return f"{x:,.0f}"


def summary(t: dict, seed: int) -> str:
    gl = pd.DataFrame(t["gl_dtl"])
    iv = pd.DataFrame(t["iv"])
    ar = pd.DataFrame(t["ar_invoice"])
    gl["year"] = gl["trans_date"].map(lambda d: d.year)
    gl["net"] = gl["home_cr"] - gl["home_dr"]           # credit-positive
    gl["atype"] = gl["acc_no"].map(ACC_TYPE)

    L = []
    L.append("# TSH Group synthetic dataset — summary\n")
    mode = t.get("_meta", {}).get("anomalies", "canonical")
    L.append(f"- Generated with seed `{seed}`, phase {C.PHASE}, dataset v{C.DATASET_VERSION}, "
             f"anomalies `{mode}`")
    L.append(f"- Window: {C.START} .. {C.AS_OF}  ({C.CURRENCY})")
    L.append("- period_no convention: `YYYYMM` (e.g. 202503 = March 2025)\n")

    L.append("## Row counts\n")
    for k, v in t.items():
        if isinstance(v, list):
            L.append(f"- `{k}`: {len(v):,}")
    L.append("")

    # P&L by year
    L.append("## Profit & loss by fiscal year (SGD)\n")
    L.append("| FY | Revenue | Cost of sales | Gross profit | GP % | Opex | PBT |")
    L.append("|----|--------:|--------------:|-------------:|-----:|-----:|----:|")
    for y in sorted(gl["year"].unique()):
        gy = gl[gl["year"] == y]
        rev = gy.loc[gy["atype"].isin(["RE", "OI"]), "net"].sum()
        cos = -gy.loc[gy["atype"] == "CS", "net"].sum()
        opex = -gy.loc[gy["atype"] == "EX", "net"].sum()
        gp = rev - cos
        pbt = gp - opex
        gpp = (gp / rev * 100) if rev else 0
        tag = " (part yr)" if y == C.AS_OF.year else ""
        L.append(f"| FY{y}{tag} | {_fmt(rev)} | {_fmt(cos)} | {_fmt(gp)} | "
                 f"{gpp:.1f}% | {_fmt(opex)} | {_fmt(pbt)} |")
    L.append("")

    # Revenue by BU by year
    L.append("## Revenue by business unit (SGD)\n")
    rev = gl[gl["atype"] == "RE"].copy()
    piv = rev.pivot_table(index="dept_no", columns="year", values="net",
                          aggfunc="sum", fill_value=0.0)
    L.append("| BU | " + " | ".join(f"FY{c}" for c in piv.columns) + " |")
    L.append("|----|" + "----:|" * len(piv.columns))
    for bu, r in piv.iterrows():
        L.append(f"| {bu} {BU_NAME.get(bu, '')} | "
                 + " | ".join(_fmt(x) for x in r.values) + " |")
    L.append("")

    # Gross margin by BU by year
    L.append("## Gross margin % by business unit\n")
    cos = gl[gl["atype"] == "CS"].copy()
    rp = rev.groupby(["dept_no", "year"])["net"].sum()
    cp = (-cos.groupby(["dept_no", "year"])["net"].sum())
    gm = ((rp - cp) / rp * 100).unstack().round(1)
    L.append("| BU | " + " | ".join(f"FY{c}" for c in gm.columns) + " |")
    L.append("|----|" + "----:|" * len(gm.columns))
    for bu, r in gm.iterrows():
        L.append(f"| {bu} | " + " | ".join(f"{x:.1f}%" if pd.notna(x) else "-"
                                           for x in r.values) + " |")
    L.append("")

    # AR aging as of AS_OF
    L.append(f"## Accounts receivable aging as at {C.AS_OF}\n")
    live = ar[(~ar["cancelled"]) & (ar["outstanding"] > 0.005)].copy()
    live["days"] = live["due_date"].map(lambda d: (C.AS_OF - d).days)
    buckets = [("Not yet due", -10_000, 0), ("1–30", 1, 30), ("31–60", 31, 60),
               ("61–90", 61, 90), ("90+", 91, 10_000)]
    L.append("| Bucket | Invoices | Outstanding |")
    L.append("|--------|---------:|------------:|")
    for name, lo, hi in buckets:
        s = live[(live["days"] >= lo) & (live["days"] <= hi)]
        L.append(f"| {name} | {len(s):,} | {_fmt(s['outstanding'].sum())} |")
    L.append(f"| **Total** | {len(live):,} | {_fmt(live['outstanding'].sum())} |")
    dso = live["outstanding"].sum() / (iv["local_net_total"].sum() /
                                       ((C.AS_OF - C.START).days)) if len(iv) else 0
    L.append(f"\nApprox. DSO at period end: **{dso:.0f} days**\n")

    # Bank balance path
    bank = gl[gl["acc_no"] == "1010"].sort_values("trans_date")
    bb = (bank["home_dr"] - bank["home_cr"]).cumsum()
    L.append("## Cash / bank (account 1010)\n")
    L.append(f"- Opening: {_fmt(C.OPENING['1010'])}")
    L.append(f"- Range over the window: {_fmt(bb.min())} .. {_fmt(bb.max())}")
    L.append(f"- Closing at {C.AS_OF}: {_fmt(bb.iloc[-1])}\n")

    # Anomalies
    L.append("## Injected anomalies (labels in `datagen.anomaly_log`)\n")
    log = t["_anomaly_log"]
    L.append("| id | category | subtype | severity | difficulty | periods | dept | account | customer |")
    L.append("|----|----------|---------|----------|------------|---------|------|---------|----------|")
    for a in log:
        L.append(f"| {a['anomaly_id']} | {a['category']} | {a['subtype']} | "
                 f"{a['severity']} | {a.get('difficulty', '')} | "
                 f"{a['period_start']}–{a['period_end']} | {a.get('affected_dept') or ''} | "
                 f"{a.get('affected_account') or ''} | {a.get('affected_customer') or ''} |")
    L.append("")
    decoys = t.get("_decoy_log") or []
    if decoys:
        kinds: dict[str, int] = {}
        for d in decoys:
            kinds[d["kind"]] = kinds.get(d["kind"], 0) + 1
        L.append("## Unlabelled look-alikes (decoys, `decoy_log.csv`)\n")
        L.append("Normal business events that superficially resemble anomalies; "
                 "they are deliberately **not** labelled.\n")
        for k, v in sorted(kinds.items()):
            L.append(f"- `{k}`: {v}")
        L.append("")
    return "\n".join(L)

"""Anomaly plan for Phase 1.

Anomalies are injected into the *generation*, but their labels live only in the
`datagen.anomaly_log` table — never in the 17 AutoCount tables. Ten labelled
anomalies spanning revenue, margin, expense, posting-error and receivables.

Each log row:
  anomaly_id, category, subtype, severity, period_start, period_end,
  affected_table, affected_dept, affected_account, affected_customer,
  baseline_amount, actual_amount, deviation_pct, description, detection_hint
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class AnomalyPlan:
    revenue_mult: dict = field(default_factory=dict)      # (bu, yyyymm) -> multiplier
    margin_override: dict = field(default_factory=dict)   # (bu, yyyymm) -> gross margin
    stop_paying: dict = field(default_factory=dict)       # customer acc -> date (due >= -> unpaid)
    extra_gl: list = field(default_factory=list)          # dicts: date, jtype, ref, desc, lines
    post_hooks: dict = field(default_factory=dict)        # yyyymm -> [callable(Ledger)]
    log: list = field(default_factory=list)

    def gl_trans_date(self, bu: str, ym: int, seq: int, doc_date: date) -> date:
        return doc_date


def _ym(y: int, m: int) -> int:
    return y * 100 + m


def _span(y0, m0, y1, m1):
    out = []
    y, m = y0, m0
    while (y, m) <= (y1, m1):
        out.append(_ym(y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def build_plan(rng, masters) -> AnomalyPlan:
    p = AnomalyPlan()
    debtor_meta = masters["debtor_meta"]
    by_bu = {}
    for acc, meta in debtor_meta.items():
        by_bu.setdefault(meta["primary_bu"], []).append(acc)

    def add(**kw):
        kw.setdefault("affected_dept", None)
        kw.setdefault("affected_account", None)
        kw.setdefault("affected_customer", None)
        kw.setdefault("baseline_amount", None)
        kw.setdefault("actual_amount", None)
        kw.setdefault("deviation_pct", None)
        kw["anomaly_id"] = f"A{len(p.log) + 1:02d}"
        p.log.append(kw)

    # 1 — Revenue spike: Heavy Lift one-off mega project, Jul 2023
    p.revenue_mult[("HL", _ym(2023, 7))] = 2.6
    add(category="revenue", subtype="one_off_spike", severity="high",
        period_start=_ym(2023, 7), period_end=_ym(2023, 7),
        affected_table="iv", affected_dept="HL", affected_account="4200",
        baseline_amount=880_000, actual_amount=2_290_000, deviation_pct=160.0,
        description="Heavy Lift & Haulage revenue in Jul 2023 is ~2.6x its trend "
                    "due to a single large project award.",
        detection_hint="Monthly revenue for dept HL / account 4200 is a large "
                       "positive outlier vs its own trend and seasonality.")

    # 2 — Revenue drop: Engineering loses a key client, Mar–Aug 2024
    for ym in _span(2024, 3, 2024, 8):
        p.revenue_mult[("EN", ym)] = 0.68
    add(category="revenue", subtype="sustained_drop", severity="high",
        period_start=_ym(2024, 3), period_end=_ym(2024, 8),
        affected_table="iv", affected_dept="EN", affected_account="4300",
        baseline_amount=620_000, actual_amount=420_000, deviation_pct=-32.0,
        description="Engineering Services revenue falls ~32% for six months after "
                    "losing a major framework client; partial recovery afterwards.",
        detection_hint="Sustained negative level shift in dept EN / account 4300 "
                       "revenue starting 2024-03.")

    # 3 — Gross-margin collapse: Crane Rental cost overrun, Sep 2022
    p.margin_override[("CR", _ym(2022, 9))] = 0.10
    add(category="margin", subtype="cost_overrun", severity="high",
        period_start=_ym(2022, 9), period_end=_ym(2022, 9),
        affected_table="gl_dtl", affected_dept="CR", affected_account="5100",
        baseline_amount=0.34, actual_amount=0.10, deviation_pct=-70.0,
        description="Crane Rental gross margin drops from ~34% to ~10% in Sep 2022 "
                    "(equipment breakdown + subcontracted replacement capacity).",
        detection_hint="Ratio of account 5100 to 4100 for dept CR spikes for one "
                       "month; gross profit dips while revenue is normal.")

    # 4 — Duplicate supplier payment, Nov 2023
    p.extra_gl.append(dict(
        date=date(2023, 11, 14), jtype="PAYMENT", ref="DUP-AP",
        desc="Supplier payment (duplicate)",
        lines=[("2100", "CP", 84_500.00), ("1010", "CP", -84_500.00)]))
    add(category="expense", subtype="duplicate_payment", severity="medium",
        period_start=_ym(2023, 11), period_end=_ym(2023, 11),
        affected_table="gl_dtl", affected_dept="CP", affected_account="1010",
        baseline_amount=0, actual_amount=84_500, deviation_pct=None,
        description="A supplier payment of 84,500 is posted twice on 2023-11-14, "
                    "overstating cash outflow and understating trade payables.",
        detection_hint="Two identical Cr 1010 / Dr 2100 lines on the same day and "
                       "amount; bank balance step-down not matched by expense.")

    # 5 — Oversized one-off expense, Mar 2025
    p.extra_gl.append(dict(
        date=date(2025, 3, 19), jtype="PAYMENT", ref="ANOM-REPAIR",
        desc="Major crane structural repair",
        lines=[("6800", "CP", 208_000.00), ("1010", "CP", -208_000.00)]))
    add(category="expense", subtype="outlier_charge", severity="high",
        period_start=_ym(2025, 3), period_end=_ym(2025, 3),
        affected_table="gl_dtl", affected_dept="CP", affected_account="6800",
        baseline_amount=19_000, actual_amount=227_000, deviation_pct=1094.0,
        description="Motor vehicle / equipment expense (6800) in Mar 2025 is ~12x "
                    "normal from a single 208,000 structural repair charge.",
        detection_hint="Account 6800 monthly total is an extreme positive outlier.")

    # 6 — Misclassified cost: Transport cost booked to Fabrication dept, Jun 2024
    p.extra_gl.append(dict(
        date=date(2024, 6, 25), jtype="GENERAL", ref="ANOM-RECLASS",
        desc="Subcontractor haulage costs",
        lines=[("5400", "FA", 138_000.00), ("2100", "CP", -138_000.00)]))
    add(category="posting_error", subtype="wrong_department", severity="medium",
        period_start=_ym(2024, 6), period_end=_ym(2024, 6),
        affected_table="gl_dtl", affected_dept="FA", affected_account="5400",
        baseline_amount=0, actual_amount=138_000, deviation_pct=None,
        description="138,000 of Transport direct cost (account 5400) is posted "
                    "against dept FA instead of TP in Jun 2024.",
        detection_hint="Account 5400 (a Transport cost account) has activity under "
                       "dept FA, which has no Transport revenue; FA margin looks wrong.")

    # 7 — Revenue cut-off error: GL revenue with no supporting invoice, Dec 2024
    p.extra_gl.append(dict(
        date=date(2024, 12, 28), jtype="SALES", ref="ANOM-CUTOFF",
        desc="Engineering revenue accrual (unbilled)",
        lines=[("1200", "CP", 185_000.00), ("4300", "EN", -185_000.00)]))
    add(category="posting_error", subtype="revenue_cutoff", severity="medium",
        period_start=_ym(2024, 12), period_end=_ym(2024, 12),
        affected_table="gl_dtl", affected_dept="EN", affected_account="4300",
        baseline_amount=0, actual_amount=185_000, deviation_pct=None,
        description="185,000 of Engineering revenue is booked directly to the GL "
                    "on 2024-12-28 with no matching sales invoice (iv).",
        detection_hint="GL revenue for dept EN / account 4300 in Dec 2024 exceeds "
                       "SUM(iv.local_ex_tax) for the same dept/month.")

    # 8 — Round-number manual plug, Dec 2022
    p.extra_gl.append(dict(
        date=date(2022, 12, 30), jtype="GENERAL", ref="ANOM-PLUG",
        desc="Year-end adjustment",
        lines=[("6900", "CP", 100_000.00), ("2200", "CP", -100_000.00)]))
    add(category="posting_error", subtype="round_number_journal", severity="low",
        period_start=_ym(2022, 12), period_end=_ym(2022, 12),
        affected_table="gl_dtl", affected_dept="CP", affected_account="6900",
        baseline_amount=None, actual_amount=100_000, deviation_pct=None,
        description="A manual journal of exactly 100,000.00 to sundry expense / "
                    "accruals on 2022-12-30 with a vague narrative.",
        detection_hint="Journal amount is a suspiciously exact round number; "
                       "narrative is generic; posted at period end.")

    # 9 — Receivables delinquency: a mid-size customer stops paying, from Sep 2024
    cand = sorted(by_bu.get("EN", []) + by_bu.get("FA", []))
    delinquent = cand[len(cand) // 2] if cand else sorted(debtor_meta)[0]
    p.stop_paying[delinquent] = date(2024, 9, 1)
    add(category="receivables", subtype="customer_delinquency", severity="high",
        period_start=_ym(2024, 9), period_end=_ym(2026, 8),
        affected_table="ar_invoice", affected_customer=delinquent,
        affected_account="1200",
        description=f"Customer {delinquent} stops settling invoices from Sep 2024; "
                    "their invoices accumulate unpaid into the 90+ day bucket.",
        detection_hint=f"debtor_code = {delinquent} has rising SUM(outstanding) and "
                       "no receipts after 2024-09; aging skews to 90+ days.")

    # 10 — Trading margin erosion: slow slide across 2024–2025
    span = _span(2024, 1, 2025, 12)
    for i, ym in enumerate(span):
        frac = i / (len(span) - 1)
        p.margin_override[("TR", ym)] = round(0.12 - 0.11 * frac, 4)
    add(category="margin", subtype="gradual_erosion", severity="medium",
        period_start=_ym(2024, 1), period_end=_ym(2025, 12),
        affected_table="gl_dtl", affected_dept="TR", affected_account="5600",
        baseline_amount=0.12, actual_amount=0.01, deviation_pct=-92.0,
        description="Equipment Trading gross margin erodes steadily from ~12% to "
                    "~1% over 2024–2025 as the unit is wound down.",
        detection_hint="Slow negative trend in TR gross margin (5600 vs 4600); "
                       "not a single-month outlier — needs a trend test.")

    return p

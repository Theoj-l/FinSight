"""Anomaly plans: the canonical A01–A10 showcase, or a randomised benchmark.

Anomalies are injected into the *generation*, but their labels live only in the
`datagen.anomaly_log` table — never in the 17 AutoCount tables.

Two modes (full rationale: training/anomaly/METHODOLOGY.md):

  canonical  The ten fixed anomalies A01–A10. This is the showcase dataset that
             `--load` puts in Supabase.
  random     2–5 instances of each of the ten templates at random location,
             timing and size. Used to build the training / validation / test
             benchmark.

Both modes also post benign look-alikes ("decoys") that are deliberately NOT
labelled — normal business that superficially resembles an anomaly. Random
choices (random-mode anomalies, all decoys) come from a *separate* RNG stream,
never from the simulation stream.

Leakage rule: an injected journal must look like a normal posting of the same
kind — same journal_type / source_type / ref_no1 / description vocabulary — so a
detector can only find it through its *accounting* signature (size, account-dept
coherence, reconciliation, timing), never through bookkeeping artefacts.

Each log row:
  anomaly_id, category, subtype, severity, period_start, period_end,
  affected_table, affected_dept, affected_account, affected_customer,
  baseline_amount, actual_amount, deviation_pct, description, detection_hint
plus generation-only keys (`difficulty`, `mode`) that are not written to the DB.
"""
from __future__ import annotations

import calendar
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

from . import config as C
from .engine import expected_opex, expected_revenue, regular_day

BU = {b.code: b for b in C.BUSINESS_UNITS}
BU_CODES = [b.code for b in C.BUSINESS_UNITS]
AS_OF_YM = C.AS_OF.year * 100 + C.AS_OF.month

# Random anomalies start after >= 12 months of clean history (a baseline for
# every detector) and point anomalies end before the last two months.
RANDOM_FIRST_YM = 202201
RANDOM_LAST_YM = 202606

# Opex accounts eligible for an outlier charge. 6900 (sundry) is excluded: its
# month-end accrual adjustments swing it by +/-50k, which swamps a 3-15x charge
# on a ~3k base. It stays eligible for duplicates, found by exact signature.
OUTLIER_OPEX = [a for a in C.CASH_OPEX_ACCOUNTS if a != "6900"]
ROUND_EXPENSE_ACCOUNTS = ["6900", "6220", "6500", "6600"]
ROUND_AMOUNTS = [25_000, 30_000, 40_000, 50_000, 60_000, 75_000, 80_000,
                 100_000, 120_000, 150_000, 200_000]

SEVERITY_BY_DIFFICULTY = {"easy": "high", "medium": "medium", "hard": "low"}


# --- YYYYMM helpers ----------------------------------------------------------
def ym_of(d: date) -> int:
    return d.year * 100 + d.month


def ym_add(ym: int, k: int) -> int:
    idx = (ym // 100) * 12 + (ym % 100 - 1) + k
    return (idx // 12) * 100 + idx % 12 + 1


def span(ym0: int, ym1: int) -> list[int]:
    out, ym = [], ym0
    while ym <= ym1:
        out.append(ym)
        ym = ym_add(ym, 1)
    return out


def _ym_parts(ym: int) -> tuple[int, int]:
    return ym // 100, ym % 100


def _label(ym: int) -> str:
    y, m = _ym_parts(ym)
    return f"{calendar.month_abbr[m]} {y}"


def _money(x: float) -> str:
    return f"{x:,.0f}"


# --- The plan ----------------------------------------------------------------
@dataclass
class AnomalyPlan:
    mode: str = "canonical"
    revenue_mult: dict = field(default_factory=dict)      # (bu, yyyymm) -> multiplier
    margin_override: dict = field(default_factory=dict)   # (bu, yyyymm) -> gross margin
    stop_paying: dict = field(default_factory=dict)       # customer acc -> date (due >= -> unpaid)
    extra_gl: list = field(default_factory=list)          # dicts: date, jtype, stype, ref, desc, lines
    post_hooks: dict = field(default_factory=dict)        # yyyymm -> [callable(Ledger)]
    log: list = field(default_factory=list)               # labelled anomalies -> datagen.anomaly_log
    decoys: list = field(default_factory=list)            # benign look-alikes (not labelled)
    taken: set = field(default_factory=set)               # occupied (kind, key, yyyymm) cells

    def gl_trans_date(self, bu: str, ym: int, seq: int, doc_date: date) -> date:
        return doc_date

    def extra_gl_for(self, ym: int) -> list[dict]:
        return [s for s in self.extra_gl if ym_of(s["date"]) == ym]

    def unbilled_accruals(self) -> float:
        """Revenue booked to 1200 with no sales invoice (revenue_cutoff anomalies)."""
        return sum(a["actual_amount"] for a in self.log if a["subtype"] == "revenue_cutoff")

    # -- occupancy: keeps labels unambiguous (no two anomalies share a cell) --
    def is_free(self, cells: list[tuple], buffer: int = 1) -> bool:
        for kind, key, ym in cells:
            for k in range(-buffer, buffer + 1):
                if (kind, key, ym_add(ym, k) if ym else 0) in self.taken:
                    return False
        return True

    def claim(self, cells: list[tuple], buffer: int = 1) -> bool:
        if not self.is_free(cells, buffer):
            return False
        self.taken.update(cells)
        return True

    def add(self, **kw) -> dict:
        for k in ("affected_dept", "affected_account", "affected_customer",
                  "baseline_amount", "actual_amount", "deviation_pct"):
            kw.setdefault(k, None)
        diff = kw.setdefault("difficulty", "medium")
        kw.setdefault("severity", SEVERITY_BY_DIFFICULTY[diff])
        kw["mode"] = self.mode
        n = len(self.log) + 1
        kw["anomaly_id"] = f"A{n:02d}" if self.mode == "canonical" else f"R{n:03d}"
        self.log.append(kw)
        return kw


def cells_of(a: dict) -> set[tuple]:
    """The (kind, key, yyyymm) cells a labelled anomaly occupies: a customer, an
    account-month for Corporate (CP) postings, else a business-unit dept-month."""
    if a["affected_customer"]:
        return {("cust", a["affected_customer"], 0)}
    yms = span(a["period_start"], a["period_end"])
    if a["affected_dept"] == "CP":
        return {("acc", a["affected_account"], ym) for ym in yms}
    return {("dept", a["affected_dept"], ym) for ym in yms}


def _band(value: float, easy: float, hard: float) -> str:
    """Difficulty band for a magnitude. `easy`/`hard` are thresholds on the same
    scale; works for increasing (easy > hard) or decreasing (easy < hard) scales."""
    if easy > hard:
        return "easy" if value >= easy else ("hard" if value < hard else "medium")
    return "easy" if value <= easy else ("hard" if value > hard else "medium")


# --- Templates (shared by both modes) ----------------------------------------
def revenue_spike(p: AnomalyPlan, bu: str, ym: int, mult: float,
                  cause: str = "a one-off project", **kw) -> dict:
    b = BU[bu]
    p.revenue_mult[(bu, ym)] = mult
    base = expected_revenue(bu, *_ym_parts(ym))
    return p.add(
        category="revenue", subtype="one_off_spike",
        period_start=ym, period_end=ym, affected_table="iv",
        affected_dept=bu, affected_account=b.rev_code,
        baseline_amount=round(base, -3), actual_amount=round(base * mult, -3),
        deviation_pct=round((mult - 1) * 100, 1),
        difficulty=kw.pop("difficulty", _band(mult, 2.0, 1.5)),
        description=f"{b.name} revenue in {_label(ym)} is ~{mult:.1f}x its trend due to {cause}.",
        detection_hint=f"Monthly revenue for dept {bu} / account {b.rev_code} is a large "
                       "positive outlier vs its own trend and seasonality.", **kw)


def revenue_drop(p: AnomalyPlan, bu: str, ym0: int, ym1: int, mult: float,
                 cause: str = "the loss of a key client", **kw) -> dict:
    b = BU[bu]
    for ym in span(ym0, ym1):
        p.revenue_mult[(bu, ym)] = mult
    base = expected_revenue(bu, *_ym_parts(ym0))
    n = len(span(ym0, ym1))
    return p.add(
        category="revenue", subtype="sustained_drop",
        period_start=ym0, period_end=ym1, affected_table="iv",
        affected_dept=bu, affected_account=b.rev_code,
        baseline_amount=round(base, -3), actual_amount=round(base * mult, -3),
        deviation_pct=round((mult - 1) * 100, 1),
        difficulty=kw.pop("difficulty", _band(mult, 0.70, 0.80)),
        description=f"{b.name} revenue falls ~{(1 - mult) * 100:.0f}% for {n} months "
                    f"from {_label(ym0)} after {cause}.",
        detection_hint=f"Sustained negative level shift in dept {bu} / account "
                       f"{b.rev_code} revenue starting {ym0}.", **kw)


def cost_overrun(p: AnomalyPlan, bu: str, ym: int, margin: float,
                 cause: str = "a cost overrun", **kw) -> dict:
    b = BU[bu]
    p.margin_override[(bu, ym)] = margin
    ratio = margin / b.gross_margin
    return p.add(
        category="margin", subtype="cost_overrun",
        period_start=ym, period_end=ym, affected_table="gl_dtl",
        affected_dept=bu, affected_account=b.cogs_code,
        baseline_amount=b.gross_margin, actual_amount=round(margin, 4),
        deviation_pct=round((ratio - 1) * 100, 1),
        difficulty=kw.pop("difficulty", _band(ratio, 0.40, 0.55)),
        description=f"{b.name} gross margin drops from ~{b.gross_margin:.0%} to "
                    f"~{margin:.0%} in {_label(ym)} ({cause}).",
        detection_hint=f"Ratio of account {b.cogs_code} to {b.rev_code} for dept {bu} "
                       "spikes for one month; gross profit dips while revenue is normal.", **kw)


def duplicate_payment(p: AnomalyPlan, acc: str, ym: int, day_offset: int = 0, **kw) -> dict:
    """Re-posts the month's real `Expense {acc}` payment journal — identical
    account, amount and narrative — `day_offset` days later."""
    y, m = _ym_parts(ym)
    pay_day = regular_day(y, m)
    dup_day = min(pay_day + timedelta(days=day_offset),
                  date(y, m, calendar.monthrange(y, m)[1]))
    desc = f"Expense {acc}"
    entry = p.add(
        category="expense", subtype="duplicate_payment",
        period_start=ym, period_end=ym, affected_table="gl_dtl",
        affected_dept="CP", affected_account=acc,
        deviation_pct=100.0,
        description=f"The {_label(ym)} payment for account {acc} is posted twice "
                    f"({pay_day} and {dup_day}), overstating expense and cash outflow.",
        detection_hint=f"Two identical Dr {acc} / Cr 1010 journals with the same amount "
                       "and narrative in one month; the account's monthly total doubles.", **kw)

    def hook(ledger) -> None:
        orig = next(r for r in ledger.gl
                    if r["acc_no"] == acc and r["description"] == desc
                    and r["trans_date"] == pay_day)
        amt = orig["home_dr"]
        ledger.post(dup_day, "PAYMENT", "P", None, desc,
                    [(acc, "CP", amt), ("1010", "CP", -amt)])
        entry["baseline_amount"] = amt
        entry["actual_amount"] = round(2 * amt, 2)
        if "difficulty" not in kw:
            entry["difficulty"] = _band(amt, 20_000, 5_000)
            entry["severity"] = SEVERITY_BY_DIFFICULTY[entry["difficulty"]]

    p.post_hooks.setdefault(ym, []).append(hook)
    return entry


def outlier_charge(p: AnomalyPlan, acc: str, d: date, amount: float,
                   cause: str = "a single large one-off charge", **kw) -> dict:
    ym = ym_of(d)
    base = expected_opex(acc, d.year, d.month)
    p.extra_gl.append(dict(date=d, jtype="PAYMENT", stype="P", ref=None,
                           desc=f"Expense {acc}", lines=[(acc, "CP", amount), ("1010", "CP", -amount)]))
    factor = (base + amount) / base
    return p.add(
        category="expense", subtype="outlier_charge",
        period_start=ym, period_end=ym, affected_table="gl_dtl",
        affected_dept="CP", affected_account=acc,
        baseline_amount=round(base, -3), actual_amount=round(base + amount, -3),
        deviation_pct=round((factor - 1) * 100, 0),
        difficulty=kw.pop("difficulty", _band(factor, 8.0, 5.0)),
        description=f"Account {acc} expense in {_label(ym)} is ~{factor:.0f}x normal "
                    f"from {cause} of {_money(amount)}.",
        detection_hint=f"Account {acc} monthly total is an extreme positive outlier.", **kw)


def wrong_department(p: AnomalyPlan, src_bu: str, dst_dept: str, d: date, amount: float,
                     **kw) -> dict:
    src = BU[src_bu]
    dst_name = BU[dst_dept].name if dst_dept in BU else dst_dept
    ym = ym_of(d)
    p.extra_gl.append(dict(date=d, jtype="GENERAL", stype="J", ref=None,
                           desc="Direct cost accrual",
                           lines=[(src.cogs_code, dst_dept, amount), ("2100", "CP", -amount)]))
    return p.add(
        category="posting_error", subtype="wrong_department",
        period_start=ym, period_end=ym, affected_table="gl_dtl",
        affected_dept=dst_dept, affected_account=src.cogs_code,
        baseline_amount=0, actual_amount=amount,
        difficulty=kw.pop("difficulty", _band(amount, 120_000, 60_000)),
        description=f"{_money(amount)} of {src.name} direct cost (account {src.cogs_code}) "
                    f"is posted against dept {dst_dept} ({dst_name}) instead of {src_bu} "
                    f"in {_label(ym)}.",
        detection_hint=f"Account {src.cogs_code} (a {src.name} cost account) has activity "
                       f"under dept {dst_dept}, which never uses it; {dst_dept} margin looks wrong.",
        **kw)


def revenue_cutoff(p: AnomalyPlan, bu: str, d: date, amount: float, **kw) -> dict:
    b = BU[bu]
    ym = ym_of(d)
    p.extra_gl.append(dict(date=d, jtype="GENERAL", stype="J", ref=None,
                           desc="Revenue accrual",
                           lines=[("1200", "CP", amount), (b.rev_code, bu, -amount)]))
    frac = amount / expected_revenue(bu, d.year, d.month)
    return p.add(
        category="posting_error", subtype="revenue_cutoff",
        period_start=ym, period_end=ym, affected_table="gl_dtl",
        affected_dept=bu, affected_account=b.rev_code,
        baseline_amount=0, actual_amount=amount,
        deviation_pct=round(frac * 100, 1),
        difficulty=kw.pop("difficulty", _band(frac, 0.20, 0.10)),
        description=f"{_money(amount)} of {b.name} revenue is booked directly to the GL "
                    f"on {d} with no matching sales invoice (iv).",
        detection_hint=f"GL revenue for dept {bu} / account {b.rev_code} in {_label(ym)} "
                       "exceeds SUM(iv.local_ex_tax) for the same dept/month.", **kw)


def round_number_journal(p: AnomalyPlan, acc: str, d: date, amount: float, **kw) -> dict:
    ym = ym_of(d)
    p.extra_gl.append(dict(date=d, jtype="GENERAL", stype="J", ref=None,
                           desc="Month-end accrual adjustment",
                           lines=[(acc, "CP", amount), ("2200", "CP", -amount)]))
    return p.add(
        category="posting_error", subtype="round_number_journal",
        period_start=ym, period_end=ym, affected_table="gl_dtl",
        affected_dept="CP", affected_account=acc,
        actual_amount=amount,
        difficulty=kw.pop("difficulty", _band(amount, 100_000, 50_000)),
        description=f"A manual journal of exactly {amount:,.2f} to account {acc} / "
                    f"accruals on {d}, posted at period end with a generic narrative.",
        detection_hint="Journal amount is a suspiciously exact round number, much larger "
                       "than the usual accrual adjustments; posted at period end.", **kw)


def customer_delinquency(p: AnomalyPlan, cust: str, stop: date, **kw) -> dict:
    p.stop_paying[cust] = stop
    return p.add(
        category="receivables", subtype="customer_delinquency",
        period_start=ym_of(stop), period_end=AS_OF_YM, affected_table="ar_invoice",
        affected_customer=cust, affected_account="1200",
        description=f"Customer {cust} stops settling invoices falling due from {stop}; "
                    "their invoices accumulate unpaid into the 90+ day bucket.",
        detection_hint=f"debtor_code = {cust} has rising SUM(outstanding) and no receipts "
                       f"after {ym_of(stop)}; aging skews to 90+ days.", **kw)


def margin_erosion(p: AnomalyPlan, bu: str, ym0: int, ym1: int, end_margin: float,
                   cause: str = "sustained pricing pressure", **kw) -> dict:
    b = BU[bu]
    months = span(ym0, ym1)
    for i, ym in enumerate(months):
        frac = i / (len(months) - 1)
        p.margin_override[(bu, ym)] = round(b.gross_margin - (b.gross_margin - end_margin) * frac, 4)
    ratio = end_margin / b.gross_margin
    return p.add(
        category="margin", subtype="gradual_erosion",
        period_start=ym0, period_end=ym1, affected_table="gl_dtl",
        affected_dept=bu, affected_account=b.cogs_code,
        baseline_amount=b.gross_margin, actual_amount=round(end_margin, 4),
        deviation_pct=round((ratio - 1) * 100, 1),
        difficulty=kw.pop("difficulty", _band(ratio, 0.25, 0.40)),
        description=f"{b.name} gross margin erodes steadily from ~{b.gross_margin:.0%} to "
                    f"~{end_margin:.0%} over {_label(ym0)}–{_label(ym1)} ({cause}).",
        detection_hint=f"Slow negative trend in {bu} gross margin ({b.cogs_code} vs "
                       f"{b.rev_code}); not a single-month outlier — needs a trend test.", **kw)


# --- Canonical plan: the showcase A01–A10 -------------------------------------
def _canonical(p: AnomalyPlan, masters: dict) -> None:
    debtor_meta = masters["debtor_meta"]
    revenue_spike(p, "HL", 202307, 2.6, cause="a single large project award",
                  severity="high", difficulty="easy")
    revenue_drop(p, "EN", 202403, 202408, 0.68,
                 cause="losing a major framework client; partial recovery afterwards",
                 severity="high", difficulty="easy")
    cost_overrun(p, "CR", 202209, 0.10,
                 cause="equipment breakdown + subcontracted replacement capacity",
                 severity="high", difficulty="easy")
    duplicate_payment(p, "6200", 202311, day_offset=0, severity="medium", difficulty="easy")
    outlier_charge(p, "6800", date(2025, 3, 19), 208_000.00,
                   cause="a single major crane structural repair",
                   severity="high", difficulty="easy")
    wrong_department(p, "TP", "FA", date(2024, 6, 25), 138_000.00,
                     severity="medium", difficulty="easy")
    revenue_cutoff(p, "EN", date(2024, 12, 28), 185_000.00,
                   severity="medium", difficulty="easy")
    round_number_journal(p, "6900", date(2022, 12, 30), 100_000.00,
                         severity="low", difficulty="easy")
    cand = sorted(a for a, m in debtor_meta.items() if m["primary_bu"] in ("EN", "FA"))
    delinquent = cand[len(cand) // 2] if cand else sorted(debtor_meta)[0]
    customer_delinquency(p, delinquent, date(2024, 9, 1), severity="high", difficulty="medium")
    margin_erosion(p, "TR", 202401, 202512, 0.01, cause="the unit is wound down",
                   severity="medium", difficulty="easy")


# --- Random plan: the benchmark -----------------------------------------------
# (template, min count, max count) — long-running templates get fewer instances
# so they can be packed without overlap.
RANDOM_COUNTS = {
    "one_off_spike": (2, 5), "sustained_drop": (1, 3), "cost_overrun": (2, 5),
    "duplicate_payment": (2, 5), "outlier_charge": (2, 5), "wrong_department": (2, 5),
    "revenue_cutoff": (2, 5), "round_number_journal": (2, 5),
    "customer_delinquency": (2, 4), "gradual_erosion": (1, 3),
}
DECOY_COUNTS = (3, 8)   # per decoy kind
_MAX_TRIES = 300


def _weekday_in(rng, ym: int, avoid: date | None = None) -> date:
    y, m = _ym_parts(ym)
    last = calendar.monthrange(y, m)[1]
    days = [date(y, m, d) for d in range(1, last + 1)
            if date(y, m, d).weekday() < 5 and date(y, m, d) != avoid]
    return days[int(rng.integers(0, len(days)))]


def _month_end_day(rng, ym: int) -> date:
    y, m = _ym_parts(ym)
    last = calendar.monthrange(y, m)[1]
    return date(y, m, last - int(rng.integers(0, 3)))


def _pick(rng, seq):
    return seq[int(rng.integers(0, len(seq)))]


def _place(p: AnomalyPlan, rng, n: int, propose: Callable) -> int:
    """Call propose() until it returns cells that are free, n times.
    propose() -> (cells, apply) where apply() records the anomaly."""
    placed = 0
    for _ in range(n):
        for _ in range(_MAX_TRIES):
            cells, apply = propose()
            if p.claim(cells):
                apply()
                placed += 1
                break
    return placed


def _random(p: AnomalyPlan, rng, masters: dict) -> None:
    months = span(RANDOM_FIRST_YM, RANDOM_LAST_YM)
    counts = {k: int(rng.integers(lo, hi + 1)) for k, (lo, hi) in RANDOM_COUNTS.items()}

    def dept_cells(bu, yms):
        return [("dept", bu, ym) for ym in yms]

    # long-running templates first so they can still find room
    def erosion():
        bu = _pick(rng, BU_CODES)
        length = int(rng.integers(9, 25))
        ym0 = _pick(rng, span(RANDOM_FIRST_YM, ym_add(AS_OF_YM, -(length - 1))))
        ym1 = ym_add(ym0, length - 1)
        end = BU[bu].gross_margin * float(rng.uniform(0.10, 0.50))
        return dept_cells(bu, span(ym0, ym1)), lambda: margin_erosion(p, bu, ym0, ym1, end)

    def drop():
        bu = _pick(rng, BU_CODES)
        length = int(rng.integers(3, 9))
        ym0 = _pick(rng, span(RANDOM_FIRST_YM, ym_add(AS_OF_YM, -(length - 1))))
        ym1 = ym_add(ym0, length - 1)
        mult = float(rng.uniform(0.62, 0.88))
        return dept_cells(bu, span(ym0, ym1)), lambda: revenue_drop(p, bu, ym0, ym1, mult)

    debtor_meta = masters["debtor_meta"]
    eligible_cust = sorted(a for a, m in debtor_meta.items() if m["segment"] != "chronic_late")

    def delinquency():
        cust = _pick(rng, eligible_cust)
        stop_ym = _pick(rng, span(202203, 202512))
        y, m = _ym_parts(stop_ym)
        avg = BU[debtor_meta[cust]["primary_bu"]].avg_invoice
        diff = "easy" if avg >= 40_000 else ("medium" if avg >= 20_000 else "hard")
        return ([("cust", cust, 0)],
                lambda: customer_delinquency(p, cust, date(y, m, 1), difficulty=diff))

    def spike():
        bu, ym = _pick(rng, BU_CODES), _pick(rng, months)
        mult = float(rng.uniform(1.25, 3.0))
        return dept_cells(bu, [ym]), lambda: revenue_spike(p, bu, ym, mult)

    def overrun():
        bu, ym = _pick(rng, BU_CODES), _pick(rng, months)
        margin = BU[bu].gross_margin * float(rng.uniform(0.25, 0.65))
        return dept_cells(bu, [ym]), lambda: cost_overrun(p, bu, ym, margin)

    def wrong_dept():
        src = _pick(rng, BU_CODES)
        dst = _pick(rng, [c for c in BU_CODES if c != src])
        ym = _pick(rng, months)
        d = _weekday_in(rng, ym)
        amount = round(float(rng.uniform(30_000, 200_000)), 2)
        return dept_cells(dst, [ym]), lambda: wrong_department(p, src, dst, d, amount)

    def cutoff():
        bu, ym = _pick(rng, BU_CODES), _pick(rng, months)
        d = _month_end_day(rng, ym)
        frac = float(rng.uniform(0.05, 0.30))
        amount = round(expected_revenue(bu, d.year, d.month) * frac, 2)
        return dept_cells(bu, [ym]), lambda: revenue_cutoff(p, bu, d, amount)

    def duplicate():
        acc, ym = _pick(rng, C.CASH_OPEX_ACCOUNTS), _pick(rng, months)
        off = int(rng.integers(0, 4))
        return [("acc", acc, ym)], lambda: duplicate_payment(p, acc, ym, day_offset=off)

    def outlier():
        acc, ym = _pick(rng, OUTLIER_OPEX), _pick(rng, months)
        y, m = _ym_parts(ym)
        d = _weekday_in(rng, ym, avoid=regular_day(y, m))
        factor = float(rng.uniform(3.0, 15.0))
        amount = round(expected_opex(acc, y, m) * (factor - 1), 2)
        return [("acc", acc, ym)], lambda: outlier_charge(p, acc, d, amount)

    def round_journal():
        acc, ym = _pick(rng, ROUND_EXPENSE_ACCOUNTS), _pick(rng, months)
        d = _month_end_day(rng, ym)
        amount = float(_pick(rng, ROUND_AMOUNTS))
        return [("acc", acc, ym)], lambda: round_number_journal(p, acc, d, amount)

    for name, fn in [("gradual_erosion", erosion), ("sustained_drop", drop),
                     ("customer_delinquency", delinquency), ("one_off_spike", spike),
                     ("cost_overrun", overrun), ("wrong_department", wrong_dept),
                     ("revenue_cutoff", cutoff), ("duplicate_payment", duplicate),
                     ("outlier_charge", outlier), ("round_number_journal", round_journal)]:
        _place(p, rng, counts[name], fn)


def _random_decoys(p: AnomalyPlan, rng, months: list[int]) -> None:
    """Benign events that superficially resemble anomalies. They are normal
    business, so they are NOT labelled; they only exist so a model cannot learn
    shortcuts such as "any manual journal / any second payment / any round
    amount is an anomaly". They avoid cells used by labelled anomalies."""

    def decoy(kind, d, jtype, stype, desc, lines, acc, dept):
        amount = max(a for _, _, a in lines)
        p.extra_gl.append(dict(date=d, jtype=jtype, stype=stype, ref=None, desc=desc, lines=lines))
        p.decoys.append(dict(decoy_id=f"D{len(p.decoys) + 1:03d}", kind=kind, trans_date=d,
                             period_no=ym_of(d), acc_no=acc, dept_no=dept, amount=amount,
                             description=desc))

    def times():
        return int(rng.integers(DECOY_COUNTS[0], DECOY_COUNTS[1] + 1))

    # 1. a legitimate second, smaller payment to an opex account in the month
    for _ in range(times()):
        for _ in range(_MAX_TRIES):
            acc, ym = _pick(rng, C.CASH_OPEX_ACCOUNTS), _pick(rng, months)
            if p.is_free([("acc", acc, ym)], buffer=0):
                y, m = _ym_parts(ym)
                amt = round(expected_opex(acc, y, m) * float(rng.uniform(0.10, 0.40)), 2)
                decoy("second_payment", _weekday_in(rng, ym, avoid=regular_day(y, m)),
                      "PAYMENT", "P", f"Expense {acc}", [(acc, "CP", amt), ("1010", "CP", -amt)],
                      acc, "CP")
                break

    # 2. a manual direct-cost accrual in the *correct* department
    for _ in range(times()):
        for _ in range(_MAX_TRIES):
            bu, ym = _pick(rng, BU_CODES), _pick(rng, months)
            if p.is_free([("dept", bu, ym)], buffer=0):
                b = BU[bu]
                y, m = _ym_parts(ym)
                monthly_cost = expected_revenue(bu, y, m) * (1 - b.gross_margin)
                amt = round(monthly_cost * float(rng.uniform(0.03, 0.12)), 2)
                decoy("direct_cost_accrual", _weekday_in(rng, ym), "GENERAL", "J",
                      "Direct cost accrual", [(b.cogs_code, bu, amt), ("2100", "CP", -amt)],
                      b.cogs_code, bu)
                break

    # 3. small round-number deposits (balance sheet only)
    for _ in range(times()):
        ym = _pick(rng, months)
        amt = float(int(rng.integers(2, 21)) * 1000)
        decoy("round_deposit", _weekday_in(rng, ym), "GENERAL", "J", "Deposit paid",
              [("1210", "CP", amt), ("1010", "CP", -amt)], "1210", "CP")

    # 4. small round-number month-end accrual adjustments (normal practice)
    for _ in range(times()):
        for _ in range(_MAX_TRIES):
            acc, ym = _pick(rng, ROUND_EXPENSE_ACCOUNTS), _pick(rng, months)
            if p.is_free([("acc", acc, ym)], buffer=0):
                amt = float(_pick(rng, [5_000, 8_000, 10_000, 12_000, 15_000, 20_000]))
                decoy("round_accrual", _month_end_day(rng, ym), "GENERAL", "J",
                      "Month-end accrual adjustment", [(acc, "CP", amt), ("2200", "CP", -amt)],
                      acc, "CP")
                break


def build_plan(masters: dict, mode: str = "canonical", rng=None) -> AnomalyPlan:
    """mode='canonical' -> fixed A01–A10; mode='random' -> sampled anomalies.
    `rng` drives random anomalies and all decoys; it must be a stream separate
    from the simulation's (see pipeline.generate). Without it, no decoys."""
    p = AnomalyPlan(mode=mode)
    if mode == "canonical":
        _canonical(p, masters)
        for a in p.log:
            p.taken.update(cells_of(a))
    elif mode == "random":
        if rng is None:
            raise ValueError("random anomaly mode needs its own rng")
        _random(p, rng, masters)
    else:
        raise ValueError(f"unknown anomaly mode {mode!r}")
    if rng is not None:
        _random_decoys(p, rng, span(RANDOM_FIRST_YM, RANDOM_LAST_YM))
    return p

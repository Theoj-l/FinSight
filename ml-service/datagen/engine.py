"""The ledger and the month-by-month business simulation.

Design rule (from FinSight_Reference_Part2): generate balanced double-entry
`gl_dtl` first, then derive everything derivable. Every journal is asserted to
balance to the cent before it is emitted.

Departmental convention:
  * P&L revenue (4xxx) and direct-cost (5xxx) lines carry the business-unit dept.
  * All balance-sheet control accounts and overhead (6xxx) lines carry 'CP'
    (Corporate), except depreciation which is split across BUs.
Full overhead absorption into BU results is Phase 2.
"""
from __future__ import annotations

import calendar
import math
from datetime import date, timedelta

import numpy as np

from . import config as C
from . import reference as R

CENT = 0.005


def _r2(x: float) -> float:
    return round(float(x), 2)


def months(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def yyyymm(d: date) -> int:
    return d.year * 100 + d.month


def month_index(d: date) -> int:
    return (d.year - C.START.year) * 12 + (d.month - C.START.month)


def _weekday_dates(y: int, m: int, rng, n: int):
    last = calendar.monthrange(y, m)[1]
    days = [date(y, m, d) for d in range(1, last + 1) if date(y, m, d).weekday() < 5]
    return list(rng.choice(days, size=n)) if n else []


def _norm_seasonality():
    out = {}
    for k, arr in C.SEASONALITY.items():
        a = np.array(arr, dtype=float)
        out[k] = a / a.mean()
    return out


_SEAS = _norm_seasonality()
_BRANCH_CODES = [b[0] for b in C.BRANCHES]
_BRANCH_W = np.array([0.5, 0.3, 0.2])


class Keys:
    def __init__(self):
        self._c = {"gl": 0, "trx": 0, "iv": 0, "ivdtl": 0, "ar": 0}

    def n(self, k: str) -> int:
        self._c[k] += 1
        return self._c[k]


class Ledger:
    def __init__(self):
        self.gl: list[dict] = []
        self.keys = Keys()
        self.balances: dict[str, float] = {}

    def post(self, d: date, jtype: str, stype: str | None, ref: str | None,
             desc: str, lines: list[tuple[str, str, float]]):
        """lines: (acc_no, dept_no, signed_amount) — positive = debit, negative = credit."""
        s = _r2(sum(a for _, _, a in lines))
        if abs(s) > CENT:
            raise AssertionError(f"unbalanced journal '{desc}' off by {s}: {lines}")
        trx = self.keys.n("trx")
        for acc, dept, amt in lines:
            amt = _r2(amt)
            dr = amt if amt > 0 else 0.0
            cr = -amt if amt < 0 else 0.0
            self.gl.append(dict(
                gl_dtl_key=self.keys.n("gl"), gl_trx_id=trx, acc_no=acc, dept_no=dept,
                trans_date=d, description=desc[:100], journal_type=jtype,
                source_type=stype, ref_no1=(ref or None), home_dr=dr, home_cr=cr,
            ))
            self.balances[acc] = self.balances.get(acc, 0.0) + dr - cr

    def bal(self, acc: str) -> float:
        return self.balances.get(acc, 0.0)


def _split_amount(total: float, n: int, rng, cv: float) -> list[float]:
    total = _r2(total)
    if n <= 1:
        return [total]
    sigma = math.sqrt(math.log(1 + cv * cv))
    raw = rng.lognormal(mean=0.0, sigma=sigma, size=n)
    raw = raw / raw.sum() * total
    parts = [_r2(x) for x in raw[:-1]]
    parts.append(_r2(total - sum(parts)))
    return parts


def simulate(rng, masters, plan):
    """masters: dict from build_masters(). plan: AnomalyPlan. Returns table dict."""
    L = Ledger()
    debtor_meta = masters["debtor_meta"]
    cust_codes = list(debtor_meta)
    items_by_bu = masters["items_by_bu"]

    cust_by_bu: dict[str, list[str]] = {b.code: [] for b in C.BUSINESS_UNITS}
    for acc, meta in debtor_meta.items():
        cust_by_bu[meta["primary_bu"]].append(acc)

    iv_rows: list[dict] = []
    ivdtl_rows: list[dict] = []
    ar_rows: list[dict] = []
    payments: list[dict] = []          # (pay_date, amount, note) to post after
    ar_index: dict[str, dict] = {}     # doc_no -> ar row (for payment fill-in)

    # ---- Opening balance sheet -------------------------------------
    opening_lines = [(acc, "CP", float(val)) for acc, val in C.OPENING.items()]
    plug = _r2(-sum(a for _, _, a in opening_lines))
    opening_lines.append((R.RETAINED_EARNINGS, "CP", plug))
    L.post(C.OPENING_DATE, "OPENING", "O", "OPEN", "Opening balances", opening_lines)

    # ---- Opening AR (already inside opening 1200; only receipts post) ----
    open_ar_total = float(C.OPENING["1200"])
    open_vals = _split_amount(open_ar_total, C.N_OPENING_AR, rng, 0.8)
    for i, v in enumerate(open_vals):
        cust = rng.choice(cust_codes)
        m = debtor_meta[cust]
        doc_d = date(2020, 11, 1) + timedelta(days=int(rng.integers(0, 58)))
        due_d = doc_d + timedelta(days=m["terms_days"])
        doc_no = f"OB{i + 1:04d}"
        ar = dict(doc_key=L.keys.n("ar"), doc_no=doc_no, debtor_code=cust,
                  doc_date=doc_d, due_date=due_d, description="Opening balance invoice",
                  sales_agent=masters["debtor_by_acc"][cust]["sales_agent"],
                  branch_code=str(rng.choice(_BRANCH_CODES, p=_BRANCH_W)),
                  local_net_total=_r2(v), local_payment_amt=0.0, outstanding=_r2(v),
                  cancelled=False)
        ar_rows.append(ar)
        ar_index[doc_no] = ar
        _schedule_payment(rng, ar, m, plan, payments, opening=True)

    # ---- Monthly loop --------------------------------------------
    for y, m in months(C.START, C.AS_OF):
        ym = y * 100 + m
        _generate_sales(rng, y, m, L, masters, plan, cust_by_bu, cust_codes,
                        items_by_bu, iv_rows, ivdtl_rows, ar_rows, ar_index, payments)
        _monthly_expenses(rng, y, m, L, plan)
        _period_end(rng, y, m, L)
        for hook in plan.post_hooks.get(ym, []):
            hook(L)

    # ---- Post all customer receipts in date order ---------------
    for p in sorted(payments, key=lambda x: x["date"]):
        if p["date"] > C.AS_OF:
            continue
        L.post(p["date"], "RECEIPT", "R", p["ref"], p["desc"],
               [("1010", "CP", p["amount"]), ("1200", "CP", -p["amount"])])

    # ---- Fill AR payment columns --------------------------------
    for ar in ar_rows:
        ar["local_payment_amt"] = _r2(ar["local_payment_amt"])
        ar["outstanding"] = _r2(ar["local_net_total"] - ar["local_payment_amt"])

    # ---- Injected GL-only anomalies ----------------------------
    for spec in plan.extra_gl:
        L.post(spec["date"], spec["jtype"], "J", spec.get("ref"), spec["desc"], spec["lines"])

    return dict(gl_dtl=L.gl, iv=iv_rows, iv_dtl=ivdtl_rows, ar_invoice=ar_rows,
                _ledger=L)


def _schedule_payment(rng, ar, meta, plan, payments, opening=False):
    doc_d = ar["doc_date"]
    due_d = ar["due_date"]
    stop = plan.stop_paying.get(ar["debtor_code"])
    if stop is not None and due_d >= stop:
        return  # customer has stopped paying — invoice stays outstanding
    drift = C.DSO_DRIFT_PER_MONTH * max(0, month_index(doc_d))
    lag = meta["lag_mean"] + rng.normal(0.0, meta["lag_sd"]) + (drift if not opening else 0.0)
    pay_d = due_d + timedelta(days=int(round(lag)))
    if opening:
        pay_d = max(pay_d, date(2021, 1, 4))
    stale = (C.AS_OF - doc_d).days > C.STALE_AR_DAYS
    if pay_d > C.AS_OF:
        if not stale:
            return  # genuinely not collected yet
        # old invoice: it was paid late, just not on the modelled date
        pay_d = C.AS_OF - timedelta(days=int(rng.integers(5, 90)))
    amount = ar["local_net_total"]
    if rng.random() < C.PARTIAL_PAY_PROB:
        amount = _r2(amount * rng.uniform(*C.SHORT_PAY_FRACTION))
    ar["local_payment_amt"] = _r2(ar["local_payment_amt"] + amount)
    payments.append(dict(date=pay_d, amount=amount, ref=ar["doc_no"],
                         desc=f"Receipt {ar['doc_no']} {ar['debtor_code']}"))


def _generate_sales(rng, y, m, L, masters, plan, cust_by_bu, cust_codes,
                    items_by_bu, iv_rows, ivdtl_rows, ar_rows, ar_index, payments):
    ym = y * 100 + m
    years_elapsed = (y - C.START.year) + (m - 1) / 12.0
    for b in C.BUSINESS_UNITS:
        annual = b.rev_2021 * ((1 + b.growth) ** years_elapsed)
        target = annual / 12.0 * _SEAS[b.seasonality][m - 1]
        target *= rng.lognormal(0.0, C.REVENUE_MONTHLY_NOISE)
        target *= plan.revenue_mult.get((b.code, ym), 1.0)
        if target < 1000:
            continue
        n_inv = max(1, int(round(target / b.avg_invoice)))
        inv_vals = _split_amount(target, n_inv, rng, b.invoice_cv)
        dates = _weekday_dates(y, m, rng, n_inv)
        margin = plan.margin_override.get((b.code, ym), b.gross_margin)
        for seq, (v, doc_d) in enumerate(zip(inv_vals, dates), start=1):
            if v < 100:
                continue
            pool = cust_by_bu[b.code] if (cust_by_bu[b.code] and rng.random() < 0.7) else cust_codes
            cust = rng.choice(pool)
            cmeta = debtor_meta_lookup(masters, cust)
            doc_no = f"IV{ym}{seq:04d}"
            doc_key = L.keys.n("iv")
            n_lines = int(rng.integers(1, 5))
            line_vals = _split_amount(v, n_lines, rng, 0.5)
            items = items_by_bu[b.code]
            ex_tax = 0.0
            total_cost = 0.0
            for li, lv in enumerate(line_vals, start=1):
                inv_margin = min(0.85, max(-0.2, margin + rng.normal(0.0, 0.04)))
                qty = int(rng.integers(1, 12))
                unit_price = _r2(lv / qty)
                sub = _r2(unit_price * qty)
                cost = _r2(sub * (1 - inv_margin))
                ex_tax += sub
                total_cost += cost
                ivdtl_rows.append(dict(
                    dtl_key=L.keys.n("ivdtl"), doc_key=doc_key, seq=li,
                    item_code=str(rng.choice(items)), description="Sales line",
                    dept_no=b.code, qty=float(qty), unit_price=unit_price,
                    local_sub_total=sub, local_total_cost=cost))
            ex_tax = _r2(ex_tax)
            total_cost = _r2(total_cost)
            rate = C.gst_rate(doc_d)
            gst = _r2(ex_tax * rate)
            net_total = _r2(ex_tax + gst)
            agent = cmeta["agent"] if rng.random() < 0.9 else str(rng.choice(masters["agent_codes"]))
            branch = str(rng.choice(_BRANCH_CODES, p=_BRANCH_W))
            iv_rows.append(dict(
                doc_key=doc_key, doc_no=doc_no, debtor_code=cust, doc_date=doc_d,
                sales_agent=agent, branch_code=branch, description=f"{b.name} invoice",
                local_ex_tax=ex_tax, local_net_total=net_total,
                local_total_cost=total_cost, cancelled=False))

            # GL: revenue recognition + cost accrual (one balanced journal)
            gl_date = plan.gl_trans_date(b.code, ym, seq, doc_d)
            L.post(gl_date, "SALES", "I", doc_no, f"{b.name} sales {doc_no}", [
                ("1200", "CP", net_total),
                (b.rev_code, b.code, -ex_tax),
                ("2310", "CP", -gst),
                (b.cogs_code, b.code, total_cost),
                ("2100", "CP", -total_cost),
            ])

            # AR sub-ledger
            due_d = doc_d + timedelta(days=cmeta["terms_days"])
            ar = dict(doc_key=L.keys.n("ar"), doc_no=doc_no, debtor_code=cust,
                      doc_date=doc_d, due_date=due_d, description=f"{b.name} invoice",
                      sales_agent=agent, branch_code=branch,
                      local_net_total=net_total, local_payment_amt=0.0,
                      outstanding=net_total, cancelled=False)
            ar_rows.append(ar)
            ar_index[doc_no] = ar
            _schedule_payment(rng, ar, debtor_meta_lookup(masters, cust), plan, payments)


def debtor_meta_lookup(masters, acc):
    m = masters["debtor_meta"][acc]
    d = masters["debtor_by_acc"][acc]
    return dict(terms_days=m["terms_days"], agent=d["sales_agent"],
                lag_mean=m["lag_mean"], lag_sd=m["lag_sd"])


def _monthly_expenses(rng, y, m, L, plan):
    y * 100 + m
    yrs = (y - C.START.year) + (m - 1) / 12.0
    day = date(y, m, min(26, calendar.monthrange(y, m)[1]))
    grow = (1 + C.OPEX_GROWTH) ** yrs

    # Salaries
    step = grow * (1.03 if m >= C.SALARY_STEP_MONTH else 1.0)
    bonus = C.DEC_BONUS_MULTIPLIER if m == 12 else 1.0
    s6100 = _r2(C.OPEX_2021_MONTHLY["6100"] * step * bonus * rng.lognormal(0, 0.02))
    s6110 = _r2(C.OPEX_2021_MONTHLY["6110"] * step * bonus * rng.lognormal(0, 0.02))
    L.post(day, "PAYMENT", "P", None, "Payroll", [
        ("6100", "CP", s6100), ("6110", "CP", s6110),
        ("1010", "CP", -_r2(s6100 + s6110))])

    # Other operating expenses (cash)
    for acc in ["6200", "6210", "6220", "6300", "6500", "6510", "6520",
                "6600", "6700", "6800", "6900"]:
        base = C.OPEX_2021_MONTHLY[acc] * grow
        if acc == "6210":  # utilities: higher mid-year
            base *= 1.0 + 0.12 * _SEAS["strong"][m - 1] - 0.12
        if acc == "6500" and m in C.AUDIT_MONTHS:
            base += C.AUDIT_SPIKE
        amt = _r2(base * rng.lognormal(0, C.OPEX_MONTHLY_NOISE))
        L.post(day, "PAYMENT", "P", None, f"Expense {acc}",
               [(acc, "CP", amt), ("1010", "CP", -amt)])

    # Depreciation (non-cash)
    dep = C.DEPRECIATION_2021_MONTHLY
    if day >= C.CAPEX_EVENT["date"]:
        dep += C.CAPEX_EVENT["extra_monthly_depreciation"]
    dep = _r2(dep)
    lines = []
    allocated = 0.0
    split = list(C.DEPRECIATION_BU_SPLIT.items())
    for i, (bu, w) in enumerate(split):
        share = _r2(dep * w) if i < len(split) - 1 else _r2(dep - allocated)
        allocated += share
        lines.append(("6400", bu, share))
    lines.append(("1900", "CP", -dep))
    L.post(day, "GENERAL", "J", None, "Monthly depreciation", lines)

    # Trade-payables settlement (roughly last month's cost accrual)
    ap_bal = -L.bal("2100")  # credit balance -> positive liability
    pay = _r2(max(0.0, ap_bal * 0.55))
    if pay > 0:
        L.post(day, "PAYMENT", "P", None, "Supplier payments",
               [("2100", "CP", pay), ("1010", "CP", -pay)])

    # Capex event
    if y == C.CAPEX_EVENT["date"].year and m == C.CAPEX_EVENT["date"].month:
        amt = float(C.CAPEX_EVENT["amount"])
        cash = float(C.CAPEX_EVENT["cash_portion"])
        L.post(C.CAPEX_EVENT["date"], "GENERAL", "J", "CAPEX",
               "Purchase of crane (part hire purchase)", [
                   (C.CAPEX_EVENT["asset_code"], "CP", amt),
                   ("1010", "CP", -cash),
                   ("2400", "CP", -_r2(amt - cash))])

    # Quarterly items
    if m in (3, 6, 9, 12):
        gst_bal = -L.bal("2310")
        if abs(gst_bal) > 1:
            L.post(day, "PAYMENT", "P", "GST", "GST remittance to IRAS",
                   [("2310", "CP", gst_bal), ("1010", "CP", -gst_bal)])
        loan_bal = -L.bal("2500")
        interest = _r2(loan_bal * C.LOAN_INTEREST_ANNUAL / 4)
        principal = _r2(min(C.LOAN_REPAY_QUARTERLY, loan_bal))
        L.post(day, "PAYMENT", "P", "LOAN", "Bank loan repayment", [
            ("2500", "CP", principal), ("6710", "CP", interest),
            ("1010", "CP", -_r2(principal + interest))])


def _period_end(rng, y, m, L):
    # Small accruals true-up so 2200 breathes a little (kept balanced against 6900).
    if rng.random() < 0.5:
        adj = _r2(rng.uniform(-40_000, 60_000))
        day = date(y, m, min(28, calendar.monthrange(y, m)[1]))
        L.post(day, "GENERAL", "J", None, "Month-end accrual adjustment",
               [("6900", "CP", adj), ("2200", "CP", -adj)])

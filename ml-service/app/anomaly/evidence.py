"""Review evidence only: identifiers and snapshots never enter model inputs."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from .detectors import rules, series
from .features import FeatureSet, ledger
from .loaders import Books
from .schema import periods_between


def number(value):
    return float(value) if pd.notna(value) and math.isfinite(float(value)) else None


def record(source: str, row: pd.Series, **extra) -> dict | None:
    key = {"ledger": "gl_dtl_key", "invoice": "doc_key", "sales_invoice": "doc_key"}[source]
    if key not in row or pd.isna(row[key]):
        return None
    result: dict[str, Any] = {"id": str(int(row[key])), "source": source}
    fields = {
        "ledger": [
            "trans_date",
            "ref_no1",
            "acc_no",
            "dept_no",
            "description",
            "home_dr",
            "home_cr",
            "gl_trx_id",
        ],
        "invoice": ["doc_no", "debtor_code", "doc_date", "due_date", "local_net_total"],
        "sales_invoice": ["doc_no", "doc_date", "local_ex_tax"],
    }[source]
    for field in fields:
        value = row.get(field)
        if value is None or pd.isna(value):
            result[field] = None
        elif field in ("home_dr", "home_cr", "local_net_total", "local_ex_tax"):
            result[field] = float(value)
        elif field.endswith("date"):
            result[field] = pd.Timestamp(value).strftime("%Y-%m-%d")
        elif field == "gl_trx_id":
            result[field] = str(int(value))
        else:
            result[field] = str(value)
    return result | extra


def build_evidence(
    kind: str,
    key: str,
    period: int,
    r: pd.Series,
    fs: FeatureSet,
    books: Books,
    department_history: pd.DataFrame | None = None,
) -> dict:
    end = pd.Timestamp(year=period // 100, month=period % 100, day=1) + pd.offsets.MonthEnd(0)
    current = books.gl[books.gl.period_no == period]
    if kind == "dept":
        current = current[
            (current.dept_no == key) & current.acc_no.map(books.acc_type).isin(["RE", "OI", "CS"])
        ]
    elif kind == "acc":
        current = current[(current.dept_no == "CP") & (current.acc_no == key)]
    details: list[dict[str, Any]] = rules.reason_details(kind, r) or [
        {"code": "model_pattern", "text": "Unusual combination of model signals; review related records."}
    ]
    findings, records = [], {}
    for detail in details:
        code = detail["code"]
        selected = current
        support = code in ("duplicate_posting", "round_month_end", "new_account_pair", "overdue_invoices")
        refs: list[str] = []

        def add(source, row, _refs=refs, **extra):
            rec = record(source, row, **extra)
            if rec:
                ref = f"{source}:{rec['id']}"
                records[ref] = rec
                _refs.append(ref)

        if code in ("duplicate_posting", "round_month_end", "new_account_pair"):
            lines = fs.lines[(fs.lines.period_no == period)]
            if kind == "acc":
                lines = lines[(lines.dept_no == "CP") & (lines.acc_no == key)]
            else:
                lines = lines[(lines.dept_no == key) & lines.acc_type.isin(["RE", "OI", "CS"])]
            if code == "duplicate_posting":
                lines = lines[lines.dup_count >= 1]
                # Include matching neighbours in the preceding month too, exactly
                # as the detector's +/-3 day, different-journal signature does.
                candidates = books.gl[books.gl.trans_date <= end]
                selected_parts = []
                for _, line in lines.iterrows():
                    original = books.gl[books.gl.gl_dtl_key == line.gl_dtl_key]
                    if original.empty:
                        continue
                    origin = original.iloc[0]
                    amounts = ((candidates.home_dr - candidates.home_cr).abs() * 100).round()
                    same = (candidates.acc_no == origin.acc_no) & (candidates.dept_no == origin.dept_no)
                    near = (candidates.trans_date - origin.trans_date).abs() <= pd.Timedelta(days=3)
                    matched = candidates[same & near & (amounts == round(line.amt * 100))]
                    selected_parts.append(matched)
                selected = (
                    pd.concat(selected_parts).drop_duplicates("gl_dtl_key")
                    if selected_parts
                    else current.iloc[:0]
                )
                selected = selected.assign(
                    _group=selected.acc_no.astype(str)
                    + ":"
                    + selected.dept_no.astype(str)
                    + ":"
                    + (selected.home_dr - selected.home_cr).abs().round(2).astype(str)
                )
                selected = selected.sort_values(["_group", "trans_date", "gl_trx_id", "gl_dtl_key"])
            else:
                if code == "round_month_end":
                    lines = lines[
                        (lines.trailing_zeros >= 3)
                        & (lines.month_end == 1)
                        & (lines.log_amt >= rules.ROUND_MIN_LOG)
                    ]
                else:
                    activity = ledger.cell_activity(books)
                    pairs = activity[
                        (activity.period_no == period)
                        & (activity.dept_no == key)
                        & (activity.pair_freq < ledger.NEW_PAIR_FREQ)
                    ]
                    lines = lines[lines.acc_no.isin(pairs.acc_no)]
                selected = current[current.gl_dtl_key.isin(lines.gl_dtl_key)]

        if kind == "cust":
            invoices = books.ar[(books.ar.debtor_code == key) & (books.ar.doc_date <= end)]
            receipts = books.gl[
                (books.gl.journal_type == "RECEIPT")
                & (books.gl.acc_no == "1200")
                & (books.gl.trans_date <= end)
            ]
            receipt_totals = (
                receipts.assign(amount=receipts.home_cr - receipts.home_dr).groupby("ref_no1").amount.sum()
            )
            recent = end - pd.Timedelta(days=90)
            for _, inv in invoices.iterrows():
                paid = float(receipt_totals.get(inv.doc_no, 0))
                outstanding = max(float(inv.local_net_total) - paid, 0)
                days = max((end - inv.due_date).days, 0) if paid == 0 else 0
                relevant = outstanding > 0.01
                if code == "overdue_invoices":
                    relevant = days > 90 and paid == 0
                elif code == "payment_delay":
                    relevant = days > 0 and paid == 0
                elif code == "low_collections":
                    relevant = inv.doc_date > recent or inv.doc_no in set(
                        receipts[receipts.trans_date > recent].ref_no1
                    )
                if relevant:
                    add(
                        "invoice",
                        inv,
                        paid_as_of=paid,
                        outstanding_as_of=outstanding,
                        overdue_days=days,
                        as_of=end.strftime("%Y-%m-%d"),
                    )
            matching = receipts[receipts.ref_no1.isin(invoices.doc_no)]
            if code == "low_collections":
                matching = matching[matching.trans_date > recent]
            for _, receipt in matching.iterrows():
                add("ledger", receipt)
        else:
            for _, row in selected.iterrows():
                add("ledger", row, **({"group": row["_group"]} if "_group" in row else {}))
            if code == "reconciliation":
                ids = books.iv_dtl[(books.iv_dtl.dept_no == key) & (books.iv_dtl.period_no == period)].doc_key
                for _, inv in books.iv[books.iv.doc_key.isin(ids)].iterrows():
                    amount = books.iv_dtl[
                        (books.iv_dtl.doc_key == inv.doc_key) & (books.iv_dtl.dept_no == key)
                    ].local_sub_total.sum()
                    add("sales_invoice", inv, unit_amount=float(amount))

        comparison: dict[str, Any] = {
            "actual": None, "baseline": None, "unit": "SGD", "periods": [], "label": ""
        }
        chart = None
        history = []
        unit_rows = (
            department_history if kind == "dept" and department_history is not None else fs.units[kind]
        )
        unit_rows = unit_rows[(unit_rows.key == key) & (unit_rows.period_no <= period)].sort_values(
            "period_no"
        )
        calendar = periods_between(books.first_period, period)
        previous = calendar[max(0, len(calendar) - 13) : -1]
        if code in ("revenue_outlier", "revenue_shortfall", "gross_margin_outlier", "gross_margin_decline"):
            chart = "gross" if code.startswith("gross") else "revenue"
            metric = "gm" if chart == "gross" else "rev"
            values = unit_rows[metric].to_numpy()
            baseline = series.trailing_median(values)[-1] if len(values) else np.nan
            comparison.update(
                actual=number(r[metric]),
                baseline=number(baseline),
                periods=previous,
                unit="ratio" if chart == "gross" else "SGD",
                label="Preceding 12-month median",
            )
            if code == "revenue_shortfall":
                comparison.update(
                    actual=number(r.rev_cusum_neg),
                    baseline=None,
                    unit="CUSUM",
                    label="Cumulative year-on-year revenue shortfall signal",
                    periods=calendar,
                )
            elif code == "gross_margin_decline":
                recent = values[-3:]
                older = values[max(0, len(values) - 25) : max(0, len(values) - 13)]
                comparison.update(
                    actual=number(np.nanmedian(recent)),
                    baseline=number(np.nanmedian(older)) if len(older) else None,
                    label="Last 3-month median vs historical margin median (13–24 months earlier)",
                    periods=calendar[-25:],
                )
            history = [
                {"periodNo": int(row.period_no), "value": number(row[metric])}
                for _, row in unit_rows.iterrows()
            ]
        elif code == "expense_outlier":
            ratio = r.get("log_ratio_med12", np.nan)
            baseline = float(r.amount) / math.exp(ratio) if pd.notna(ratio) else None
            comparison.update(
                actual=number(r.amount),
                baseline=baseline,
                periods=previous,
                label="Preceding 12-month median",
            )
        elif code == "posting_count":
            comparison.update(
                actual=number(r.n_journals),
                baseline=number(r.n_journals - r.n_journals_dev),
                periods=previous,
                unit="count",
                label="Preceding 12-month median postings",
            )
        elif code == "reconciliation":
            pb = books.pbalance[
                (books.pbalance.period_no == period)
                & (books.pbalance.dept_no == key)
                & (books.pbalance.acc_no.map(books.acc_type) == "RE")
            ]
            actual = float((pb.home_cr - pb.home_dr).sum())
            baseline = float(
                books.iv_dtl[
                    (books.iv_dtl.period_no == period) & (books.iv_dtl.dept_no == key)
                ].local_sub_total.sum()
            )
            comparison.update(
                actual=actual,
                baseline=baseline,
                periods=[period],
                label="Sales invoice revenue (selected unit)",
            )
        findings.append(
            detail
            | {
                "recordLabel": "Supporting records" if support else "Related records",
                "refs": list(dict.fromkeys(refs)),
                "comparison": comparison,
                "chart": chart,
                "history": history,
            }
        )
    return {"version": 1, "asOf": end.strftime("%Y-%m-%d"), "findings": findings, "records": records}


def enrich(
    alerts: pd.DataFrame, scored: dict[str, pd.DataFrame], fs: FeatureSet, books: Books
) -> pd.DataFrame:
    result = alerts.copy()
    evidence = []
    department_history = (
        ledger.dept_features(books) if not alerts.empty and (alerts.kind == "dept").any() else None
    )
    for alert in alerts.itertuples(index=False):
        frame = scored[alert.kind]
        row = frame[(frame.key == alert.key) & (frame.period_no == alert.period_no)].iloc[0]
        evidence.append(
            build_evidence(
                alert.kind, str(alert.key), int(alert.period_no), row, fs, books, department_history
            )
        )
    result["evidence"] = evidence
    return result

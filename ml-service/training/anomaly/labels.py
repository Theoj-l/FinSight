"""Ground truth: anomaly_log -> labelled alert units, and alerts -> detected events.

Unit labels (what the combiner is trained on)
    A unit (kind, key, period) is positive when it lies inside an anomaly's
    footprint, using the same cells datagen reserves for it (datagen.anomalies.cells_of):
      * business-unit anomalies   -> ("dept", dept, each month in [start, end])
      * Corporate (CP) postings   -> ("acc", account, each month in [start, end])
      * customer delinquency      -> ("cust", customer, each month in [start, end])
    `train_ok` is False for the first month of a delinquency: invoices falling
    due that month are not yet late, so nothing is observable and training on
    it would only teach noise. Evaluation still counts that month.

Event detection (what the report scores)
    An anomaly is *detected* if at least one alert falls inside its footprint.
    Detection delay = months from period_start to the first such alert.
"""
from __future__ import annotations

import pandas as pd

from app.anomaly.schema import FIRST_SCORED_PERIOD, KINDS, period_index
from datagen.anomalies import cells_of, span

ONSET_LAG = {"customer_delinquency": 1}   # months before the anomaly can be seen


def footprint(a: dict) -> set[tuple[str, str, int]]:
    """(kind, key, period_no) units covered by an anomaly."""
    out = set()
    for kind, key, ym in cells_of(a):
        if kind == "cust":
            out |= {("cust", key, p) for p in span(a["period_start"], a["period_end"])}
        else:
            out.add((kind, key, ym))
    return out


def label_units(units: dict[str, pd.DataFrame], log: list[dict]) -> dict[str, pd.DataFrame]:
    owner: dict[tuple, str] = {}
    blind: set[tuple] = set()
    for a in log:
        for cell in footprint(a):
            owner[cell] = a["anomaly_id"]
        lag = ONSET_LAG.get(a["subtype"], 0)
        blind |= {c for c in footprint(a)
                  if period_index(c[2], a["period_start"]) < lag}
    out = {}
    for kind in KINDS:
        df = units[kind].copy()
        keys = list(zip([kind] * len(df), df["key"].astype(str), df["period_no"].astype(int),
                        strict=True))
        df["anomaly_id"] = [owner.get(k) for k in keys]
        df["y"] = df["anomaly_id"].notna().astype(int)
        df["train_ok"] = [k not in blind for k in keys]
        out[kind] = df
    return out


def decoy_units(decoys: list[dict]) -> set[tuple[str, str, int]]:
    """Alert units touched by an unlabelled look-alike (for false-positive analysis)."""
    out = set()
    for d in decoys:
        if d["kind"] == "direct_cost_accrual":
            out.add(("dept", d["dept_no"], d["period_no"]))
        elif d["kind"] in ("second_payment", "round_accrual"):
            out.add(("acc", d["acc_no"], d["period_no"]))
    return out


def scored_events(log: list[dict]) -> list[dict]:
    """Anomalies that can be scored at all (they overlap the scored window)."""
    return [a for a in log if a["period_end"] >= FIRST_SCORED_PERIOD]


def match_events(alerts: pd.DataFrame, log: list[dict], seed: int) -> pd.DataFrame:
    """One row per anomaly: detected?, first alert month, delay, alerts inside."""
    hits = set(zip(alerts["kind"], alerts["key"].astype(str), alerts["period_no"].astype(int),
                   strict=True))
    rows = []
    for a in scored_events(log):
        inside = sorted(p for (k, key, p) in footprint(a) if (k, key, p) in hits)
        first = inside[0] if inside else None
        rows.append(dict(
            seed=seed, anomaly_id=a["anomaly_id"], category=a["category"], subtype=a["subtype"],
            difficulty=a.get("difficulty"), severity=a["severity"],
            period_start=a["period_start"], period_end=a["period_end"],
            where=a.get("affected_customer") or a.get("affected_dept") or "",
            account=a.get("affected_account"),
            detected=first is not None, first_alert=first,
            delay_months=period_index(first, a["period_start"]) if first else None,
            n_alerts=len(inside),
        ))
    return pd.DataFrame(rows)

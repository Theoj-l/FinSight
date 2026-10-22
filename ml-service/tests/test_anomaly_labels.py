"""Label and event-matching logic on small hand-built frames."""
from __future__ import annotations

import pandas as pd

from training.anomaly import labels as LB


def _a(aid, subtype, p0, p1, dept=None, acc=None, cust=None):
    return dict(anomaly_id=aid, category="x", subtype=subtype, severity="high", difficulty="easy",
                period_start=p0, period_end=p1, affected_dept=dept, affected_account=acc,
                affected_customer=cust)


LOG = [
    _a("R1", "one_off_spike", 202303, 202303, dept="HL", acc="4200"),
    _a("R2", "outlier_charge", 202305, 202305, dept="CP", acc="6800"),
    _a("R3", "customer_delinquency", 202310, 202312, acc="1200", cust="C0001"),
    _a("R4", "sustained_drop", 202402, 202404, dept="EN", acc="4300"),
]


def _units():
    return {
        "dept": pd.DataFrame({"key": ["HL", "HL", "EN", "EN"],
                              "period_no": [202302, 202303, 202402, 202405]}),
        "acc": pd.DataFrame({"key": ["6800", "6200"], "period_no": [202305, 202305]}),
        "cust": pd.DataFrame({"key": ["C0001"] * 3 + ["C0002"],
                              "period_no": [202310, 202311, 202312, 202311]}),
    }


def test_footprints():
    assert LB.footprint(LOG[0]) == {("dept", "HL", 202303)}
    assert LB.footprint(LOG[1]) == {("acc", "6800", 202305)}
    assert LB.footprint(LOG[2]) == {("cust", "C0001", p) for p in (202310, 202311, 202312)}
    assert LB.footprint(LOG[3]) == {("dept", "EN", p) for p in (202402, 202403, 202404)}


def test_unit_labels_and_onset_lag():
    lab = LB.label_units(_units(), LOG)
    assert lab["dept"]["y"].tolist() == [0, 1, 1, 0]
    assert lab["dept"]["anomaly_id"].fillna("-").tolist() == ["-", "R1", "R4", "-"]
    assert lab["acc"]["y"].tolist() == [1, 0]
    assert lab["cust"]["y"].tolist() == [1, 1, 1, 0]
    # first month of a delinquency is labelled but excluded from training
    assert lab["cust"]["train_ok"].tolist() == [False, True, True, True]


def test_event_matching_and_delay():
    alerts = pd.DataFrame({"kind": ["dept", "cust", "dept", "acc"],
                           "key": ["HL", "C0001", "EN", "6200"],
                           "period_no": [202303, 202312, 202405, 202305]})
    ev = LB.match_events(alerts, LOG, seed=1).set_index("anomaly_id")
    assert ev.loc["R1", "detected"] and ev.loc["R1", "delay_months"] == 0
    assert not ev.loc["R2", "detected"]                    # alert on the wrong account
    assert ev.loc["R3", "detected"] and ev.loc["R3", "delay_months"] == 2
    assert not ev.loc["R4", "detected"]                    # alert one month after the footprint


def test_decoy_units_skip_balance_sheet_only_decoys():
    decoys = [dict(kind="second_payment", acc_no="6300", dept_no="CP", period_no=202301),
              dict(kind="direct_cost_accrual", acc_no="5100", dept_no="CR", period_no=202302),
              dict(kind="round_deposit", acc_no="1210", dept_no="CP", period_no=202303)]
    assert LB.decoy_units(decoys) == {("acc", "6300", 202301), ("dept", "CR", 202302)}

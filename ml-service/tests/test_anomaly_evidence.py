"""Review evidence stays causal, source-scoped and separate from scoring."""

import json

import pandas as pd
import pytest

from app.anomaly.detectors.rules import reason_details, reasons
from app.anomaly.evidence import build_evidence, enrich
from app.anomaly.features import FeatureSet
from app.anomaly.loaders import Books, from_tables
from app.anomaly.score import load_model
from datagen.pipeline import generate


def books(gl, invoices=()):
    gl = pd.DataFrame(gl)
    defaults = {
        "gl_dtl_key": range(1, len(gl) + 1),
        "gl_trx_id": range(1, len(gl) + 1),
        "description": "Posting",
        "ref_no1": "INV1",
        "journal_type": "GENERAL",
        "home_cr": 0.0,
    }
    for key, value in defaults.items():
        if key not in gl:
            gl[key] = value
    gl["trans_date"] = pd.to_datetime(gl.trans_date)
    gl["period_no"] = gl.trans_date.dt.year * 100 + gl.trans_date.dt.month
    ar = pd.DataFrame(
        invoices, columns=["doc_key", "doc_no", "debtor_code", "doc_date", "due_date", "local_net_total"]
    )
    for c in ("doc_date", "due_date"):
        ar[c] = pd.to_datetime(ar[c])
    return Books(
        gl=gl,
        ar=ar,
        pbalance=pd.DataFrame(),
        iv=pd.DataFrame(),
        iv_dtl=pd.DataFrame(),
        acc_type={"6900": "EX", "1200": "CA"},
        first_period=202501,
        last_period=202608,
    )


def fs(lines):
    return FeatureSet(
        units={k: pd.DataFrame(columns=["key", "period_no"]) for k in ("dept", "acc", "cust")},
        lines=pd.DataFrame(lines),
    )


def test_duplicate_records_include_prior_month_neighbour_but_exclude_other_units_and_future():
    b = books(
        [
            {"acc_no": "6900", "dept_no": "CP", "trans_date": "2026-07-31", "home_dr": 50000.0},
            {"acc_no": "6900", "dept_no": "CP", "trans_date": "2026-08-02", "home_dr": 50000.0},
            {"acc_no": "6900", "dept_no": "HL", "trans_date": "2026-08-02", "home_dr": 50000.0},
            {"acc_no": "6900", "dept_no": "CP", "trans_date": "2026-09-01", "home_dr": 50000.0},
        ]
    )
    f = fs(
        [
            {
                "gl_dtl_key": 2,
                "period_no": 202608,
                "acc_no": "6900",
                "dept_no": "CP",
                "dup_count": 1,
                "amt": 50000,
            }
        ]
    )
    e = build_evidence("acc", "6900", 202608, pd.Series({"dup_max": 1}), f, b)
    assert set(e["records"]) == {"ledger:1", "ledger:2"}
    assert e["findings"][0]["recordLabel"] == "Supporting records"
    assert e["findings"][0]["chart"] is None
    json.dumps(e, allow_nan=False)


def test_round_number_records_use_detector_signature_and_corporate_scope():
    b = books(
        [
            {"acc_no": "6900", "dept_no": "CP", "trans_date": "2026-08-30", "home_dr": 50000.0},
            {"acc_no": "6900", "dept_no": "HL", "trans_date": "2026-08-30", "home_dr": 50000.0},
        ]
    )
    f = fs(
        [
            {
                "gl_dtl_key": 1,
                "period_no": 202608,
                "acc_no": "6900",
                "dept_no": "CP",
                "trailing_zeros": 4,
                "month_end": 1,
                "log_amt": 4.7,
            }
        ]
    )
    e = build_evidence("acc", "6900", 202608, pd.Series({"round_month_end": 4.7}), f, b)
    assert list(e["records"]) == ["ledger:1"]


def test_customer_evidence_ignores_payments_after_flagged_month():
    b = books(
        [
            {
                "acc_no": "1200",
                "dept_no": "CP",
                "trans_date": "2026-09-02",
                "home_dr": 0.0,
                "home_cr": 1000.0,
                "journal_type": "RECEIPT",
            },
        ],
        [(91, "INV1", "C01", "2026-01-01", "2026-02-01", 1000.0)],
    )
    e = build_evidence("cust", "C01", 202608, pd.Series({"overdue90_share": 1.0}), fs([]), b)
    inv = e["records"]["invoice:91"]
    assert inv["outstanding_as_of"] == 1000
    assert inv["paid_as_of"] == 0
    assert inv["overdue_days"] > 90
    assert not any(r["source"] == "ledger" for r in e["records"].values())


@pytest.fixture(scope="module")
def scored_books():
    b = from_tables(generate(20260901))
    model = load_model("models/anomaly/v1")
    features = model.featurize(b)
    scored = model.score_units(features.units)
    return b, model.alerts(scored), features, scored


def test_enrichment_leaves_scores_alerts_and_reason_text_unchanged(scored_books):
    b, alerts, features, scored = scored_books
    result = enrich(alerts, scored, features, b)
    pd.testing.assert_frame_equal(result.drop(columns="evidence"), alerts)
    for e in result.evidence:
        assert e["version"] == 1
        json.dumps(e, allow_nan=False)


def test_revenue_baseline_keeps_history_before_first_scored_month(scored_books):
    b, _, features, scored = scored_books
    row = scored["dept"].iloc[0].copy()
    row["rev_z12"] = 4
    row["rev_cusum_neg"] = 0
    from app.anomaly.features.ledger import dept_features

    e = build_evidence("dept", row.key, int(row.period_no), row, features, b, dept_features(b))
    finding = next(f for f in e["findings"] if f["code"] == "revenue_outlier")
    assert finding["comparison"]["baseline"] is not None
    assert finding["comparison"]["periods"][0] == 202101


def test_declining_margin_reason_retains_its_original_text():
    row = pd.Series({"gm_mkz12": -3, "gm_shift": -0.04})
    assert reasons("dept", row) == [
        "gross margin trending down: -4.0 pts vs a year earlier (Mann–Kendall z -3.0)"
    ]
    assert reason_details("dept", row)[0]["code"] == "gross_margin_decline"


def test_reconciliation_snapshot_totals_match_the_selected_unit(scored_books):
    b, _, features, scored = scored_books
    row = scored["dept"].iloc[0].copy()
    row["recon_gap"] = 0.1
    from app.anomaly.features.ledger import dept_features

    e = build_evidence("dept", row.key, int(row.period_no), row, features, b, dept_features(b))
    f = next(f for f in e["findings"] if f["code"] == "reconciliation")
    invoices = [e["records"][ref] for ref in f["refs"] if ref.startswith("sales_invoice:")]
    assert sum(inv["unit_amount"] for inv in invoices) == pytest.approx(f["comparison"]["baseline"])
    assert f["chart"] is None
    assert all(rec["dept_no"] == row.key for rec in e["records"].values() if rec["source"] == "ledger")


def test_new_pair_support_records_use_the_same_prior_activity_threshold(scored_books):
    b, _, features, scored = scored_books
    from app.anomaly.features.ledger import NEW_PAIR_FREQ, cell_activity, dept_features

    candidates = scored["dept"][scored["dept"].new_pair_share > 0.02]
    assert not candidates.empty
    row = candidates.iloc[0]
    e = build_evidence("dept", row.key, int(row.period_no), row, features, b, dept_features(b))
    finding = next(f for f in e["findings"] if f["code"] == "new_account_pair")
    activity = cell_activity(b)
    pairs = activity[
        (activity.period_no == row.period_no)
        & (activity.dept_no == row.key)
        & (activity.pair_freq < NEW_PAIR_FREQ)
    ]
    assert finding["refs"]
    assert all(e["records"][ref]["acc_no"] in set(pairs.acc_no) for ref in finding["refs"])
    assert finding["chart"] is None

"""The anomaly plan: canonical A01–A10 is stable; random mode is well-formed."""
from __future__ import annotations

import pytest

from datagen import validate
from datagen.anomalies import AS_OF_YM, RANDOM_COUNTS, RANDOM_FIRST_YM, cells_of
from datagen.pipeline import generate

CANONICAL = {
    # id: (subtype, period_start, period_end, dept, account, customer)
    "A01": ("one_off_spike", 202307, 202307, "HL", "4200", None),
    "A02": ("sustained_drop", 202403, 202408, "EN", "4300", None),
    "A03": ("cost_overrun", 202209, 202209, "CR", "5100", None),
    "A04": ("duplicate_payment", 202311, 202311, "CP", "6200", None),
    "A05": ("outlier_charge", 202503, 202503, "CP", "6800", None),
    "A06": ("wrong_department", 202406, 202406, "FA", "5400", None),
    "A07": ("revenue_cutoff", 202412, 202412, "EN", "4300", None),
    "A08": ("round_number_journal", 202212, 202212, "CP", "6900", None),
    "A09": ("customer_delinquency", 202409, 202608, None, "1200", "C0122"),
    "A10": ("gradual_erosion", 202401, 202512, "TR", "5600", None),
}


@pytest.fixture(scope="module")
def canonical():
    return generate(anomalies="canonical")


@pytest.fixture(scope="module")
def random7():
    return generate(7, anomalies="random")


def test_canonical_is_the_showcase_a01_a10(canonical):
    log = {a["anomaly_id"]: a for a in canonical["_anomaly_log"]}
    assert set(log) == set(CANONICAL)
    for aid, (sub, p0, p1, dept, acc, cust) in CANONICAL.items():
        a = log[aid]
        assert (a["subtype"], a["period_start"], a["period_end"]) == (sub, p0, p1), aid
        assert (a["affected_dept"], a["affected_account"], a["affected_customer"]) == (dept, acc, cust), aid


def test_decoys_never_touch_labelled_cells(canonical, random7):
    for tables in (canonical, random7):
        taken: set = set()
        for a in tables["_anomaly_log"]:
            taken |= cells_of(a)
        assert tables["_decoy_log"], "both modes post unlabelled look-alikes"
        for d in tables["_decoy_log"]:
            assert ("acc", d["acc_no"], d["period_no"]) not in taken, d
            assert ("dept", d["dept_no"], d["period_no"]) not in taken, d


def test_canonical_validates(canonical):
    ok, lines = validate.run_checks(canonical)
    assert ok, [x for x in lines if x.startswith("[FAIL]")]


def test_a04_is_a_real_duplicate(canonical):
    rows = [r for r in canonical["gl_dtl"]
            if r["acc_no"] == "6200" and r["trans_date"].year == 2023 and r["trans_date"].month == 11]
    assert len(rows) == 2
    a, b = rows
    for col in ("home_dr", "description", "trans_date"):
        assert a[col] == b[col], col
    assert a["gl_trx_id"] != b["gl_trx_id"]


def test_random_is_deterministic_per_seed(random7):
    again = generate(7, anomalies="random")
    strip = [{k: v for k, v in a.items()} for a in random7["_anomaly_log"]]
    assert strip == again["_anomaly_log"]
    assert random7["gl_dtl"][:50] == again["gl_dtl"][:50]


def test_random_differs_across_seeds(random7):
    other = generate(8, anomalies="random")
    key = [(a["subtype"], a["period_start"], a["affected_dept"]) for a in random7["_anomaly_log"]]
    key8 = [(a["subtype"], a["period_start"], a["affected_dept"]) for a in other["_anomaly_log"]]
    assert key != key8


def test_same_seed_same_masters_in_both_modes(canonical):
    # the anomaly stream is separate, so customers / agents do not depend on the mode
    rnd = generate(canonical["_meta"]["seed"], anomalies="random")
    assert rnd["debtor"] == canonical["debtor"]
    assert rnd["sales_agent"] == canonical["sales_agent"]


def test_random_counts_window_and_no_overlap(random7):
    log = random7["_anomaly_log"]
    counts: dict[str, int] = {}
    for a in log:
        counts[a["subtype"]] = counts.get(a["subtype"], 0) + 1
        assert a["difficulty"] in {"easy", "medium", "hard"}
        assert a["period_start"] >= (RANDOM_FIRST_YM if a["subtype"] != "customer_delinquency" else 202203)
        assert a["period_end"] <= AS_OF_YM
    for sub, (lo, hi) in RANDOM_COUNTS.items():
        assert lo <= counts.get(sub, 0) <= hi, sub

    # no two labelled anomalies share a dept-month, account-month or customer
    cells: set = set()
    for a in log:
        mine = cells_of(a)
        assert not (mine & cells), a["anomaly_id"]
        cells |= mine


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_random_validates(seed):
    ok, lines = validate.run_checks(generate(seed, anomalies="random"))
    assert ok, [x for x in lines if x.startswith("[FAIL]")]

"""Leakage guards: injected anomalies must be findable only through their
accounting signature, never through bookkeeping artefacts."""
from __future__ import annotations

from collections import Counter

import pytest

from datagen.pipeline import generate

NORMAL_COMBOS = {("OPENING", "O"), ("SALES", "I"), ("RECEIPT", "R"),
                 ("PAYMENT", "P"), ("GENERAL", "J")}


@pytest.fixture(scope="module", params=["canonical", "random"])
def tables(request):
    return generate(11 if request.param == "random" else 20260901, anomalies=request.param)


def test_only_conventional_journal_type_source_pairs(tables):
    combos = {(r["journal_type"], r["source_type"]) for r in tables["gl_dtl"]}
    assert combos <= NORMAL_COMBOS


def test_no_marker_references(tables):
    refs = {r["ref_no1"] for r in tables["gl_dtl"] if r["ref_no1"]}
    assert not {x for x in refs if x.startswith(("ANOM", "DUP"))}


def test_injected_narratives_are_shared_with_normal_postings(tables):
    # A narrative used by an injected journal must also appear on unlabelled
    # journals (ordinary postings or decoys), so the text alone never gives an
    # anomaly away. Exception: "Revenue accrual" (cut-offs) — any revenue
    # journal without an invoice *is* the reconciliation break, so a benign
    # look-alike cannot exist in this ledger model; see METHODOLOGY.md §9.
    journals = {}
    for r in tables["gl_dtl"]:
        journals.setdefault(r["gl_trx_id"], r["description"])
    counts = Counter(journals.values())
    by_subtype = Counter(a["subtype"] for a in tables["_anomaly_log"])
    for desc, subtype in [("Direct cost accrual", "wrong_department"),
                          ("Month-end accrual adjustment", "round_number_journal")]:
        assert counts[desc] > by_subtype[subtype], desc
    assert not [d for d in counts if "duplicate" in d.lower() or "unbilled" in d.lower()]


def test_doc_numbers_unique(tables):
    for tbl in ("iv", "ar_invoice"):
        nos = [r["doc_no"] for r in tables[tbl]]
        assert len(nos) == len(set(nos)), tbl


def test_keys_follow_the_calendar(tables):
    gl = tables["gl_dtl"]
    assert [r["gl_dtl_key"] for r in gl] == list(range(1, len(gl) + 1))
    first_date: dict[int, object] = {}
    for r in gl:
        first_date.setdefault(r["gl_trx_id"], r["trans_date"])
    ids = sorted(first_date)
    dates = [first_date[i] for i in ids]
    assert dates == sorted(dates)


def test_injected_journals_are_not_the_last_keys(tables):
    # before v1.1 every injected journal held the highest gl_trx_id values
    last_ids = {r["gl_trx_id"] for r in tables["gl_dtl"][-12:]}
    last_rows = [r for r in tables["gl_dtl"] if r["gl_trx_id"] in last_ids]
    assert all(r["trans_date"].year == 2026 for r in last_rows)

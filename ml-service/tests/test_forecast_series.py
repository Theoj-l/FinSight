"""The monthly P&L series: the same numbers the dashboard and the assistant show."""
from __future__ import annotations

import pandas as pd
import pytest

from app.forecast import series as S
from datagen.pipeline import generate


@pytest.fixture(scope="module")
def tables():
    return generate(20260901)


@pytest.fixture(scope="module")
def pl(tables):
    return S.from_tables(tables)


def _pbalance(tables) -> pd.DataFrame:
    pb = pd.DataFrame(tables["pbalance"])
    acc_type = {r["acc_no"]: r["acc_type"] for r in tables["gl_mast"]}
    return pb.assign(acc_type=pb["acc_no"].map(acc_type), net_cr=pb["home_cr"] - pb["home_dr"])


def test_every_department_has_every_month(pl):
    months = pl.groupby("dept_no")["period_no"].agg(["min", "max", "count"])
    assert (months["min"] == 202101).all() and (months["max"] == 202608).all()
    assert (months["count"] == 68).all()


def test_departments_with_no_pl_activity_are_dropped(pl):
    assert "NA" not in set(pl["dept_no"])
    assert {"CP", "CR", "HL", "EN", "TP", "FA", "TR", "MN"} == set(pl["dept_no"])


def test_metrics_match_pbalance_by_account_type(tables, pl):
    pb = _pbalance(tables)
    cell = pb[(pb["dept_no"] == "HL") & (pb["period_no"] == 202503)]
    row = pl[(pl["dept_no"] == "HL") & (pl["period_no"] == 202503)].iloc[0]
    by_type = cell.groupby("acc_type")["net_cr"].sum()
    assert row["revenue"] == pytest.approx(by_type.get("RE", 0))
    assert row["cost"] == pytest.approx(-(by_type.get("CS", 0) + by_type.get("EX", 0)))
    assert row["other_income"] == pytest.approx(by_type.get("OI", 0))


def test_profit_is_the_dashboard_net_profit(tables, pl):
    """Dashboard KPI: net profit = RE - CS + OI - EX on a credit-minus-debit basis
    (web/app/dashboard/data/kpi-utils.ts), i.e. the sum over every P&L type."""
    pb = _pbalance(tables)
    month = pb[(pb["period_no"] == 202512) & pb["acc_type"].isin(["RE", "CS", "EX", "OI"])]
    company = S.company(pl).set_index("period_no")
    assert company.loc[202512, "profit"] == pytest.approx(month["net_cr"].sum())
    assert (pl["profit"] == pl["revenue"] - pl["cost"] + pl["other_income"]).all()


def test_postgres_rows_build_the_same_frame(tables, pl):
    """from_postgres runs PG_QUERY; its rows are the same aggregate from_tables builds."""
    pb = _pbalance(tables)
    rows = (pb[pb["acc_type"].isin(["RE", "CS", "EX", "OI"])]
            .groupby(["period_no", "dept_no", "acc_type"], as_index=False)["net_cr"].sum())
    pd.testing.assert_frame_equal(S.build(rows), pl)


def test_truncate_keeps_only_months_up_to_the_cut(pl):
    cut = S.truncate(pl, 202412)
    assert cut["period_no"].max() == 202412
    assert len(cut) == 8 * 48

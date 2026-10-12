"""A forecast made at the end of month t sees nothing after t (US3.2/US3.3:
"trained on the training split only, with the validation set untouched")."""
from __future__ import annotations

import pandas as pd
import pytest

from app.forecast import engine as E
from app.forecast import series as S
from datagen.pipeline import generate
from training.forecast import bench
from training.forecast import candidates as C

HW = E.Spec("holt_winters", dict(trend="add", damped=True, seasonal="mul"))
SPECS = C.specs(HW, HW)


@pytest.fixture(scope="module")
def pl():
    return S.from_tables(generate(3))


def test_forecast_ignores_everything_after_its_origin(pl):
    before = E.forecast_from(pl, SPECS, [bench.HISTORY_END], 12)
    tampered = pl.copy()
    later = tampered["period_no"] > bench.HISTORY_END
    tampered.loc[later, ["revenue", "cost", "other_income", "profit"]] *= 5
    after = E.forecast_from(tampered, SPECS, [bench.HISTORY_END], 12)
    pd.testing.assert_frame_equal(before, after)


@pytest.mark.parametrize("window", ["validation", "test"])
def test_a_window_is_scored_only_on_its_own_months(pl, window):
    start, end = bench.WINDOWS[window]
    fc = bench.backtest(pl, C.specs(E.Spec("snaive"), E.Spec("snaive")), window)
    h1 = fc[fc["horizon"] == 1]
    assert h1["period_no"].min() == start and h1["period_no"].max() == end
    assert fc["period_no"].max() == end                 # validation never reaches a test month
    assert (fc["origin"] < fc["period_no"]).all()
    assert fc["actual"].notna().all()


def test_windows_follow_the_history():
    assert bench.HISTORY_END < bench.WINDOWS["validation"][0] <= bench.WINDOWS["validation"][1] \
        < bench.WINDOWS["test"][0] <= bench.WINDOWS["test"][1]
    assert len(bench.origins("validation")) == len(bench.origins("test")) == 12


def test_parallel_fitting_gives_the_same_forecast(pl):
    origins = [202406, 202407, 202408]
    sequential = E.forecast_from(pl, SPECS, origins, 6, n_jobs=1)
    pd.testing.assert_frame_equal(sequential, E.forecast_from(pl, SPECS, origins, 6, n_jobs=4))

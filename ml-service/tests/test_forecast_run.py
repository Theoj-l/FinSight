"""The live forecast run: the committed model, which months are used, what is
stored, and the /forecast/run endpoint. No database: run.run is replaced where
it would connect."""
from __future__ import annotations

import json
import os
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.forecast import run as forecast_run
from app.forecast import series as S
from app.forecast.model import ForecastModel
from app.main import app
from app.routers import forecast as forecast_router
from datagen.pipeline import generate

SERVED_MODEL = os.path.join(os.path.dirname(__file__), os.pardir, "models", "forecast", "v1")


@pytest.fixture(scope="module")
def served_model():
    return forecast_run.load_model(SERVED_MODEL)


@pytest.fixture(scope="module")
def pl():
    return S.from_tables(generate(20260901))


@pytest.fixture(scope="module")
def result(served_model, pl):
    return forecast_run.forecast_ledger(served_model, pl, today=date(2026, 10, 12), n_jobs=8)


def test_served_model_names_a_method_for_every_base_metric(served_model):
    assert set(served_model.specs) == {"revenue", "cost", "other_income"}
    assert served_model.horizon == 12


def test_forecast_starts_after_the_last_closed_month(result):
    assert result.data_through == result.history_through == 202608
    fc = result.forecast
    assert fc["period_no"].min() == 202609 and fc["period_no"].max() == 202708
    assert len(fc) == 8 * 3 * 12        # departments x metrics x horizon
    assert set(fc["metric"]) == {"revenue", "cost", "profit"}


def test_month_in_progress_is_not_used(served_model, pl):
    quick = ForecastModel({**served_model.meta, "backtest_origins": 1})
    res = forecast_run.forecast_ledger(quick, pl, today=date(2026, 8, 15), n_jobs=8)
    assert res.history_through == 202607
    assert res.forecast["origin"].unique().tolist() == [202607]


def test_profit_is_revenue_minus_cost_plus_other_income(result):
    for df in (result.forecast, result.backtest):
        wide = df.pivot_table(index=["dept_no", "origin", "period_no"], columns="metric", values="yhat")
        # other income is zero in the synthetic ledger
        assert (wide["profit"] - (wide["revenue"] - wide["cost"])).abs().max() < 1e-6


def test_backtest_replays_the_last_24_months_with_actuals(result):
    bt = result.backtest
    assert bt["origin"].min() == 202408 and bt["origin"].max() == 202607
    assert bt["period_no"].max() == 202608
    assert (bt["origin"] < bt["period_no"]).all()
    assert bt["actual"].notna().all()


def test_summary_reports_last_year_accuracy_against_the_target(result):
    acc = result.summary["accuracy"]
    assert set(acc) == {"revenue", "cost", "profit"}
    assert all(a["months"] == 12 for a in acc.values())
    assert result.summary["target_mape"] == 15.0
    assert all(a["meets_target"] == (a["mape"] <= 15.0 + 1e-9) for a in acc.values())
    json.dumps(result.summary)           # stored as jsonb


# -- the model file -----------------------------------------------------------

def _write(tmp_path, specs: dict) -> str:
    ForecastModel({"model_version": "vTest", "specs": specs}).save(str(tmp_path))
    return str(tmp_path)


def test_a_model_without_a_method_for_every_metric_is_refused(tmp_path):
    with pytest.raises(RuntimeError, match="no method"):
        forecast_run.load_model(_write(tmp_path, {"revenue": {"method": "snaive"}}))


def test_an_unknown_method_is_refused(tmp_path):
    specs = {m: {"method": "arima"} for m in ("revenue", "cost", "other_income")}
    with pytest.raises(RuntimeError, match="unknown"):
        forecast_run.load_model(_write(tmp_path, specs))


def test_a_method_whose_library_is_missing_is_refused(tmp_path, monkeypatch):
    monkeypatch.setattr("app.forecast.model.available", lambda method: method != "prophet")
    specs = {m: {"method": "prophet"} for m in ("revenue", "cost", "other_income")}
    with pytest.raises(RuntimeError, match="requirements.txt"):
        forecast_run.load_model(_write(tmp_path, specs))


# -- endpoint -----------------------------------------------------------------

@pytest.fixture
def client(tmp_path):
    settings = Settings(models_dir=str(tmp_path), database_url="postgresql://test")
    app.dependency_overrides[get_settings] = lambda: settings
    yield TestClient(app)
    app.dependency_overrides.clear()


def _auth() -> dict[str, str]:
    return {"x-ml-service-token": get_settings().ml_service_token}


def _no_model_needed() -> ForecastModel:
    return ForecastModel({"model_version": "vTest"})


def _summary() -> forecast_run.RunSummary:
    return forecast_run.RunSummary(run_id=3, model_version="vTest", data_through=202608,
                                   history_through=202608, horizon=12, n_forecast=288, n_backtest=5328,
                                   accuracy={"revenue": 3.1, "cost": 2.9, "profit": 14.0}, seconds=9.5)


def test_run_requires_the_shared_secret(client, monkeypatch):
    called = []
    monkeypatch.setattr(forecast_run, "run", lambda *a, **k: called.append(1))
    app.dependency_overrides[forecast_router.get_model] = _no_model_needed
    assert client.post("/forecast/run").status_code == 401
    assert called == []


def test_run_without_a_model_is_503(client):
    res = client.post("/forecast/run", headers=_auth())
    assert res.status_code == 503
    assert "training.forecast.train" in res.json()["detail"]


def test_run_without_a_database_is_503(tmp_path):
    app.dependency_overrides[get_settings] = lambda: Settings(models_dir=str(tmp_path), database_url="")
    app.dependency_overrides[forecast_router.get_model] = _no_model_needed
    try:
        res = TestClient(app).post("/forecast/run", headers=_auth())
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 503
    assert "DATABASE_URL" in res.json()["detail"]


def test_run_returns_the_run_summary(client, monkeypatch):
    calls = []

    def fake_run(url, model, triggered_by):
        calls.append(triggered_by)
        return _summary()
    monkeypatch.setattr(forecast_run, "run", fake_run)
    app.dependency_overrides[forecast_router.get_model] = _no_model_needed
    res = client.post("/forecast/run", headers=_auth())
    assert res.status_code == 200
    assert res.json()["n_forecast"] == 288 and res.json()["accuracy"]["profit"] == 14.0
    assert calls == ["api"]


def test_concurrent_run_is_409(client, monkeypatch):
    def busy(*a, **k):
        raise forecast_run.AlreadyRunning("a forecast run is already in progress")
    monkeypatch.setattr(forecast_run, "run", busy)
    app.dependency_overrides[forecast_router.get_model] = _no_model_needed
    assert client.post("/forecast/run", headers=_auth()).status_code == 409

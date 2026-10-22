"""The live-scoring wiring: the committed model, which months get scored, and
the /anomalies/rescore endpoint. No database: score.run is replaced where it
would connect."""
from __future__ import annotations

import os
from datetime import date

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.anomaly import loaders, score
from app.anomaly.model import AnomalyModel
from app.config import Settings, get_settings
from app.main import app
from app.routers import anomalies
from datagen.pipeline import generate
from training.anomaly import labels

SERVED_MODEL = os.path.join(os.path.dirname(__file__), os.pardir, "models", "anomaly", "v1")


@pytest.fixture(scope="module")
def served_model():
    return score.load_model(SERVED_MODEL)


def test_served_model_finds_every_showcase_anomaly(served_model):
    tables = generate(20260901)
    alerts, through = score.score_books(served_model, loaders.from_tables(tables), today=date(2026, 10, 8))
    events = labels.match_events(alerts, tables["_anomaly_log"], seed=20260901)
    assert through == 202608
    assert events["detected"].all(), events.loc[~events["detected"], "anomaly_id"].tolist()


def test_a_model_trained_on_other_features_is_refused(tmp_path):
    model = AnomalyModel.load(SERVED_MODEL)
    model.meta = {**model.meta, "features": {"dept": ["rev_z12"]}}
    model.save(str(tmp_path))
    with pytest.raises(RuntimeError, match="different feature set"):
        score.load_model(str(tmp_path))


@pytest.mark.parametrize("last, today, expected", [
    (202608, date(2026, 10, 8), 202608),    # ledger ends well before today
    (202610, date(2026, 10, 8), 202609),    # October is still in progress
    (202601, date(2026, 1, 15), 202512),    # year boundary
    (202609, date(2026, 10, 1), 202609),    # first of the month: September is closed
])
def test_closed_through(last, today, expected):
    assert score.closed_through(last, today) == expected


class _FakeModel:
    meta = {"model_version": "vTest"}

    def featurize(self, books):
        self.seen_last_period = books.last_period
        return type("FS", (), {"units": {}})()

    def score_units(self, units):
        return units

    def alerts(self, scored):
        return pd.DataFrame(columns=["kind", "key", "period_no", "score", "reasons"])


@pytest.fixture(scope="module")
def books():
    return loaders.from_tables(generate(3, anomalies="random"))


def test_month_in_progress_is_not_scored(books):
    model = _FakeModel()
    _, through = score.score_books(model, books, today=date(2026, 8, 15))   # data runs to 202608
    assert through == 202607
    assert model.seen_last_period == 202607


def test_closed_ledger_is_scored_to_the_end(books):
    model = _FakeModel()
    _, through = score.score_books(model, books, today=date(2026, 10, 8))
    assert through == model.seen_last_period == books.last_period == 202608


# -- endpoint -----------------------------------------------------------------

@pytest.fixture
def client(tmp_path):
    settings = Settings(models_dir=str(tmp_path), database_url="postgresql://test")
    app.dependency_overrides[get_settings] = lambda: settings
    yield TestClient(app)
    app.dependency_overrides.clear()


def _auth() -> dict[str, str]:
    return {"x-ml-service-token": get_settings().ml_service_token}


def _summary() -> score.RunSummary:
    return score.RunSummary(run_id=7, model_version="vTest", data_through=202608, scored_through=202608,
                            n_alerts=57, n_new=3, seconds=4.8)


def test_rescore_requires_the_shared_secret(client, monkeypatch):
    called = []
    monkeypatch.setattr(score, "run", lambda *a, **k: called.append(1))
    app.dependency_overrides[anomalies.get_model] = _FakeModel
    assert client.post("/anomalies/rescore").status_code == 401
    assert called == []


def test_rescore_without_a_trained_model_is_503(client):
    res = client.post("/anomalies/rescore", headers=_auth())
    assert res.status_code == 503
    assert "training.anomaly.train" in res.json()["detail"]


def test_rescore_returns_the_run_summary(client, monkeypatch):
    calls = []

    def fake_run(url, model, triggered_by):
        calls.append(triggered_by)
        return _summary()
    monkeypatch.setattr(score, "run", fake_run)
    app.dependency_overrides[anomalies.get_model] = _FakeModel
    res = client.post("/anomalies/rescore", headers=_auth())
    assert res.status_code == 200
    assert res.json() == {"run_id": 7, "model_version": "vTest", "data_through": 202608,
                          "scored_through": 202608, "n_alerts": 57, "n_new": 3, "seconds": 4.8}
    assert calls == ["api"]


def test_concurrent_rescore_is_409(client, monkeypatch):
    def busy(*a, **k):
        raise score.AlreadyRunning("an anomaly scoring run is already in progress")
    monkeypatch.setattr(score, "run", busy)
    app.dependency_overrides[anomalies.get_model] = _FakeModel
    assert client.post("/anomalies/rescore", headers=_auth()).status_code == 409

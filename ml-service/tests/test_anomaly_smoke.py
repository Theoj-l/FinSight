"""End to end: train on a few seeds, evaluate, and score the canonical showcase."""
from __future__ import annotations

import json

import pytest

from app.anomaly.model import AnomalyModel
from training.anomaly import evaluate, train


@pytest.mark.slow
def test_quick_train_and_evaluate(tmp_path):
    out = tmp_path / "model"
    assert train.main(["--quick", "--out", str(out), "--jobs", "2"]) == 0
    assert evaluate.main(["--quick", "--model", str(out), "--jobs", "2"]) == 0

    for f in ("model.joblib", "meta.json", "REPORT.md", "metrics.json", "test_events.csv",
              "showcase_alerts.csv"):
        assert (out / f).exists(), f
    metrics = json.loads((out / "metrics.json").read_text())
    assert metrics["model"]["seeds"]["train"] == [1, 2, 3]
    assert metrics["showcase"]["combiner"]["events"] == 10
    # even a 3-seed model should find most of the showcase anomalies
    assert metrics["showcase"]["combiner"]["event_recall"] >= 0.6

    model = AnomalyModel.load(str(out))
    assert set(model.thresholds) == {"rules", "stat", "iforest", "combiner"}

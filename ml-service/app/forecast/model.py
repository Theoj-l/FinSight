"""The selected forecaster: which method forecasts each metric.

Unlike the anomaly model there are no fitted weights to ship. Every method is
refitted on the latest ledger at each run, so the artifact is the *choice*
made on the validation window (method + settings per metric), plus the
provenance of that choice:

    models/forecast/<version>/config.json      written by training/forecast/train.py
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

from .engine import Spec
from .methods import METHODS, available
from .series import BASE

CONFIG_FILE = "config.json"
DEFAULT_HORIZON = 12
DEFAULT_BACKTEST_ORIGINS = 24


@dataclass
class ForecastModel:
    meta: dict = field(default_factory=dict)

    @property
    def version(self) -> str:
        return str(self.meta.get("model_version", "unknown"))

    @property
    def specs(self) -> dict[str, Spec]:
        return {m: Spec(d["method"], dict(d.get("params") or {})) for m, d in self.meta["specs"].items()}

    @property
    def horizon(self) -> int:
        return int(self.meta.get("horizon", DEFAULT_HORIZON))

    @property
    def backtest_origins(self) -> int:
        return int(self.meta.get("backtest_origins", DEFAULT_BACKTEST_ORIGINS))

    def save(self, directory: str) -> None:
        os.makedirs(directory, exist_ok=True)
        with open(os.path.join(directory, CONFIG_FILE), "w") as f:
            json.dump(self.meta, f, indent=2, default=str)
            f.write("\n")

    @staticmethod
    def load(directory: str) -> ForecastModel:
        path = os.path.join(directory, CONFIG_FILE)
        if not os.path.exists(path):
            raise FileNotFoundError(f"no forecast model at {directory}: "
                                    "run `python -m training.forecast.train`")
        with open(path) as f:
            model = ForecastModel(json.load(f))
        specs = model.meta.get("specs") or {}
        missing = [m for m in BASE if m not in specs]
        if missing:
            raise RuntimeError(f"the forecast model at {directory} has no method for {missing}")
        for metric, spec in model.specs.items():
            if spec.method not in METHODS:
                raise RuntimeError(f"unknown forecasting method {spec.method!r} for {metric}")
            if not available(spec.method):
                raise RuntimeError(f"{metric} is forecast with {spec.method}, whose library is not "
                                   "installed: add it to requirements.txt")
        return model

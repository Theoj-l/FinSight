"""Every forecaster the benchmark compares (METHODOLOGY.md §5).

Each candidate forecasts revenue and cost with the same method and settings;
other income always uses a trailing 12-month mean (it is zero in the
synthetic ledger and small in a real one), and profit is derived.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.forecast.engine import Spec

FAMILIES = ("baseline", "holt_winters", "prophet")
FAMILY_LABEL = {"baseline": "Baseline", "holt_winters": "Holt-Winters", "prophet": "Prophet"}
OTHER_INCOME = Spec("mean12")


@dataclass(frozen=True)
class Candidate:
    family: str
    spec: Spec

    @property
    def label(self) -> str:
        return self.spec.label


BASELINES = [Candidate("baseline", Spec(m)) for m in ("naive", "snaive", "snaive_growth")]
HOLT_WINTERS = [
    Candidate("holt_winters", Spec("holt_winters", dict(trend=trend, damped=damped, seasonal=seasonal)))
    for trend, damped in ((None, False), ("add", False), ("add", True))
    for seasonal in ("add", "mul")
]
PROPHET = [
    Candidate("prophet", Spec("prophet", dict(seasonality_mode=mode, changepoint_prior_scale=cps)))
    for mode in ("additive", "multiplicative")
    for cps in (0.01, 0.1, 0.5)
]
CANDIDATES = BASELINES + HOLT_WINTERS + PROPHET


def specs(revenue: Spec, cost: Spec) -> dict[str, Spec]:
    """The per-metric specs a forecast run takes."""
    return {"revenue": revenue, "cost": cost, "other_income": OTHER_INCOME}


def spec_from_dict(d: dict) -> Spec:
    return Spec(d["method"], dict(d.get("params") or {}))


def spec_to_dict(s: Spec) -> dict:
    return {"method": s.method, "params": dict(s.params)}

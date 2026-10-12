"""Forecast runs over HTTP, guarded by the shared secret (see main.py).

The dashboard and the assistant do not call this: they read forecast_run /
forecast_value through Prisma (web/app/dashboard/data/forecast.ts). This is
for a scheduler or an admin action to refresh the forecasts on demand; the
monthly cron runs `python -m app.forecast.run` instead.
"""
from __future__ import annotations

from dataclasses import asdict
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.forecast import run as forecast_run
from app.forecast.model import ForecastModel

router = APIRouter(prefix="/forecast", tags=["forecast"])


class ForecastRunResult(BaseModel):
    run_id: int
    model_version: str
    data_through: int
    history_through: int
    horizon: int
    n_forecast: int
    n_backtest: int
    accuracy: dict[str, float | None]
    seconds: float


@lru_cache(maxsize=2)
def _load(path: str) -> ForecastModel:
    return forecast_run.load_model(path)


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_model(settings: SettingsDep) -> ForecastModel:
    try:
        return _load(forecast_run.model_dir(settings))
    except (FileNotFoundError, RuntimeError) as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e


@router.post("/run", response_model=ForecastRunResult)
def run(model: Annotated[ForecastModel, Depends(get_model)], settings: SettingsDep) -> ForecastRunResult:
    if not settings.database_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "DATABASE_URL is not configured")
    try:
        summary = forecast_run.run(settings.database_url, model, triggered_by="api")
    except forecast_run.AlreadyRunning as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    return ForecastRunResult(**asdict(summary))

"""Anomaly scoring over HTTP, guarded by the shared secret (see main.py).

The dashboard does not call this: it reads anomaly_alert / anomaly_run through
Prisma. This is for whatever changes the ledger (a sync job, an admin action)
to refresh the stored alerts straight away.
"""
from __future__ import annotations

from dataclasses import asdict
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.anomaly import score
from app.anomaly.model import AnomalyModel
from app.config import Settings, get_settings

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


class RescoreResult(BaseModel):
    run_id: int
    model_version: str
    data_through: int
    scored_through: int
    n_alerts: int
    n_new: int
    seconds: float


@lru_cache(maxsize=2)
def _load(path: str) -> AnomalyModel:
    return score.load_model(path)


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_model(settings: SettingsDep) -> AnomalyModel:
    try:
        return _load(score.model_dir(settings))
    except FileNotFoundError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e


@router.post("/rescore", response_model=RescoreResult)
def rescore(model: Annotated[AnomalyModel, Depends(get_model)], settings: SettingsDep) -> RescoreResult:
    if not settings.database_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "DATABASE_URL is not configured")
    try:
        summary = score.run(settings.database_url, model, triggered_by="api")
    except score.AlreadyRunning as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    return RescoreResult(**asdict(summary))

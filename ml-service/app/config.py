from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, loaded from environment / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Shared secret the web app must send in the x-ml-service-token header.
    ml_service_token: str = "dev-local-token-change-me"

    # Directory holding trained model artifacts (gitignored).
    models_dir: str = "models"

    # Which trained anomaly model to serve: <models_dir>/anomaly/<version>/.
    anomaly_model_version: str = "v1"

    # Which forecast model to run: <models_dir>/forecast/<version>/config.json.
    forecast_model_version: str = "v2"

    # Series fitted in parallel (threads) by a forecast run. Prophet fits mostly
    # wait on a Stan subprocess, so this can exceed the CPU count.
    forecast_jobs: int = 8

    # Supabase Postgres, session pooler (port 5432). Anomaly scoring and
    # forecasting read the ledger here and write their results back
    # (anomaly_alert / anomaly_run, forecast_value / forecast_run).
    database_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

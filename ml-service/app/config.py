from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, loaded from environment / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Shared secret the web app must send in the x-ml-service-token header.
    ml_service_token: str = "dev-local-token-change-me"

    # Directory holding trained model artifacts (gitignored).
    models_dir: str = "models"


@lru_cache
def get_settings() -> Settings:
    return Settings()

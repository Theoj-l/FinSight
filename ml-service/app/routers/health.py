from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/")
def root() -> dict[str, str]:
    return {"message": "FinSight ML Service is running"}


@router.get("/health")
def healthcheck() -> dict[str, str]:
    """Unauthenticated liveness probe."""
    return {"status": "ok", "service": "ml-service"}

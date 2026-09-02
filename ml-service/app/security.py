from fastapi import Header, HTTPException, status

from app.config import get_settings


async def require_service_token(x_ml_service_token: str = Header(default="")) -> None:
    """Reject requests that do not carry the shared secret.

    The ML service is only ever called by the web backend, never the browser,
    so a static shared token is enough. Apply as a router/endpoint dependency.
    """
    expected = get_settings().ml_service_token
    if not x_ml_service_token or x_ml_service_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing x-ml-service-token header",
        )

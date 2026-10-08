from fastapi import Depends, FastAPI

from app.routers import anomalies, health
from app.security import require_service_token

app = FastAPI(title="FinSight ML Service")

app.include_router(health.router)

# Every router except health is guarded by the shared secret.
app.include_router(anomalies.router, dependencies=[Depends(require_service_token)])

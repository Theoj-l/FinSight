from fastapi import FastAPI

from app.routers import health

app = FastAPI(title="FinSight ML Service")

app.include_router(health.router)

# Register future routers here, guarding them with the shared-secret dependency:
#
#   from fastapi import Depends
#   from app.security import require_service_token
#   from app.routers import predict
#   app.include_router(predict.router, dependencies=[Depends(require_service_token)])

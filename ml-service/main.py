from fastapi import FastAPI

app = FastAPI(title="FinSight ML Service")


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": "ml-service"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "FinSight ML Service is running"}

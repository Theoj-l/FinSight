from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthcheck() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "ml-service"}


def test_root() -> None:
    res = client.get("/")
    assert res.status_code == 200
    assert "message" in res.json()

import importlib

from fastapi import HTTPException
from fastapi.testclient import TestClient


def client(monkeypatch) -> TestClient:
    monkeypatch.setenv("STORAGE_BUCKET", "ecosuitability")
    monkeypatch.setenv("TILE_INTERNAL_SHARED_SECRET", "a" * 32)
    module = importlib.import_module("app.main")
    return TestClient(module.app)


def test_health_is_public(monkeypatch) -> None:
    response = client(monkeypatch).get("/health/live")
    assert response.status_code == 200


def test_tile_boundary_hides_auth_failures(monkeypatch) -> None:
    response = client(monkeypatch).get(
        "/v1/tiles/suitability/0/0/0.png", params={"key": "x"}
    )
    assert response.status_code == 404


def test_object_keys_are_scoped() -> None:
    module = importlib.import_module("app.main")
    try:
        module.source_path("../../etc/passwd")
    except HTTPException as error:
        assert error.status_code == 400
    else:
        raise AssertionError("Unsafe object key was accepted")

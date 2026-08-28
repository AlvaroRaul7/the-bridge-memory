"""API-key enforcement and the unauthenticated probe."""

from __future__ import annotations

import pytest


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/memory"),
        ("delete", "/memory/mem_1"),
        ("get", "/session/ses_1"),
        ("post", "/session"),
    ],
)
def test_protected_routes_reject_a_missing_key(anon, method, path):
    kwargs = {"json": {}} if method == "post" else {}
    response = getattr(anon, method)(path, **kwargs)
    assert response.status_code == 401


def test_wrong_key_is_rejected(app):
    from fastapi.testclient import TestClient

    wrong = TestClient(app, headers={"X-API-Key": "nope"})
    assert wrong.get("/memory").status_code == 401


def test_healthz_needs_no_key(anon):
    response = anon.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_no_memory_engine_call_happens_without_a_key(anon, monkeypatch):
    import app.routers.memory as memory_router

    def _boom(*args, **kwargs):
        raise AssertionError("memory_engine should not be reached without a valid X-API-Key")

    monkeypatch.setattr(memory_router, "engine_list_memories", _boom)

    response = anon.get("/memory", params={"tenant_id": "tenant-a"})

    assert response.status_code == 401

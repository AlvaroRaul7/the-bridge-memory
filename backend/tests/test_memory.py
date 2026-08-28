"""Long-term memory routes (ChromaDB via memory_engine).

These are HTTP-layer tests: memory_engine itself is monkeypatched here, and
gets its own round-trip/isolation coverage in tests/test_memory_engine.py at
the repo root. No Chroma client, no network.
"""

from __future__ import annotations

import app.routers.memory as memory_router
from memory_engine.schemas import MemoryHit, MemoryRecord


def test_create_memory_writes_and_returns_id(client, monkeypatch):
    calls = []
    monkeypatch.setattr(
        memory_router,
        "write_memory",
        lambda tenant_id, text, metadata: calls.append((tenant_id, text, metadata))
        or "mem-123",
    )

    response = client.post(
        "/memory",
        json={"tenant_id": "tenant-a", "text": "Alice owns payments.", "metadata": {"kind": "fact"}},
    )

    assert response.status_code == 201
    assert response.json() == {"id": "mem-123"}
    assert calls == [("tenant-a", "Alice owns payments.", {"kind": "fact"})]


def test_search_memory_returns_hits(client, monkeypatch):
    monkeypatch.setattr(
        memory_router,
        "query_memory",
        lambda tenant_id, query_text, k: [
            MemoryHit(id="mem-1", text="Alice owns payments.", metadata={"kind": "fact"}, distance=0.1)
        ],
    )

    response = client.get("/memory/search", params={"tenant_id": "tenant-a", "q": "who owns payments?"})

    assert response.status_code == 200
    assert response.json() == [
        {"id": "mem-1", "text": "Alice owns payments.", "metadata": {"kind": "fact"}, "distance": 0.1}
    ]


def test_search_memory_requires_tenant_id(client):
    response = client.get("/memory/search", params={"q": "who owns payments?"})
    assert response.status_code == 422


def test_list_memories_returns_records(client, monkeypatch):
    monkeypatch.setattr(
        memory_router,
        "engine_list_memories",
        lambda tenant_id: [MemoryRecord(id="mem-1", text="a fact", metadata={"kind": "fact"})],
    )

    response = client.get("/memory", params={"tenant_id": "tenant-a"})

    assert response.status_code == 200
    assert response.json() == {
        "tenant_id": "tenant-a",
        "memories": [{"id": "mem-1", "text": "a fact", "metadata": {"kind": "fact"}}],
    }


def test_delete_memory_removes_when_owned_by_tenant(client, monkeypatch):
    monkeypatch.setattr(
        memory_router,
        "get_memory",
        lambda tenant_id, record_id: MemoryRecord(id=record_id, text="x", metadata={}),
    )
    deleted = []
    monkeypatch.setattr(memory_router, "engine_delete_memory", lambda record_id: deleted.append(record_id))

    response = client.delete("/memory/mem-1", params={"tenant_id": "tenant-a"})

    assert response.status_code == 200
    assert response.json() == {"id": "mem-1", "deleted": True}
    assert deleted == ["mem-1"]


def test_delete_memory_404_when_not_owned_or_missing(client, monkeypatch):
    monkeypatch.setattr(memory_router, "get_memory", lambda tenant_id, record_id: None)
    called = []
    monkeypatch.setattr(memory_router, "engine_delete_memory", lambda record_id: called.append(record_id))

    response = client.delete("/memory/mem-nope", params={"tenant_id": "tenant-a"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Not found."
    assert called == []

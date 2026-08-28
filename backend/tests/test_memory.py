"""Long-term memory routes (ChromaDB via memory_engine).

These are HTTP-layer tests: memory_engine itself is monkeypatched here, and
gets its own round-trip/isolation coverage in tests/test_memory_engine.py at
the repo root. No Chroma client, no network.
"""

from __future__ import annotations

import app.routers.memory as memory_router
from app.schemas import CurationReport
from memory_engine.schemas import MemoryHit, MemoryRecord

from .conftest import STORE_ID, memory_item, memory_prefix


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

    response = client.get("/memory", params={"source": "chroma", "tenant_id": "tenant-a"})

    assert response.status_code == 200
    assert response.json() == {
        "source": "chroma",
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

    response = client.delete("/memory/mem-1", params={"source": "chroma", "tenant_id": "tenant-a"})

    assert response.status_code == 200
    assert response.json() == {"id": "mem-1", "deleted": True}
    assert deleted == ["mem-1"]


def test_delete_memory_404_when_not_owned_or_missing(client, monkeypatch):
    monkeypatch.setattr(memory_router, "get_memory", lambda tenant_id, record_id: None)
    called = []
    monkeypatch.setattr(memory_router, "engine_delete_memory", lambda record_id: called.append(record_id))

    response = client.delete("/memory/mem-nope", params={"source": "chroma", "tenant_id": "tenant-a"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Not found."
    assert called == []


def test_curate_route_delegates_to_the_curator_with_the_request_client(client, fake, monkeypatch):
    calls = []
    report = CurationReport(merged=["mem-2"], summary="Merged one duplicate.")
    monkeypatch.setattr(
        memory_router.curator,
        "curate",
        lambda passed_client, tenant_id: calls.append((passed_client, tenant_id)) or report,
    )

    response = client.post("/memory/curate", json={"tenant_id": "tenant-a"})

    assert response.status_code == 200
    assert response.json() == {
        "merged": ["mem-2"],
        "pruned": [],
        "contradictions": [],
        "summary": "Merged one duplicate.",
    }
    assert calls == [(fake, "tenant-a")]


def test_curate_route_requires_tenant_id(client):
    response = client.post("/memory/curate", json={})
    assert response.status_code == 422


# --- the agent's own store (source=agent, the default) -----------------------


def test_list_defaults_to_the_agent_store(client, fake):
    """The default must be the store the agent actually writes to.

    Nothing populates Chroma unless a caller does it explicitly — the agent has
    no tool that can reach this service — so defaulting to Chroma answered
    "what does the agent remember?" with an empty list.
    """
    fake.memories = [
        memory_item("mem_2", "/team.md", size=42),
        memory_item("mem_1", "/access-policy.md", size=17),
    ]

    body = client.get("/memory").json()

    assert body["source"] == "agent"
    assert body["memory_store_id"] == STORE_ID
    assert [m["path"] for m in body["memories"]] == ["/access-policy.md", "/team.md"]


def test_agent_listing_separates_directory_nodes(client, fake):
    fake.memories = [memory_item("mem_1", "/a.md"), memory_prefix("/notes")]

    body = client.get("/memory").json()

    assert [m["path"] for m in body["memories"]] == ["/a.md"]
    assert body["prefixes"] == ["/notes"]


def test_agent_content_is_withheld_unless_asked_for(client, fake):
    fake.memories = [memory_item("mem_1", "/a.md", content="the body")]

    assert client.get("/memory").json()["memories"][0]["content"] is None

    body = client.get("/memory", params={"include_content": True}).json()
    assert body["memories"][0]["content"] == "the body"
    assert fake.listed[-1][1]["view"] == "full"


def test_agent_delete_removes_the_file(client, fake):
    fake.memories = [memory_item("mem_1", "/a.md")]

    body = client.delete("/memory/mem_1", params={"source": "agent"}).json()

    assert body == {"id": "mem_1", "deleted": True}
    assert fake.deleted == [("mem_1", STORE_ID)]


def test_agent_delete_of_unknown_id_is_404(client):
    response = client.delete("/memory/mem_nope", params={"source": "agent"})
    assert response.status_code == 404


def test_delete_refuses_to_guess_a_store(client):
    """No default on delete: the two stores hold different things."""
    assert client.delete("/memory/mem_1").status_code == 422


def test_chroma_listing_still_requires_a_tenant(client):
    response = client.get("/memory", params={"source": "chroma"})

    assert response.status_code == 422
    assert "tenant_id" in response.json()["detail"]

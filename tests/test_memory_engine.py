"""Round-trip, tenant isolation, and filter tests for memory_engine.

Runs entirely against an ephemeral in-memory Chroma client — no network,
no real Chroma Cloud credentials required.
"""

import uuid

import chromadb
import pytest

from memory_engine import (
    delete_by_filter,
    delete_memory,
    list_memories,
    query_memory,
    write_memory,
)


@pytest.fixture
def collection():
    # A fresh collection name per test: chromadb.EphemeralClient() instances
    # share process-level system state keyed by settings, so reusing a
    # collection name across tests leaks data between them even with a new
    # client object each time.
    client = chromadb.EphemeralClient()
    return client.get_or_create_collection(name=f"test-memory-{uuid.uuid4()}")


def test_write_then_query_round_trip(collection):
    write_memory(
        "tenant-a",
        "The payments service is owned by Alice.",
        {"kind": "fact"},
        collection=collection,
    )

    hits = query_memory("tenant-a", "who owns payments?", k=3, collection=collection)

    assert len(hits) == 1
    assert "Alice" in hits[0].text
    assert hits[0].metadata["tenant_id"] == "tenant-a"
    assert "timestamp" in hits[0].metadata


def test_query_is_isolated_by_tenant(collection):
    write_memory("tenant-a", "Alice owns payments.", collection=collection)
    write_memory("tenant-b", "Bob owns billing.", collection=collection)

    hits_a = query_memory("tenant-a", "who owns what?", k=5, collection=collection)
    hits_b = query_memory("tenant-b", "who owns what?", k=5, collection=collection)

    assert [h.text for h in hits_a] == ["Alice owns payments."]
    assert [h.text for h in hits_b] == ["Bob owns billing."]


def test_list_memories_respects_filters(collection):
    write_memory("tenant-a", "fact one", {"kind": "fact"}, collection=collection)
    write_memory("tenant-a", "correction one", {"kind": "correction"}, collection=collection)

    facts = list_memories("tenant-a", {"kind": "fact"}, collection=collection)
    corrections = list_memories("tenant-a", {"kind": "correction"}, collection=collection)

    assert [r.text for r in facts] == ["fact one"]
    assert [r.text for r in corrections] == ["correction one"]


def test_list_memories_does_not_leak_across_tenants(collection):
    write_memory("tenant-a", "tenant a secret", collection=collection)
    write_memory("tenant-b", "tenant b secret", collection=collection)

    records = list_memories("tenant-a", collection=collection)

    assert [r.text for r in records] == ["tenant a secret"]


def test_delete_memory_removes_it(collection):
    record_id = write_memory("tenant-a", "delete me", collection=collection)

    delete_memory(record_id, collection=collection)

    assert list_memories("tenant-a", collection=collection) == []


def test_delete_by_filter_only_affects_matching_tenant(collection):
    write_memory("tenant-a", "a1", {"kind": "fact"}, collection=collection)
    write_memory("tenant-a", "a2", {"kind": "correction"}, collection=collection)
    write_memory("tenant-b", "b1", {"kind": "fact"}, collection=collection)

    delete_by_filter("tenant-a", {"kind": "fact"}, collection=collection)

    remaining_a = {r.text for r in list_memories("tenant-a", collection=collection)}
    remaining_b = {r.text for r in list_memories("tenant-b", collection=collection)}

    assert remaining_a == {"a2"}
    assert remaining_b == {"b1"}


def test_write_metadata_cannot_override_tenant_id(collection):
    record_id = write_memory(
        "tenant-a",
        "attempted spoof",
        {"tenant_id": "tenant-b"},
        collection=collection,
    )

    records = list_memories("tenant-a", collection=collection)
    assert any(r.id == record_id for r in records)

    leaked = list_memories("tenant-b", collection=collection)
    assert leaked == []

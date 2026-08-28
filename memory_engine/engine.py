"""Public API for the ChromaDB-backed memory engine.

See specs/01-memory-engine-chromadb.md for the spec this implements, and
memory_engine/README.md for the schema/isolation decisions made here.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from chromadb.api.models.Collection import Collection

from memory_engine.client import get_collection
from memory_engine.schemas import MemoryHit, MemoryRecord


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _with_tenant(tenant_id: str, filters: dict[str, Any] | None) -> dict[str, Any]:
    """Merge caller filters with the tenant scope into a Chroma `where` clause.

    tenant_id always wins — a caller can never widen a query past its own
    tenant, even if it tries to pass tenant_id in `filters` itself. Chroma's
    `where` requires exactly one top-level operator, so anything beyond a
    single equality condition must be wrapped in `$and`.
    """
    conditions = {k: v for k, v in (filters or {}).items() if k != "tenant_id"}
    conditions["tenant_id"] = tenant_id

    if len(conditions) == 1:
        return conditions
    return {"$and": [{k: v} for k, v in conditions.items()]}


def write_memory(
    tenant_id: str,
    text: str,
    metadata: dict[str, Any] | None = None,
    *,
    collection: Collection | None = None,
) -> str:
    """Store one memory and return its id.

    `metadata` may include session_id, user_id, source, kind. `tenant_id`
    and `timestamp` are set by the engine, not trusted from the caller —
    tenant_id is the isolation boundary every query/delete filters on.
    """
    coll = collection or get_collection()
    record_id = str(uuid.uuid4())
    full_metadata = dict(metadata or {})
    full_metadata["tenant_id"] = tenant_id
    full_metadata.setdefault("timestamp", _now_iso())

    coll.add(ids=[record_id], documents=[text], metadatas=[full_metadata])
    return record_id


def query_memory(
    tenant_id: str,
    query_text: str,
    k: int = 5,
    filters: dict[str, Any] | None = None,
    *,
    collection: Collection | None = None,
) -> list[MemoryHit]:
    """Semantic search scoped to a tenant, optionally narrowed by metadata filters."""
    coll = collection or get_collection()
    where = _with_tenant(tenant_id, filters)

    result = coll.query(query_texts=[query_text], n_results=k, where=where)

    ids = result["ids"][0]
    documents = result["documents"][0]
    metadatas = result["metadatas"][0]
    distances = result["distances"][0]

    return [
        MemoryHit(id=i, text=d, metadata=m, distance=dist)
        for i, d, m, dist in zip(ids, documents, metadatas, distances)
    ]


def list_memories(
    tenant_id: str,
    filters: dict[str, Any] | None = None,
    *,
    collection: Collection | None = None,
) -> list[MemoryRecord]:
    """List memories for a tenant (no similarity ranking) — used by the
    frontend's memory-inspector panel."""
    coll = collection or get_collection()
    where = _with_tenant(tenant_id, filters)

    result = coll.get(where=where)

    return [
        MemoryRecord(id=i, text=d, metadata=m)
        for i, d, m in zip(result["ids"], result["documents"], result["metadatas"])
    ]


def get_memory(
    tenant_id: str, record_id: str, *, collection: Collection | None = None
) -> MemoryRecord | None:
    """Fetch one memory by id, scoped to a tenant.

    Returns None both when the id doesn't exist and when it belongs to a
    different tenant — callers (e.g. a delete endpoint deciding whether to
    404) shouldn't be able to distinguish "not found" from "not yours".
    """
    coll = collection or get_collection()
    result = coll.get(ids=[record_id])
    if not result["ids"]:
        return None

    metadata = result["metadatas"][0]
    if metadata.get("tenant_id") != tenant_id:
        return None

    return MemoryRecord(id=result["ids"][0], text=result["documents"][0], metadata=metadata)


def delete_memory(record_id: str, *, collection: Collection | None = None) -> None:
    """Delete one memory by id.

    Does not check tenant ownership — callers that need tenant-scoped
    deletes should call get_memory() first (see backend's DELETE /memory/{id}).
    """
    coll = collection or get_collection()
    coll.delete(ids=[record_id])


def delete_by_filter(
    tenant_id: str,
    filters: dict[str, Any] | None = None,
    *,
    collection: Collection | None = None,
) -> None:
    """Hard-delete every memory for a tenant matching filters.

    This is a hard delete, not a tombstone — see README.md for why, and
    for the follow-up needed if the curation policy ends up wanting a
    soft-delete/supersede model instead.
    """
    coll = collection or get_collection()
    where = _with_tenant(tenant_id, filters)
    coll.delete(where=where)

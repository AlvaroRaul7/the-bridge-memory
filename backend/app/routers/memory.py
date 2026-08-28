"""Long-term memory: write, semantic search, list, delete.

This is the ChromaDB-backed long-term tier (see specs/01-memory-engine-chromadb.md),
distinct from the Managed Agent's own native `/mnt/memory/` mount, which
remains the short-term/conversational memory handled by agents.py + the
/session routes. No Chroma-specific logic lives here — it's a thin HTTP
layer over memory_engine, per specs/02-backend-fastapi.md.

tenant_id is required on every route and is the isolation boundary:
memory_engine enforces it server-side, so a caller can narrow a query with
extra filters but can never widen it past its own tenant.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from memory_engine import (
    delete_memory as engine_delete_memory,
    get_memory,
    list_memories as engine_list_memories,
    query_memory,
    write_memory,
)

from ..deps import require_api_key
from ..schemas import (
    DeletedMemory,
    MemoryHit,
    MemoryListResponse,
    MemoryRecord,
    MemoryWriteRequest,
    MemoryWriteResponse,
)

router = APIRouter(
    prefix="/memory", tags=["memory"], dependencies=[Depends(require_api_key)]
)


@router.post("", response_model=MemoryWriteResponse, status_code=status.HTTP_201_CREATED)
def create_memory(body: MemoryWriteRequest) -> MemoryWriteResponse:
    memory_id = write_memory(body.tenant_id, body.text, body.metadata)
    return MemoryWriteResponse(id=memory_id)


@router.get("/search", response_model=list[MemoryHit])
def search_memory(
    tenant_id: str = Query(..., min_length=1),
    q: str = Query(..., min_length=1),
    k: int = Query(default=5, ge=1, le=50),
) -> list[MemoryHit]:
    hits = query_memory(tenant_id, q, k=k)
    return [
        MemoryHit(id=h.id, text=h.text, metadata=h.metadata, distance=h.distance)
        for h in hits
    ]


@router.get("", response_model=MemoryListResponse)
def list_memories(tenant_id: str = Query(..., min_length=1)) -> MemoryListResponse:
    records = engine_list_memories(tenant_id)
    return MemoryListResponse(
        tenant_id=tenant_id,
        memories=[MemoryRecord(id=r.id, text=r.text, metadata=r.metadata) for r in records],
    )


@router.delete("/{memory_id}", response_model=DeletedMemory)
def delete_memory(
    memory_id: str, tenant_id: str = Query(..., min_length=1)
) -> DeletedMemory:
    # get_memory() first so a caller can't delete another tenant's memory by
    # guessing/enumerating ids — a bare `delete(ids=[memory_id])` in Chroma
    # doesn't check ownership.
    record = get_memory(tenant_id, memory_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    engine_delete_memory(memory_id)
    return DeletedMemory(id=memory_id)

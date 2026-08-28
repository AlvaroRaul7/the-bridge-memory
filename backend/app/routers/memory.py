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

from typing import Literal

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException, Query, status

from memory_engine import (
    delete_memory as engine_delete_memory,
    get_memory,
    list_memories as engine_list_memories,
    query_memory,
    write_memory,
)

from .. import agents, curator
from ..deps import get_client, require_api_key
from ..schemas import (
    AgentMemoryListResponse,
    CurateRequest,
    CurationReport,
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


@router.get("", response_model=AgentMemoryListResponse | MemoryListResponse)
def list_memories(
    source: Literal["agent", "chroma"] = Query(
        default="agent",
        description=(
            "Which store to read. 'agent' is the memory the agent actually "
            "wrote during its sessions; 'chroma' is the vector tier."
        ),
    ),
    customer_id: str | None = Query(default=None, description="Required when source=agent."),
    module: str | None = Query(
        default=None,
        description=(
            "Only used when source=agent, and it must match the module the "
            "session was opened with — the store is scoped to (customer, "
            "module), so omitting it reads a different, customer-wide store."
        ),
    ),
    tenant_id: str | None = Query(default=None, description="Required when source=chroma."),
    path_prefix: str = Query(default="/", description="Only used when source=agent."),
    include_content: bool = Query(default=False, description="Only used when source=agent."),
    client: Anthropic = Depends(get_client),
) -> AgentMemoryListResponse | MemoryListResponse:
    """List long-term memory.

    Defaults to `source=agent`. That default matters: the agent writes markdown
    into its own memory store during a session and has no tool that can reach
    this service, so the Chroma tier stays empty unless something explicitly
    populates it. A caller asking "what does the agent remember?" wants the
    store, and defaulting to Chroma answered that question with an empty list.
    """
    if source == "agent":
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="customer_id is required when source=agent.",
            )
        memory_store_id = agents.get_or_create_customer_store(
            client, customer_id, module=module
        )
        return agents.list_store_memories(
            client,
            memory_store_id=memory_store_id,
            path_prefix=path_prefix,
            include_content=include_content,
        )

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="tenant_id is required when source=chroma.",
        )

    records = engine_list_memories(tenant_id)
    return MemoryListResponse(
        tenant_id=tenant_id,
        memories=[MemoryRecord(id=r.id, text=r.text, metadata=r.metadata) for r in records],
    )


@router.delete("/{memory_id}", response_model=DeletedMemory)
def delete_memory(
    memory_id: str,
    source: Literal["agent", "chroma"] = Query(
        ...,
        description=(
            "Required, with no default: the two stores hold different things "
            "and a wrong guess destroys data."
        ),
    ),
    customer_id: str | None = Query(default=None, description="Required when source=agent."),
    module: str | None = Query(
        default=None, description="Only used when source=agent. See GET /memory."
    ),
    tenant_id: str | None = Query(default=None, description="Required when source=chroma."),
    client: Anthropic = Depends(get_client),
) -> DeletedMemory:
    if source == "agent":
        if not customer_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="customer_id is required when source=agent.",
            )
        memory_store_id = agents.get_or_create_customer_store(
            client, customer_id, module=module
        )
        agents.delete_store_memory(client, memory_id, memory_store_id=memory_store_id)
        return DeletedMemory(id=memory_id)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="tenant_id is required when source=chroma.",
        )

    # get_memory() first so a caller can't delete another tenant's memory by
    # guessing/enumerating ids — a bare `delete(ids=[memory_id])` in Chroma
    # doesn't check ownership.
    record = get_memory(tenant_id, memory_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    engine_delete_memory(memory_id)
    return DeletedMemory(id=memory_id)


@router.post("/curate", response_model=CurationReport)
def curate_memory(
    body: CurateRequest, client: Anthropic = Depends(get_client)
) -> CurationReport:
    """Tier-1 stretch goal: the memory-curator pattern, over this tenant's
    long-term Chroma memories rather than the native /mnt/memory/ store."""
    return curator.curate(client, body.tenant_id)

"""Read access to the agent's long-term memory store.

This service does not write memory and does not decide what is worth
remembering — the agent does that inside its session. These endpoints exist so
a UI can show what it chose to keep, and so a demo can clear a file.
"""

from __future__ import annotations

from anthropic import Anthropic
from fastapi import APIRouter, Depends, Query

from .. import agents
from ..config import Settings
from ..deps import get_client, get_settings, require_api_key
from ..schemas import DeletedMemory, MemoryListResponse

router = APIRouter(
    prefix="/memory", tags=["memory"], dependencies=[Depends(require_api_key)]
)


@router.get("", response_model=MemoryListResponse)
def list_memories(
    path_prefix: str = Query(default="/"),
    include_content: bool = Query(
        default=False, description="Fetch file bodies as well as metadata."
    ),
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> MemoryListResponse:
    return agents.list_memories(
        client,
        memory_store_id=settings.memory_store_id,
        path_prefix=path_prefix,
        include_content=include_content,
    )


@router.delete("/{memory_id}", response_model=DeletedMemory)
def delete_memory(
    memory_id: str,
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> DeletedMemory:
    agents.delete_memory(
        client, memory_id, memory_store_id=settings.memory_store_id
    )
    return DeletedMemory(id=memory_id)

"""Pydantic models for the HTTP surface.

These are the only shapes the routers deal in. SDK objects are mapped into them
in agents.py and never reach a response body, so nothing internal leaks and the
routers stay testable without the Anthropic client.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# --- sessions ---------------------------------------------------------------


class SessionCreateRequest(BaseModel):
    title: str | None = Field(
        default=None, description="Shown in the Console session list."
    )
    instructions: str | None = Field(
        default=None,
        description=(
            "Per-session guidance for the mounted memory store, injected into "
            "the agent's system prompt alongside the store's own description."
        ),
    )


class SessionUsage(BaseModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    active_seconds: float | None = None
    list_cost: str | None = Field(
        default=None,
        description="Consumption priced at public list rates, in minor units.",
    )
    currency: str | None = None


class SessionResponse(BaseModel):
    id: str
    status: str
    title: str | None = None
    created_at: datetime | None = None
    memory_store_id: str
    usage: SessionUsage | None = None


# --- messages ---------------------------------------------------------------


class MessageRequest(BaseModel):
    text: str = Field(min_length=1)


class ToolUse(BaseModel):
    """A tool call the agent made during the turn.

    `touched_memory` marks calls against the mounted store, which is what makes
    the "what did it remember" panel in Spec 3 worth rendering.
    """

    name: str
    target: str | None = None
    touched_memory: bool = False


class MessageResponse(BaseModel):
    session_id: str
    text: str
    stop_reason: Literal[
        "end_turn",
        "requires_action",
        "retries_exhausted",
        "budget_reached",
        "terminated",
        "timeout",
    ]
    tool_uses: list[ToolUse] = Field(default_factory=list)


# --- memory (ChromaDB-backed, via memory_engine) ----------------------------
#
# These mirror memory_engine.schemas.MemoryRecord/MemoryHit 1:1 (see
# specs/01-memory-engine-chromadb.md) rather than the Managed Agents native
# memory store's file/path shape — this is a separate, tenant-scoped memory
# system, not a proxy onto the agent's own /mnt/memory/.


class MemoryWriteRequest(BaseModel):
    tenant_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemoryWriteResponse(BaseModel):
    id: str


class MemoryRecord(BaseModel):
    id: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemoryHit(MemoryRecord):
    distance: float


class MemoryListResponse(BaseModel):
    tenant_id: str
    memories: list[MemoryRecord]


class DeletedMemory(BaseModel):
    id: str
    deleted: bool = True


# --- misc -------------------------------------------------------------------


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class ErrorResponse(BaseModel):
    detail: str
    error: dict[str, Any] | None = None

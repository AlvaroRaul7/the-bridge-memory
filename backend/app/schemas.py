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


# --- memory -----------------------------------------------------------------


class MemoryRecord(BaseModel):
    id: str
    path: str
    size_bytes: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    content: str | None = Field(
        default=None, description="Only populated when include_content=true."
    )


class MemoryListResponse(BaseModel):
    memory_store_id: str
    memories: list[MemoryRecord]
    prefixes: list[str] = Field(
        default_factory=list,
        description="Directory-like nodes returned when listing hierarchically.",
    )


class DeletedMemory(BaseModel):
    id: str
    deleted: bool = True


# --- misc -------------------------------------------------------------------


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class ErrorResponse(BaseModel):
    detail: str
    error: dict[str, Any] | None = None

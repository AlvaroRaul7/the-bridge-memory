"""Session endpoints — the chat surface over Managed Agents."""

from __future__ import annotations

import json

from anthropic import Anthropic
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from .. import agents
from ..config import Settings
from ..deps import get_client, get_settings, require_api_key
from ..schemas import (
    AttachDocumentsRequest,
    AttachDocumentsResponse,
    MessageRequest,
    MessageResponse,
    SessionCreateRequest,
    SessionResponse,
)

router = APIRouter(
    prefix="/session", tags=["session"], dependencies=[Depends(require_api_key)]
)


@router.post("", response_model=SessionResponse, status_code=201)
def create_session(
    body: SessionCreateRequest,
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    memory_store_id = agents.get_or_create_customer_store(client, body.customer_id)
    return agents.create_session(
        client,
        agent_id=settings.agent_id,
        environment_id=settings.environment_id,
        memory_store_id=memory_store_id,
        title=body.title,
        instructions=body.instructions,
    )


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    customer_id: str = Query(
        ..., min_length=1, description="Same customer_id passed to POST /session."
    ),
    client: Anthropic = Depends(get_client),
) -> SessionResponse:
    memory_store_id = agents.get_or_create_customer_store(client, customer_id)
    return agents.get_session(client, session_id, memory_store_id=memory_store_id)


@router.post("/{session_id}/message", response_model=MessageResponse)
def send_message(
    session_id: str,
    body: MessageRequest,
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    """Blocks for the whole agent turn — tens of seconds is normal.

    See the README for the SSE variant if that becomes a problem behind a proxy.
    """
    return agents.ask(
        client,
        session_id,
        body.text,
        timeout_seconds=settings.agent_timeout_seconds,
    )


@router.post("/{session_id}/message/stream")
def send_message_stream(
    session_id: str,
    body: MessageRequest,
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """SSE counterpart to POST /message: the same agent turn, sent as
    `data: <json>\\n\\n` chunks as text arrives instead of blocking for the
    whole reply. Each chunk is one of:
      {"type": "text", "text": ...}
      {"type": "done", "stop_reason": ..., "tool_uses": [...]}
      {"type": "error", "message": ...}
    """

    def event_source():
        for chunk in agents.ask_stream(
            client,
            session_id,
            body.text,
            timeout_seconds=settings.agent_timeout_seconds,
        ):
            yield f"data: {json.dumps(chunk)}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


@router.post(
    "/{session_id}/documents", response_model=AttachDocumentsResponse, status_code=201
)
def attach_documents(
    session_id: str,
    body: AttachDocumentsRequest,
    client: Anthropic = Depends(get_client),
) -> AttachDocumentsResponse:
    """Upload documents via the Files API and add them to this session's
    accumulated set (Tier-3 "growing document sets"). Call again with a new
    batch to grow it further — every subsequent /message call references the
    whole accumulated set, not just the latest batch."""
    return agents.attach_documents(client, session_id, body.documents)

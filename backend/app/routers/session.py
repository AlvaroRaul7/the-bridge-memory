"""Session endpoints — the chat surface over Managed Agents."""

from __future__ import annotations

from anthropic import Anthropic
from fastapi import APIRouter, Depends

from .. import agents
from ..config import Settings
from ..deps import get_client, get_settings, require_api_key
from ..schemas import (
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
    return agents.create_session(
        client,
        agent_id=settings.agent_id,
        environment_id=settings.environment_id,
        memory_store_id=settings.memory_store_id,
        title=body.title,
        instructions=body.instructions,
    )


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    return agents.get_session(
        client, session_id, memory_store_id=settings.memory_store_id
    )


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

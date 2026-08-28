"""Session endpoints — the chat surface over Managed Agents."""

from __future__ import annotations

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException, status

from .. import agents
from ..config import Settings
from ..deps import get_client, get_settings, require_api_key
from ..modules import ModuleError, ModuleResources, resources_for
from ..schemas import (
    MessageRequest,
    MessageResponse,
    SessionCreateRequest,
    SessionResponse,
)

router = APIRouter(
    prefix="/session", tags=["session"], dependencies=[Depends(require_api_key)]
)


def _resources(body_module: str | None, settings: Settings) -> ModuleResources:
    """Per-module resources, falling back to the single-agent configuration.

    A module with no provisioned agent is a 404 naming the module, not a 422
    from the upstream API saying "invalid agent ID" — the caller can act on the
    former and cannot act on the latter.
    """
    if body_module is None:
        return ModuleResources(
            agent_id=settings.agent_id,
            environment_id=settings.environment_id,
            memory_store_id=settings.memory_store_id,
        )
    try:
        return resources_for(body_module)
    except ModuleError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("", response_model=SessionResponse, status_code=201)
def create_session(
    body: SessionCreateRequest,
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    resources = _resources(body.module, settings)
    session = agents.create_session(
        client,
        agent_id=resources.agent_id,
        environment_id=resources.environment_id,
        memory_store_id=resources.memory_store_id,
        title=body.title,
        instructions=body.instructions,
    )
    return session.model_copy(update={"module": body.module})


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

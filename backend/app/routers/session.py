"""Session endpoints — the chat surface over Managed Agents."""

from __future__ import annotations

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import agents
from ..config import Settings
from ..deps import get_client, get_settings, require_api_key
from ..modules import ModuleError, resources_for
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


def _agent_and_environment(
    body_module: str | None, settings: Settings
) -> tuple[str, str]:
    """Which agent answers, falling back to the single-agent configuration.

    Only these two ids come from the module. The memory store does not: it is
    get-or-created per (customer, module) at session time, so there is nothing
    static to resolve here.

    A module with no provisioned agent is a 404 naming the module, not a 422
    from the upstream API saying "invalid agent ID" — the caller can act on the
    former and cannot act on the latter.
    """
    if body_module is None:
        return settings.agent_id, settings.environment_id
    try:
        resources = resources_for(body_module)
    except ModuleError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return resources.agent_id, resources.environment_id


@router.post("", response_model=SessionResponse, status_code=201)
def create_session(
    body: SessionCreateRequest,
    client: Anthropic = Depends(get_client),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    # Two independent axes, and both matter: the module decides *which agent*
    # answers, the customer decides *whose memory* it reads. Mounting the
    # module's own provisioned store would leak one customer's notes to the
    # next; mounting a customer-wide store would let their onboarding history
    # surface inside a diligence session. Scope the store to both.
    agent_id, environment_id = _agent_and_environment(body.module, settings)
    memory_store_id = agents.get_or_create_customer_store(
        client, body.customer_id, module=body.module
    )
    session = agents.create_session(
        client,
        agent_id=agent_id,
        environment_id=environment_id,
        memory_store_id=memory_store_id,
        title=body.title,
        instructions=body.instructions,
    )
    return session.model_copy(update={"module": body.module})


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    customer_id: str = Query(
        ..., min_length=1, description="Same customer_id passed to POST /session."
    ),
    module: str | None = Query(
        default=None, description="Same module passed to POST /session."
    ),
    client: Anthropic = Depends(get_client),
) -> SessionResponse:
    memory_store_id = agents.get_or_create_customer_store(
        client, customer_id, module=module
    )
    session = agents.get_session(client, session_id, memory_store_id=memory_store_id)
    return session.model_copy(update={"module": module})


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

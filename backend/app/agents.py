"""The Managed Agents layer.

This is the only module that imports `anthropic`. Everything above it deals in
the Pydantic models from schemas.py, which is what lets the routers be tested
without a network or an API key.

The session/streaming flow is lifted from run_session_1.py, with one behavioural
fix — see `ask()`.
"""

from __future__ import annotations

import time
from typing import Any

from anthropic import Anthropic

from .schemas import MessageResponse, SessionResponse, SessionUsage, ToolUse

MEMORY_MOUNT = "/mnt/memory"

DEFAULT_STORE_INSTRUCTIONS = (
    "This is your persistent institutional memory, mounted at /mnt/memory/. "
    "Read it before answering. Record what you learn for future sessions."
)


# --- mapping helpers --------------------------------------------------------


def _usage(session: Any) -> SessionUsage | None:
    usage = getattr(session, "usage", None)
    if usage is None:
        return None

    list_cost = getattr(usage, "list_cost", None)
    return SessionUsage(
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
        active_seconds=getattr(usage, "active_seconds", None),
        list_cost=getattr(list_cost, "amount", None),
        currency=getattr(list_cost, "currency", None),
    )


def _session_response(session: Any, memory_store_id: str) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        status=getattr(session, "status", "unknown"),
        title=getattr(session, "title", None),
        created_at=getattr(session, "created_at", None),
        memory_store_id=memory_store_id,
        usage=_usage(session),
    )


def _tool_use(event: Any) -> ToolUse:
    """Summarise a tool-use event, flagging the ones that touched the store."""
    payload = getattr(event, "input", None) or {}
    target = None
    if isinstance(payload, dict):
        for key in ("path", "file_path", "command"):
            value = payload.get(key)
            if value:
                target = str(value)
                break

    return ToolUse(
        name=getattr(event, "name", "?"),
        target=target,
        touched_memory=MEMORY_MOUNT in (target or ""),
    )


# --- sessions ---------------------------------------------------------------


def create_session(
    client: Anthropic,
    *,
    agent_id: str,
    environment_id: str,
    memory_store_id: str,
    title: str | None = None,
    instructions: str | None = None,
) -> SessionResponse:
    """Open a session with the long-term memory store mounted read_write."""
    session = client.beta.sessions.create(
        agent=agent_id,
        environment_id=environment_id,
        title=title or "chat",
        resources=[
            {
                "type": "memory_store",
                "memory_store_id": memory_store_id,
                "access": "read_write",
                "instructions": instructions or DEFAULT_STORE_INSTRUCTIONS,
            }
        ],
    )
    return _session_response(session, memory_store_id)


def get_session(
    client: Anthropic, session_id: str, *, memory_store_id: str
) -> SessionResponse:
    session = client.beta.sessions.retrieve(session_id)
    return _session_response(session, memory_store_id)


def ask(
    client: Anthropic,
    session_id: str,
    text: str,
    *,
    timeout_seconds: float = 300.0,
) -> MessageResponse:
    """Send one user message and collect the agent's reply.

    The gate below is the reason this function exists rather than being inlined.
    run_session_1.py breaks the loop on a bare `session.status_idle`, but
    sessions go idle *transiently* — between parallel tool calls, or while
    waiting on a tool confirmation. Breaking there truncates the reply
    mid-answer, and does so intermittently, which is the worst kind of bug to
    find later. We continue on `requires_action` and only stop on a terminal
    stop reason.

    Continuing forever would be its own hang, though: if the agent really is
    blocked awaiting a tool result nobody is going to send, the stream just
    sits there. So the loop is bounded by a wall-clock deadline and reports
    `timeout` rather than pretending the turn finished.
    """
    parts: list[str] = []
    tool_uses: list[ToolUse] = []
    stop_reason = "timeout"
    deadline = time.monotonic() + timeout_seconds

    with client.beta.sessions.events.stream(session_id) as stream:
        client.beta.sessions.events.send(
            session_id,
            events=[{"type": "user.message", "content": [{"type": "text", "text": text}]}],
        )

        for event in stream:
            event_type = getattr(event, "type", None)

            if event_type == "agent.message":
                for block in getattr(event, "content", None) or []:
                    if getattr(block, "type", None) == "text":
                        parts.append(block.text)

            elif event_type == "agent.tool_use":
                tool_uses.append(_tool_use(event))

            elif event_type == "session.status_terminated":
                stop_reason = "terminated"
                break

            elif event_type == "session.status_idle":
                reason = getattr(getattr(event, "stop_reason", None), "type", "end_turn")
                if reason == "requires_action":
                    # Waiting on us, not finished. Keep reading.
                    if time.monotonic() > deadline:
                        break
                    continue
                stop_reason = reason
                break

            if time.monotonic() > deadline:
                break

    return MessageResponse(
        session_id=session_id,
        text="".join(parts),
        stop_reason=stop_reason,
        tool_uses=tool_uses,
    )


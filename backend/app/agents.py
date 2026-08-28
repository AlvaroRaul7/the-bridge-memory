"""The Managed Agents layer.

This is the only module that imports `anthropic`. Everything above it deals in
the Pydantic models from schemas.py, which is what lets the routers be tested
without a network or an API key.

The session/streaming flow is lifted from run_session_1.py, with one behavioural
fix — see `ask()`.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Iterable

from anthropic import Anthropic

from .schemas import (
    AgentMemoryListResponse,
    AgentMemoryRecord,
    AttachDocumentsResponse,
    DocumentUpload,
    MessageResponse,
    SessionResponse,
    SessionUsage,
    ToolUse,
)

MEMORY_MOUNT = "/mnt/memory"

DEFAULT_STORE_INSTRUCTIONS = (
    "This is your persistent institutional memory, mounted at /mnt/memory/. "
    "Read it before answering. Record what you learn for future sessions."
)


def _store_instructions(extra: str | None) -> str:
    """The memory protocol, plus any per-session guidance.

    Appended, never substituted. `extra or DEFAULT` looked harmless but meant
    a caller that passed *any* guidance — the UI passes which assistant this
    is on every session — silently dropped the only text telling the agent to
    read the store before answering and write to it afterwards. The store
    stayed mounted and stayed empty, and the agent was right to say so.
    """
    if not extra:
        return DEFAULT_STORE_INSTRUCTIONS
    return f"{DEFAULT_STORE_INSTRUCTIONS}\n\n{extra}"

# backend/app/agents.py -> backend/app -> backend -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[2]

# Overridable so tests don't write into the real repo — see conftest.py's
# isolated_customer_store_registry fixture.
CUSTOMER_STORE_REGISTRY_PATH = Path(
    os.environ.get("CUSTOMER_STORE_REGISTRY_PATH")
    or (_REPO_ROOT / ".customer_memory_stores.json")
)

# Files attached via attach_documents(), by session id. Process-local: a
# second backend instance or a restart loses this — fine for a demo, not for
# production (see backend/README.md).
_SESSION_DOCUMENTS: dict[str, list[str]] = {}


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


# --- per-customer memory store (Tier-3 "tie memory to a customer_id") ------


def _load_customer_store_registry() -> dict[str, str]:
    if CUSTOMER_STORE_REGISTRY_PATH.exists():
        return json.loads(CUSTOMER_STORE_REGISTRY_PATH.read_text())
    return {}


def _save_customer_store_registry(registry: dict[str, str]) -> None:
    CUSTOMER_STORE_REGISTRY_PATH.write_text(json.dumps(registry, indent=2))


def get_or_create_customer_store(
    client: Anthropic, customer_id: str, *, module: str | None = None
) -> str:
    """Get-or-create the memory store scoped to one customer, per module.

    Every session used to mount the single store in MEMORY_STORE_ID, shared
    by every caller regardless of who they were. This ties the store to
    customer_id instead — tagged in the store's own metadata, and cached in
    a local registry so the same customer always gets the same store back
    rather than a fresh one every session.

    `module` is the second scoping axis. The same customer talking to the
    onboarding assistant and to the diligence assistant should not share one
    pile of notes: a restated EBITDA figure is not an answer to "how do I get
    prod access". Omitting it keeps the customer-wide store, so a
    single-agent deployment behaves exactly as before.
    """
    key = f"{module}:{customer_id}" if module else customer_id

    registry = _load_customer_store_registry()
    if key in registry:
        return registry[key]

    scope = f"customer {customer_id}" + (f" on module {module}" if module else "")
    metadata = {"customer_id": customer_id}
    if module:
        metadata["module"] = module

    store = client.beta.memory_stores.create(
        name=f"customer:{key}",
        description=f"Persistent memory for {scope}.",
        metadata=metadata,
    )
    registry[key] = store.id
    _save_customer_store_registry(registry)
    return store.id


# --- documents (Files API, Tier-3 "growing document sets") -----------------


def upload_document(
    client: Anthropic, filename: str, content: str, media_type: str = "text/plain"
) -> str:
    """Upload one document via the Files API and return its file id."""
    file = client.files.upload(file=(filename, content.encode("utf-8"), media_type))
    return file.id


def attach_documents(
    client: Anthropic, session_id: str, documents: list[DocumentUpload]
) -> AttachDocumentsResponse:
    """Upload a batch of documents and add them to this session's accumulated
    set. Call this again with a new batch to grow it further — ask() attaches
    the whole accumulated set to every subsequent message."""
    new_ids = [
        upload_document(client, doc.filename, doc.content, doc.media_type)
        for doc in documents
    ]
    attached = _SESSION_DOCUMENTS.setdefault(session_id, [])
    attached.extend(new_ids)

    return AttachDocumentsResponse(
        session_id=session_id, file_ids=list(attached), total_files=len(attached)
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
                "instructions": _store_instructions(instructions),
            }
        ],
    )
    return _session_response(session, memory_store_id)


def get_session(
    client: Anthropic, session_id: str, *, memory_store_id: str
) -> SessionResponse:
    session = client.beta.sessions.retrieve(session_id)
    return _session_response(session, memory_store_id)


def _message_content(session_id: str, text: str) -> list[dict[str, Any]]:
    """Build the content blocks for one outgoing user message.

    References every document attached so far (see attach_documents()) as
    file-source document blocks, same shape the standard Messages API uses
    for a Files-API upload — ahead of the text block, growing with each
    attach_documents() call rather than re-inlining doc text every turn.
    """
    content: list[dict[str, Any]] = [
        {"type": "document", "source": {"type": "file", "file_id": file_id}}
        for file_id in _SESSION_DOCUMENTS.get(session_id, [])
    ]
    content.append({"type": "text", "text": text})
    return content


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

    content = _message_content(session_id, text)

    with client.beta.sessions.events.stream(session_id) as stream:
        client.beta.sessions.events.send(
            session_id,
            events=[{"type": "user.message", "content": content}],
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


def ask_stream(
    client: Anthropic,
    session_id: str,
    text: str,
    *,
    timeout_seconds: float = 300.0,
) -> Iterable[dict[str, Any]]:
    """SSE counterpart to ask() — same event loop and idle/requires_action
    gate (see ask()'s docstring), yielding instead of accumulating.

    Opts into `event_deltas=["agent.message"]`, which previews the reply as
    `event_delta` fragments before the buffered `agent.message` event
    arrives. Deltas are best-effort and may stop early, so on each buffered
    `agent.message` we only yield whatever text wasn't already covered by
    its deltas — this guarantees the full reply is always seen even if a
    delta preview cuts out, without ever re-yielding the same text twice.

    Yields dicts:
      {"type": "text", "text": <fragment>}
      {"type": "done", "stop_reason": ..., "tool_uses": [...]}
      {"type": "error", "message": ...}
    """
    tool_uses: list[ToolUse] = []
    stop_reason = "timeout"
    deadline = time.monotonic() + timeout_seconds
    streamed_for_event: dict[str, str] = {}

    content = _message_content(session_id, text)

    try:
        with client.beta.sessions.events.stream(
            session_id, event_deltas=["agent.message"]
        ) as stream:
            client.beta.sessions.events.send(
                session_id,
                events=[{"type": "user.message", "content": content}],
            )

            for event in stream:
                event_type = getattr(event, "type", None)

                if event_type == "event_delta":
                    delta = getattr(event, "delta", None)
                    if getattr(delta, "type", None) == "content_delta":
                        block = getattr(delta, "content", None)
                        if getattr(block, "type", None) == "text" and block.text:
                            event_id = event.event_id
                            streamed_for_event[event_id] = (
                                streamed_for_event.get(event_id, "") + block.text
                            )
                            yield {"type": "text", "text": block.text}

                elif event_type == "agent.message":
                    full_text = "".join(
                        block.text
                        for block in getattr(event, "content", None) or []
                        if getattr(block, "type", None) == "text"
                    )
                    already = streamed_for_event.pop(event.id, "")
                    remainder = (
                        full_text[len(already) :]
                        if full_text.startswith(already)
                        else full_text
                    )
                    if remainder:
                        yield {"type": "text", "text": remainder}

                elif event_type == "agent.tool_use":
                    tool_uses.append(_tool_use(event))

                elif event_type == "session.status_terminated":
                    stop_reason = "terminated"
                    break

                elif event_type == "session.status_idle":
                    reason = getattr(
                        getattr(event, "stop_reason", None), "type", "end_turn"
                    )
                    if reason == "requires_action":
                        # Waiting on us, not finished. Keep reading.
                        if time.monotonic() > deadline:
                            break
                        continue
                    stop_reason = reason
                    break

                if time.monotonic() > deadline:
                    break
    except Exception as exc:  # noqa: BLE001 - reported to the client, not swallowed
        yield {"type": "error", "message": str(exc)}
        return

    yield {
        "type": "done",
        "stop_reason": stop_reason,
        "tool_uses": [t.model_dump() for t in tool_uses],
    }


# --- the agent's own memory store (read/delete only) ------------------------
#
# We never write here. The agent does that itself during a session, with
# ordinary file tools against its /mnt/memory/ mount. These functions exist so
# a UI can show what it chose to keep — which is the whole demo.


def list_store_memories(
    client: Anthropic,
    *,
    memory_store_id: str,
    path_prefix: str = "/",
    include_content: bool = False,
) -> AgentMemoryListResponse:
    """List the files the agent has written to its memory store.

    Sorted client-side: the list endpoint no longer honours `order_by` (see the
    note in inspect_memory.py), and a stable order matters for a UI panel.
    """
    page = client.beta.memory_stores.memories.list(
        memory_store_id,
        path_prefix=path_prefix,
        view="full" if include_content else "basic",
    )

    memories: list[AgentMemoryRecord] = []
    prefixes: list[str] = []

    for item in _iter_page(page):
        if getattr(item, "type", None) == "memory_prefix":
            prefixes.append(item.path)
            continue

        memories.append(
            AgentMemoryRecord(
                id=item.id,
                path=item.path,
                size_bytes=getattr(item, "content_size_bytes", None),
                created_at=getattr(item, "created_at", None),
                updated_at=getattr(item, "updated_at", None),
                content=getattr(item, "content", None) if include_content else None,
            )
        )

    memories.sort(key=lambda m: m.path)
    prefixes.sort()

    return AgentMemoryListResponse(
        memory_store_id=memory_store_id, memories=memories, prefixes=prefixes
    )


def delete_store_memory(
    client: Anthropic, memory_id: str, *, memory_store_id: str
) -> str:
    client.beta.memory_stores.memories.delete(
        memory_id, memory_store_id=memory_store_id
    )
    return memory_id


def _iter_page(page: Any) -> Iterable[Any]:
    """Iterate a cursor page without assuming it auto-paginates."""
    data = getattr(page, "data", None)
    return data if data is not None else page

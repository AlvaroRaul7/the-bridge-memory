"""Test fixtures.

Everything here runs without a network, without an ANTHROPIC_API_KEY, and
without the `.agent_id` dotfiles: the Anthropic client is replaced by a fake
exposing just the slice of `client.beta.*` that agents.py touches.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Iterable

import pytest

# Must be set before app.config reads them.
os.environ.setdefault("BACKEND_API_KEY", "test-key")
os.environ.setdefault("AGENT_ID", "agent_test")
os.environ.setdefault("ENVIRONMENT_ID", "env_test")
os.environ.setdefault("MEMORY_STORE_ID", "memstore_test")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings, get_settings  # noqa: E402
from app.deps import get_client  # noqa: E402
from app.main import create_app  # noqa: E402

API_KEY = "test-key"
STORE_ID = "memstore_test"
NOW = datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc)


# --- event builders ---------------------------------------------------------


def agent_message(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        type="agent.message",
        content=[SimpleNamespace(type="text", text=text)],
    )


def tool_use(name: str, **payload: Any) -> SimpleNamespace:
    return SimpleNamespace(type="agent.tool_use", name=name, input=payload)


def idle(stop_reason: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(
        type="session.status_idle",
        stop_reason=SimpleNamespace(type=stop_reason),
    )


def terminated() -> SimpleNamespace:
    return SimpleNamespace(type="session.status_terminated")


def memory_item(
    memory_id: str, path: str, size: int = 10, content: str | None = None
) -> SimpleNamespace:
    return SimpleNamespace(
        type="memory",
        id=memory_id,
        path=path,
        content_size_bytes=size,
        created_at=NOW,
        updated_at=NOW,
        content=content,
    )


def memory_prefix(path: str) -> SimpleNamespace:
    return SimpleNamespace(type="memory_prefix", path=path)


# --- the fake client --------------------------------------------------------
#
# Covers client.beta.sessions.* and client.beta.memory_stores.*. The latter is
# the agent's own store — the files it writes during a session — which
# /memory?source=agent reads. The Chroma tier is separate and is tested by
# monkeypatching memory_engine calls; see tests/test_memory.py.


class FakeStream:
    def __init__(self, events: Iterable[Any]) -> None:
        self._events = list(events)

    def __enter__(self) -> "FakeStream":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def __iter__(self):
        return iter(self._events)


class FakeEvents:
    def __init__(self, owner: "FakeClient") -> None:
        self._owner = owner

    def stream(self, session_id: str, **_: Any) -> FakeStream:
        self._owner.streamed.append(session_id)
        return FakeStream(self._owner.events)

    def send(self, session_id: str, *, events: list[dict], **_: Any) -> None:
        self._owner.sent.append((session_id, events))


class FakeSessions:
    def __init__(self, owner: "FakeClient") -> None:
        self._owner = owner
        self.events = FakeEvents(owner)

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self._owner.created.append(kwargs)
        return SimpleNamespace(
            id="ses_new",
            status="idle",
            title=kwargs.get("title"),
            created_at=NOW,
            usage=None,
        )

    def retrieve(self, session_id: str, **_: Any) -> SimpleNamespace:
        return SimpleNamespace(
            id=session_id,
            status="idle",
            title="chat",
            created_at=NOW,
            usage=SimpleNamespace(
                input_tokens=120,
                output_tokens=45,
                active_seconds=3.5,
                list_cost=SimpleNamespace(amount="17", currency="USD"),
            ),
        )


class FakeMemories:
    def __init__(self, owner: "FakeClient") -> None:
        self._owner = owner

    def list(self, memory_store_id: str, **kwargs: Any) -> SimpleNamespace:
        self._owner.listed.append((memory_store_id, kwargs))
        return SimpleNamespace(data=list(self._owner.memories))

    def delete(self, memory_id: str, *, memory_store_id: str, **_: Any) -> None:
        if memory_id not in {m.id for m in self._owner.memories}:
            raise self._owner.not_found_error()
        self._owner.deleted.append((memory_id, memory_store_id))


class FakeClient:
    """Just enough of `client.beta.*` for agents.py."""

    def __init__(self) -> None:
        self.events: list[Any] = [agent_message("hello"), idle("end_turn")]
        self.created: list[dict] = []
        self.sent: list[tuple[str, list[dict]]] = []
        self.streamed: list[str] = []
        self.memories: list[Any] = []
        self.listed: list[tuple[str, dict]] = []
        self.deleted: list[tuple[str, str]] = []
        self.beta = SimpleNamespace(
            sessions=FakeSessions(self),
            memory_stores=SimpleNamespace(memories=FakeMemories(self)),
        )

    @staticmethod
    def not_found_error() -> Exception:
        import anthropic
        import httpx2

        request = httpx2.Request("DELETE", "https://api.anthropic.com/v1/memory")
        return anthropic.NotFoundError(
            "not found", response=httpx2.Response(404, request=request), body=None
        )


# --- fixtures ---------------------------------------------------------------


@pytest.fixture
def fake() -> FakeClient:
    return FakeClient()


@pytest.fixture
def app(fake: FakeClient):
    application = create_app()
    application.dependency_overrides[get_client] = lambda: fake
    return application


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app, headers={"X-API-Key": API_KEY})


@pytest.fixture
def anon(app) -> TestClient:
    """Client with no API key."""
    return TestClient(app)


@pytest.fixture
def settings_with_timeout(app):
    """Override settings so the agent loop deadline has already passed."""

    def _apply(seconds: float) -> None:
        base = get_settings()
        app.dependency_overrides[get_settings] = lambda: Settings(
            agent_id=base.agent_id,
            environment_id=base.environment_id,
            memory_store_id=base.memory_store_id,
            backend_api_key=base.backend_api_key,
            cors_origins=base.cors_origins,
            agent_timeout_seconds=seconds,
        )

    return _apply

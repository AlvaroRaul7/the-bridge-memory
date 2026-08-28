"""Session and message endpoints."""

from __future__ import annotations

from .conftest import STORE_ID, agent_message, idle, terminated, tool_use


def test_create_session_mounts_the_memory_store(client, fake):
    response = client.post("/session", json={"title": "demo"})

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "ses_new"
    assert body["memory_store_id"] == STORE_ID

    # The store must be attached at create time — it cannot be added later.
    resources = fake.created[0]["resources"]
    assert resources[0]["type"] == "memory_store"
    assert resources[0]["memory_store_id"] == STORE_ID
    assert resources[0]["access"] == "read_write"


def test_create_session_passes_custom_instructions(client, fake):
    client.post("/session", json={"instructions": "Only read /notes/."})
    assert fake.created[0]["resources"][0]["instructions"] == "Only read /notes/."


def test_get_session_reports_usage(client):
    body = client.get("/session/ses_1").json()

    assert body["status"] == "idle"
    assert body["usage"]["input_tokens"] == 120
    assert body["usage"]["list_cost"] == "17"
    assert body["usage"]["currency"] == "USD"


def test_message_returns_concatenated_text(client, fake):
    fake.events = [agent_message("Hello "), agent_message("world."), idle("end_turn")]

    body = client.post("/session/ses_1/message", json={"text": "hi"}).json()

    assert body["text"] == "Hello world."
    assert body["stop_reason"] == "end_turn"
    assert fake.sent[0][1][0]["content"][0]["text"] == "hi"


def test_transient_idle_does_not_truncate_the_reply(client, fake):
    """Regression test for the bug in run_session_1.py.

    Sessions go idle transiently — between parallel tool calls, or awaiting a
    confirmation. Breaking on a bare `session.status_idle` would stop here after
    "Part one" and silently drop the rest of the answer.
    """
    fake.events = [
        agent_message("Part one. "),
        idle("requires_action"),
        agent_message("Part two."),
        idle("end_turn"),
    ]

    body = client.post("/session/ses_1/message", json={"text": "hi"}).json()

    assert body["text"] == "Part one. Part two."
    assert body["stop_reason"] == "end_turn"


def test_terminated_session_stops_the_loop(client, fake):
    fake.events = [agent_message("partial"), terminated(), agent_message("never")]

    body = client.post("/session/ses_1/message", json={"text": "hi"}).json()

    assert body["text"] == "partial"
    assert body["stop_reason"] == "terminated"


def test_budget_reached_is_reported_not_swallowed(client, fake):
    fake.events = [agent_message("half an answer"), idle("budget_reached")]

    body = client.post("/session/ses_1/message", json={"text": "hi"}).json()

    assert body["stop_reason"] == "budget_reached"


def test_tool_uses_flag_memory_writes(client, fake):
    fake.events = [
        tool_use("bash", command="ls /mnt/memory/"),
        tool_use("write", path="/mnt/memory/policies.md"),
        tool_use("write", path="/workspace/scratch.md"),
        agent_message("done"),
        idle("end_turn"),
    ]

    tools = client.post("/session/ses_1/message", json={"text": "hi"}).json()["tool_uses"]

    assert [t["touched_memory"] for t in tools] == [True, True, False]
    assert tools[1]["target"] == "/mnt/memory/policies.md"


def test_deadline_reports_timeout_rather_than_a_clean_finish(
    client, fake, settings_with_timeout
):
    """A turn cut short by our own deadline must not look like end_turn."""
    settings_with_timeout(0.0)
    fake.events = [agent_message("started"), idle("requires_action")]

    body = client.post("/session/ses_1/message", json={"text": "hi"}).json()

    assert body["stop_reason"] == "timeout"


def test_empty_message_is_rejected(client):
    assert client.post("/session/ses_1/message", json={"text": ""}).status_code == 422

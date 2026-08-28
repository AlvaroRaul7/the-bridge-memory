"""Session and message endpoints."""

from __future__ import annotations

import json
from types import SimpleNamespace

from .conftest import (
    CUSTOMER_ID,
    STORE_ID,
    agent_message,
    content_delta,
    idle,
    terminated,
    tool_use,
    usage_snapshot,
)


def parse_sse(body: str) -> list[dict]:
    return [
        json.loads(chunk.removeprefix("data: "))
        for chunk in body.strip().split("\n\n")
        if chunk
    ]


def test_create_session_mounts_the_memory_store(client, fake):
    response = client.post("/session", json={"customer_id": CUSTOMER_ID, "title": "demo"})

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "ses_new"
    assert body["memory_store_id"] == STORE_ID

    # The store must be attached at create time — it cannot be added later.
    resources = fake.created[0]["resources"]
    assert resources[0]["type"] == "memory_store"
    assert resources[0]["memory_store_id"] == STORE_ID
    assert resources[0]["access"] == "read_write"


def test_create_session_tags_the_store_with_the_customer_id(client, fake):
    client.post("/session", json={"customer_id": CUSTOMER_ID})

    created = fake.memory_stores_created[0]
    assert created["metadata"] == {"customer_id": CUSTOMER_ID}
    assert created["name"] == f"customer:{CUSTOMER_ID}"


def test_create_session_reuses_the_same_store_for_a_returning_customer(client, fake):
    client.post("/session", json={"customer_id": CUSTOMER_ID})
    client.post("/session", json={"customer_id": CUSTOMER_ID})

    # Get-or-create: the store is only actually created once.
    assert len(fake.memory_stores_created) == 1
    assert fake.created[0]["resources"][0]["memory_store_id"] == STORE_ID
    assert fake.created[1]["resources"][0]["memory_store_id"] == STORE_ID


def test_create_session_requires_customer_id(client):
    response = client.post("/session", json={"title": "demo"})
    assert response.status_code == 422


def test_create_session_passes_custom_instructions(client, fake):
    client.post(
        "/session",
        json={"customer_id": CUSTOMER_ID, "instructions": "Only read /notes/."},
    )
    assert fake.created[0]["resources"][0]["instructions"] == "Only read /notes/."


def test_get_session_reports_usage(client):
    body = client.get("/session/ses_1", params={"customer_id": CUSTOMER_ID}).json()

    assert body["status"] == "idle"
    assert body["usage"]["input_tokens"] == 120
    assert body["usage"]["list_cost"] == "17"
    assert body["usage"]["currency"] == "USD"


def test_get_session_requires_customer_id(client):
    assert client.get("/session/ses_1").status_code == 422


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


# --- streaming (SSE counterpart to /message) --------------------------------


def test_stream_yields_deltas_as_they_arrive(client, fake):
    fake.events = [
        content_delta("evt_1", "Hello "),
        content_delta("evt_1", "world."),
        agent_message("Hello world.", event_id="evt_1"),
        idle("end_turn"),
    ]

    body = client.post("/session/ses_1/message/stream", json={"text": "hi"}).text
    chunks = parse_sse(body)

    text_chunks = [c for c in chunks if c["type"] == "text"]
    assert [c["text"] for c in text_chunks] == ["Hello ", "world."]

    done = chunks[-1]
    assert done["type"] == "done"
    assert done["stop_reason"] == "end_turn"
    assert done["tool_uses"] == []


def test_stream_does_not_duplicate_text_already_covered_by_deltas(client, fake):
    """The buffered agent.message carries the *complete* content; only the
    part not already streamed as a delta should be re-emitted."""
    fake.events = [
        content_delta("evt_1", "Hello world."),
        agent_message("Hello world.", event_id="evt_1"),
        idle("end_turn"),
    ]

    chunks = parse_sse(client.post("/session/ses_1/message/stream", json={"text": "hi"}).text)

    text_chunks = [c for c in chunks if c["type"] == "text"]
    assert [c["text"] for c in text_chunks] == ["Hello world."]


def test_stream_fills_in_text_the_deltas_missed(client, fake):
    """Deltas are best-effort and may stop early — the buffered event still
    carries the full text, so any leftover suffix must still be yielded."""
    fake.events = [
        content_delta("evt_1", "Hello "),
        agent_message("Hello world.", event_id="evt_1"),
        idle("end_turn"),
    ]

    chunks = parse_sse(client.post("/session/ses_1/message/stream", json={"text": "hi"}).text)

    text_chunks = [c for c in chunks if c["type"] == "text"]
    assert [c["text"] for c in text_chunks] == ["Hello ", "world."]


def test_stream_transient_idle_does_not_truncate_the_reply(client, fake):
    """Same regression as test_transient_idle_does_not_truncate_the_reply,
    for the streaming loop."""
    fake.events = [
        agent_message("Part one. ", event_id="evt_1"),
        idle("requires_action"),
        agent_message("Part two.", event_id="evt_2"),
        idle("end_turn"),
    ]

    chunks = parse_sse(client.post("/session/ses_1/message/stream", json={"text": "hi"}).text)

    text_chunks = [c for c in chunks if c["type"] == "text"]
    assert [c["text"] for c in text_chunks] == ["Part one. ", "Part two."]
    assert chunks[-1]["stop_reason"] == "end_turn"


def test_stream_reports_tool_uses_in_the_done_event(client, fake):
    fake.events = [
        tool_use("bash", command="ls /mnt/memory/"),
        agent_message("done", event_id="evt_1"),
        idle("end_turn"),
    ]

    chunks = parse_sse(client.post("/session/ses_1/message/stream", json={"text": "hi"}).text)

    done = chunks[-1]
    assert done["tool_uses"] == [
        {"name": "bash", "target": "ls /mnt/memory/", "touched_memory": True}
    ]


def test_stream_deadline_reports_timeout(client, fake, settings_with_timeout):
    settings_with_timeout(0.0)
    fake.events = [agent_message("started", event_id="evt_1"), idle("requires_action")]

    chunks = parse_sse(client.post("/session/ses_1/message/stream", json={"text": "hi"}).text)

    done = chunks[-1]
    assert done["type"] == "done"
    assert done["stop_reason"] == "timeout"
    assert done["tool_uses"] == []


def test_stream_reports_this_turns_usage_as_a_delta(client, fake):
    """usage in the done event is this turn's cost, not the session's
    running cumulative total — computed from two retrieve() snapshots
    taken around the turn."""
    fake.usage_sequence = [
        usage_snapshot(input_tokens=1000, output_tokens=200, list_cost=500),
        usage_snapshot(input_tokens=1150, output_tokens=245, list_cost=800),
    ]
    fake.events = [agent_message("hi there", event_id="evt_1"), idle("end_turn")]

    chunks = parse_sse(client.post("/session/ses_1/message/stream", json={"text": "hi"}).text)

    assert fake.retrieved == ["ses_1", "ses_1"]
    assert chunks[-1]["usage"] == {
        "input_tokens": 150,
        "output_tokens": 45,
        "active_seconds": 0.0,
        "list_cost": "300",
        "currency": "USD",
    }


def test_stream_usage_delta_fields_are_none_when_the_api_omits_them(client, fake):
    """Belt-and-suspenders: if the API ever omits usage fields on
    retrieve(), don't fabricate numbers out of them."""
    fake.usage_sequence = [
        usage_snapshot(input_tokens=1000, output_tokens=200, list_cost=500),
        SimpleNamespace(
            input_tokens=None, output_tokens=None, active_seconds=None, list_cost=None
        ),
    ]
    fake.events = [agent_message("hi", event_id="evt_1"), idle("end_turn")]

    chunks = parse_sse(client.post("/session/ses_1/message/stream", json={"text": "hi"}).text)

    assert chunks[-1]["usage"] == {
        "input_tokens": None,
        "output_tokens": None,
        "active_seconds": None,
        "list_cost": None,
        "currency": None,
    }


# --- documents (Files API, Tier-3 "growing document sets") -----------------


def test_attach_documents_uploads_via_files_api(client, fake):
    response = client.post(
        "/session/ses_1/documents",
        json={"documents": [{"filename": "policy.md", "content": "Be nice."}]},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["session_id"] == "ses_1"
    assert body["total_files"] == 1
    assert len(body["file_ids"]) == 1

    [(file_id, uploaded)] = fake.uploaded_files
    assert file_id == body["file_ids"][0]
    assert uploaded == ("policy.md", b"Be nice.", "text/markdown")


def test_attach_documents_accumulates_across_calls(client, fake):
    client.post(
        "/session/ses_1/documents",
        json={"documents": [{"filename": "a.md", "content": "one"}]},
    )
    second = client.post(
        "/session/ses_1/documents",
        json={
            "documents": [
                {"filename": "b.md", "content": "two"},
                {"filename": "c.md", "content": "three"},
            ]
        },
    )

    body = second.json()
    assert body["total_files"] == 3
    assert len(body["file_ids"]) == 3
    assert len(fake.uploaded_files) == 3


def test_attach_documents_is_isolated_per_session(client, fake):
    client.post(
        "/session/ses_1/documents",
        json={"documents": [{"filename": "a.md", "content": "one"}]},
    )
    response = client.post(
        "/session/ses_2/documents",
        json={"documents": [{"filename": "b.md", "content": "two"}]},
    )

    assert response.json()["total_files"] == 1


def test_attach_documents_requires_at_least_one(client):
    response = client.post("/session/ses_1/documents", json={"documents": []})
    assert response.status_code == 422


def test_message_references_every_attached_document(client, fake):
    client.post(
        "/session/ses_1/documents",
        json={"documents": [{"filename": "a.md", "content": "one"}]},
    )
    client.post(
        "/session/ses_1/documents",
        json={"documents": [{"filename": "b.md", "content": "two"}]},
    )

    client.post("/session/ses_1/message", json={"text": "hi"})

    content = fake.sent[0][1][0]["content"]
    assert [block["type"] for block in content] == ["document", "document", "text"]
    assert content[0]["source"] == {"type": "file", "file_id": "file_1"}
    assert content[1]["source"] == {"type": "file", "file_id": "file_2"}
    assert content[2]["text"] == "hi"


def test_message_with_no_attached_documents_sends_text_only(client, fake):
    client.post("/session/ses_1/message", json={"text": "hi"})

    content = fake.sent[0][1][0]["content"]
    assert content == [{"type": "text", "text": "hi"}]

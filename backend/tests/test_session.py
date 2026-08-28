"""Session and message endpoints."""

from __future__ import annotations

from .conftest import CUSTOMER_ID, STORE_ID, agent_message, idle, terminated, tool_use


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
    # Contained, not equal: the memory protocol is prepended to it. Asserting
    # equality here is what let the protocol get dropped in the first place.
    assert "Only read /notes/." in fake.created[0]["resources"][0]["instructions"]


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
    # text/plain, not text/markdown: the Files API sniffs the bytes and
    # rejects markdown uploaded under a markdown type, which reaches the
    # caller only as an opaque upstream 422.
    assert uploaded == ("policy.md", b"Be nice.", "text/plain")


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


def test_the_store_is_scoped_to_the_module_as_well_as_the_customer(
    client, fake, monkeypatch
):
    """One customer, two assistants, two stores.

    This is the invariant that a live check caught broken: mounting a store
    keyed on customer_id alone would put a diligence session's restated EBITDA
    figure in front of the onboarding assistant, and vice versa.
    """
    for module in ("CARD_A_ONBOARDING", "CARD_C_MA_DILIGENCE"):
        for kind in ("AGENT", "ENVIRONMENT", "MEMORY_STORE"):
            monkeypatch.setenv(f"{kind}_ID_{module}", f"{kind.lower()}_{module}")

    client.post(
        "/session", json={"customer_id": CUSTOMER_ID, "module": "card-a-onboarding"}
    )
    client.post(
        "/session", json={"customer_id": CUSTOMER_ID, "module": "card-c-ma-diligence"}
    )
    # Returning to the first assistant must reuse, not create a third.
    client.post(
        "/session", json={"customer_id": CUSTOMER_ID, "module": "card-a-onboarding"}
    )

    created = fake.memory_stores_created
    assert len(created) == 2
    assert [s["metadata"]["module"] for s in created] == [
        "card-a-onboarding",
        "card-c-ma-diligence",
    ]
    assert all(s["metadata"]["customer_id"] == CUSTOMER_ID for s in created)


def test_the_module_decides_which_agent_answers(client, fake, monkeypatch):
    monkeypatch.setenv("AGENT_ID_CARD_B_CUSTOMER_SUCCESS", "agent_card_b")
    monkeypatch.setenv("ENVIRONMENT_ID_CARD_B_CUSTOMER_SUCCESS", "env_card_b")
    monkeypatch.setenv("MEMORY_STORE_ID_CARD_B_CUSTOMER_SUCCESS", "store_card_b")

    client.post(
        "/session",
        json={"customer_id": CUSTOMER_ID, "module": "card-b-customer-success"},
    )
    assert fake.created[0]["agent"] == "agent_card_b"
    assert fake.created[0]["environment_id"] == "env_card_b"


def test_an_unprovisioned_module_is_a_404_naming_the_fix(client, monkeypatch):
    """Not a 422 from upstream saying "invalid agent ID" — the caller can act
    on a 404 that names the module and the command, and cannot act on that."""
    from app.modules import ModuleError

    def unprovisioned(module_id: str):
        raise ModuleError(
            f"Module {module_id!r} has no provisioned agent id. "
            f"Run: python backend/provision.py --module {module_id}"
        )

    # Patched where it is used, not where it is defined — session.py imported
    # the name directly, so patching app.modules would not reach it.
    monkeypatch.setattr("app.routers.session.resources_for", unprovisioned)
    response = client.post(
        "/session", json={"customer_id": CUSTOMER_ID, "module": "card-d-sales-engineer"}
    )
    assert response.status_code == 404
    assert "provision.py" in response.json()["detail"]


def test_per_session_instructions_never_drop_the_memory_protocol(client, fake):
    """Regression: `instructions or DEFAULT` let any per-session guidance
    replace the only text telling the agent to read and write /mnt/memory/.
    The UI passes guidance on every session, so the protocol was always gone
    and the store was always empty."""
    client.post(
        "/session",
        json={"customer_id": CUSTOMER_ID, "instructions": "Only read /notes/."},
    )
    mounted = fake.created[0]["resources"][0]["instructions"]

    assert "Only read /notes/." in mounted
    assert "/mnt/memory/" in mounted
    assert "Record what you learn" in mounted

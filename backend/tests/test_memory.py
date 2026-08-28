"""Memory read/delete proxy."""

from __future__ import annotations

from .conftest import STORE_ID, memory_item, memory_prefix


def test_list_is_sorted_and_maps_fields(client, fake):
    fake.memories = [
        memory_item("mem_2", "/team.md", size=42),
        memory_item("mem_1", "/access-policy.md", size=17),
    ]

    body = client.get("/memory").json()

    assert body["memory_store_id"] == STORE_ID
    assert [m["path"] for m in body["memories"]] == ["/access-policy.md", "/team.md"]
    assert body["memories"][0]["id"] == "mem_1"
    assert body["memories"][0]["size_bytes"] == 17


def test_list_separates_directory_nodes(client, fake):
    fake.memories = [memory_item("mem_1", "/a.md"), memory_prefix("/notes")]

    body = client.get("/memory").json()

    assert [m["path"] for m in body["memories"]] == ["/a.md"]
    assert body["prefixes"] == ["/notes"]


def test_content_is_withheld_unless_asked_for(client, fake):
    fake.memories = [memory_item("mem_1", "/a.md", content="secret-ish body")]

    assert client.get("/memory").json()["memories"][0]["content"] is None

    body = client.get("/memory", params={"include_content": True}).json()
    assert body["memories"][0]["content"] == "secret-ish body"
    assert fake.listed[-1][1]["view"] == "full"


def test_path_prefix_is_forwarded(client, fake):
    client.get("/memory", params={"path_prefix": "/notes/"})
    assert fake.listed[0][1]["path_prefix"] == "/notes/"


def test_delete_removes_the_memory(client, fake):
    fake.memories = [memory_item("mem_1", "/a.md")]

    body = client.delete("/memory/mem_1").json()

    assert body == {"id": "mem_1", "deleted": True}
    assert fake.deleted == [("mem_1", STORE_ID)]


def test_delete_unknown_id_is_404_not_500(client):
    response = client.delete("/memory/mem_nope")

    assert response.status_code == 404
    assert response.json()["detail"] == "Not found."

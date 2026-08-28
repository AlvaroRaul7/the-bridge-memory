"""Curator logic: judge-call construction, merge/prune application.

Monkeypatches memory_engine calls in app.curator's own namespace (same
pattern as tests/test_memory.py) and stubs the Anthropic client's
messages.create — no network, no real model call.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import app.curator as curator
from app.schemas import CurationReport
from memory_engine.schemas import MemoryRecord


class _FakeMessages:
    def __init__(self, verdict: dict) -> None:
        self.verdict = verdict
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text=json.dumps(self.verdict))]
        )


class _FakeAnthropic:
    def __init__(self, verdict: dict) -> None:
        self.messages = _FakeMessages(verdict)


def _records(*pairs: tuple[str, str]) -> list[MemoryRecord]:
    return [MemoryRecord(id=i, text=t, metadata={}) for i, t in pairs]


def test_curate_skips_the_model_call_with_fewer_than_two_memories(monkeypatch):
    monkeypatch.setattr(curator, "list_memories", lambda tenant_id: _records(("mem-1", "solo")))
    client = _FakeAnthropic(verdict={})

    report = curator.curate(client, "tenant-a")

    assert report == CurationReport(summary="Nothing to do — fewer than two memories.")
    assert client.messages.calls == []


def test_curate_deletes_the_named_duplicates_and_reports_them(monkeypatch):
    monkeypatch.setattr(
        curator,
        "list_memories",
        lambda tenant_id: _records(("a", "Alice owns payments"), ("b", "Alice owns payments.")),
    )
    deleted = []
    monkeypatch.setattr(curator, "delete_memory", lambda record_id: deleted.append(record_id))

    client = _FakeAnthropic(
        verdict={
            "duplicate_groups": [{"keep": "a", "remove": ["b"]}],
            "contradictions": [],
            "prune": [],
            "summary": "Merged one duplicate.",
        }
    )

    report = curator.curate(client, "tenant-a")

    assert deleted == ["b"]
    assert report.merged == ["b"]
    assert report.pruned == []
    assert report.summary == "Merged one duplicate."


def test_curate_prunes_flagged_ids(monkeypatch):
    monkeypatch.setattr(
        curator,
        "list_memories",
        lambda tenant_id: _records(("a", "one-off question"), ("b", "stable fact")),
    )
    deleted = []
    monkeypatch.setattr(curator, "delete_memory", lambda record_id: deleted.append(record_id))

    client = _FakeAnthropic(
        verdict={
            "duplicate_groups": [],
            "contradictions": [],
            "prune": ["a"],
            "summary": "Pruned an ephemeral entry.",
        }
    )

    report = curator.curate(client, "tenant-a")

    assert deleted == ["a"]
    assert report.pruned == ["a"]
    assert report.merged == []


def test_curate_flags_contradictions_without_deleting(monkeypatch):
    monkeypatch.setattr(
        curator,
        "list_memories",
        lambda tenant_id: _records(("a", "Bob owns billing"), ("b", "Carol owns billing")),
    )
    deleted = []
    monkeypatch.setattr(curator, "delete_memory", lambda record_id: deleted.append(record_id))

    client = _FakeAnthropic(
        verdict={
            "duplicate_groups": [],
            "contradictions": [{"ids": ["a", "b"], "reason": "Conflicting ownership, neither dated."}],
            "prune": [],
            "summary": "One unresolved contradiction.",
        }
    )

    report = curator.curate(client, "tenant-a")

    assert deleted == []
    assert report.merged == []
    assert report.pruned == []
    assert len(report.contradictions) == 1
    assert report.contradictions[0].ids == ["a", "b"]


def test_curate_sends_ids_text_and_metadata_to_the_judge(monkeypatch):
    monkeypatch.setattr(
        curator,
        "list_memories",
        lambda tenant_id: [
            MemoryRecord(id="a", text="fact one", metadata={"kind": "fact"}),
            MemoryRecord(id="b", text="fact two", metadata={"kind": "fact"}),
        ],
    )
    monkeypatch.setattr(curator, "delete_memory", lambda record_id: None)

    client = _FakeAnthropic(
        verdict={"duplicate_groups": [], "contradictions": [], "prune": [], "summary": "ok"}
    )

    curator.curate(client, "tenant-a")

    sent = json.loads(client.messages.calls[0]["messages"][0]["content"])
    assert sent == [
        {"id": "a", "text": "fact one", "metadata": {"kind": "fact"}},
        {"id": "b", "text": "fact two", "metadata": {"kind": "fact"}},
    ]
    assert client.messages.calls[0]["model"] == curator.CURATOR_MODEL

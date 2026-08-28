"""The memory curator, over the ChromaDB long-term tier.

Same brief as the original stretch_memory_curator.py (merge duplicates, flag
unresolved contradictions, prune anything no longer load-bearing) — but that
script targets the native /mnt/memory/ store via a second Managed Agent
session, which is a different memory system than the one this backend now
owns. This curates the tenant-scoped Chroma store via memory_engine instead,
so it's callable as a plain HTTP endpoint rather than a whole extra agent.

Uses Haiku, not the main model — this is housekeeping/judgment on a small
list of short texts, not domain reasoning (see CLAUDE.md's model-routing
guidance: cheap/fast tier for routine work).
"""

from __future__ import annotations

import json
from typing import Any

from anthropic import Anthropic

from memory_engine import delete_memory, list_memories

from .schemas import CurationReport

CURATOR_MODEL = "claude-haiku-4-5-20251001"

CURATOR_SYSTEM_PROMPT = """\
You are the Memory Curator. Your only job is memory hygiene over a list of
stored memories belonging to one tenant.

You will receive a JSON array of memories, each with `id`, `text`, and
`metadata` (which may include a `timestamp`).

Identify:
- "duplicate_groups": groups of ids that say the same thing. For each group,
  name the one id to KEEP — prefer the one with the newest `timestamp` — the
  rest are deleted.
- "contradictions": ids that conflict with each other where neither is
  clearly newer or more authoritative. Do NOT put these in duplicate_groups —
  flag them for a human instead, with a short reason.
- "prune": ids that are ephemeral, one-off, or no longer useful on their own,
  and are not already part of a duplicate group.

Do NOT invent new knowledge and do NOT answer domain questions — you only
judge the memories you were given. If nothing needs doing, return empty
lists and say so in the summary.
"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "duplicate_groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "keep": {"type": "string"},
                    "remove": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["keep", "remove"],
                "additionalProperties": False,
            },
        },
        "contradictions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ids": {"type": "array", "items": {"type": "string"}},
                    "reason": {"type": "string"},
                },
                "required": ["ids", "reason"],
                "additionalProperties": False,
            },
        },
        "prune": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
    "required": ["duplicate_groups", "contradictions", "prune", "summary"],
    "additionalProperties": False,
}


def _judge(client: Anthropic, memories: list[dict[str, Any]]) -> dict[str, Any]:
    response = client.messages.create(
        model=CURATOR_MODEL,
        max_tokens=1024,
        system=CURATOR_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": json.dumps(memories)}],
        output_config={"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
    )
    text = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )
    return json.loads(text)


def curate(client: Anthropic, tenant_id: str) -> CurationReport:
    """Run one curation pass over a tenant's long-term memories.

    Fewer than two memories means there's nothing to compare, so this skips
    the model call entirely rather than spending a Haiku call to learn that.
    """
    records = list_memories(tenant_id)
    if len(records) < 2:
        return CurationReport(summary="Nothing to do — fewer than two memories.")

    payload = [{"id": r.id, "text": r.text, "metadata": r.metadata} for r in records]
    verdict = _judge(client, payload)

    merged: list[str] = []
    for group in verdict.get("duplicate_groups", []):
        for record_id in group.get("remove", []):
            delete_memory(record_id)
            merged.append(record_id)

    pruned: list[str] = []
    for record_id in verdict.get("prune", []):
        delete_memory(record_id)
        pruned.append(record_id)

    return CurationReport(
        merged=merged,
        pruned=pruned,
        contradictions=verdict.get("contradictions", []),
        summary=verdict.get("summary", ""),
    )

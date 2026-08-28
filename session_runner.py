"""
Shared session-running logic for run_session_1.py and run_session_2.py.

Both rounds do the same thing with a different docs directory and a different
framing instruction, so the mechanics live here once.

Every run writes two artefacts to outputs/<scenario-id>/:
  sessionN.txt   — human-readable, for the side-by-side terminal demo
  sessionN.json  — structured transcript + memory snapshot, for the UI

The JSON shape is the contract the UI consumes. If you change it, update
ui/src/lib/types.ts to match.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from anthropic import Anthropic

from scenarios import Scenario, load_docs_as_context

ROUND1_FRAMING = (
    "I'm including our source documents below. Please:\n"
    "1. First, check your memory store at /mnt/memory/ to see what you've "
    "learned in previous sessions.\n"
    "2. Then read the documents below.\n"
    "3. Then answer the question.\n"
    "4. Before you finish, save anything worth remembering to /mnt/memory/.\n\n"
)

ROUND2_FRAMING = (
    "I'm including some updated and new documents below. Some of them "
    "contradict things you learned in our previous session.\n\n"
    "Please:\n"
    "1. First, check your memory store at /mnt/memory/ to see what you "
    "already know.\n"
    "2. Read the new documents below.\n"
    "3. Reconcile conflicts — UPDATE memory entries to reflect the newer "
    "information. Note dates.\n"
    "4. Answer the question.\n"
    "5. If your answer differs from your previous answer, lead with what "
    "changed and why.\n\n"
)


def _require_ids(scenario: Scenario) -> tuple[str, str, str]:
    ids = {}
    for key in ("agent_id", "environment_id", "memory_store_id"):
        path = scenario.state_path(key)
        if not path.exists():
            raise SystemExit(
                f"Missing {path}. Run:  python create_agent.py --scenario {scenario.card.lower()}"
            )
        ids[key] = path.read_text().strip()
    return ids["agent_id"], ids["environment_id"], ids["memory_store_id"]


def snapshot_memory(client: Anthropic, store_id: str) -> list[dict]:
    """Read the whole memory store so the UI can diff session 1 against session 2.

    Sorted client-side: `order_by` is no longer honored by the list endpoint.
    """
    try:
        page = client.beta.memory_stores.memories.list(store_id, path_prefix="/")
    except Exception as exc:  # a failed snapshot must not fail the run
        print(f"  [warn] could not snapshot memory store: {exc}")
        return []

    out = []
    for item in sorted(page.data, key=lambda i: i.path):
        if item.type != "memory":
            continue
        try:
            retrieved = client.beta.memory_stores.memories.retrieve(
                item.id, memory_store_id=store_id
            )
            content = retrieved.content or ""
        except Exception as exc:
            print(f"  [warn] could not read {item.path}: {exc}")
            content = ""
        out.append({"path": item.path, "content": content, "chars": len(content)})
    return out


def run_session(
    scenario: Scenario,
    *,
    round_number: int,
    docs_dir: Path,
    framing: str,
    title: str,
    memory_instructions: str,
) -> Path:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Set ANTHROPIC_API_KEY before running.")

    agent_id, environment_id, memory_store_id = _require_ids(scenario)
    client = Anthropic()

    print(f"Scenario: Card {scenario.card} — {scenario.name}")
    print(f"Loading round{round_number} docs from {docs_dir}/...")
    context = load_docs_as_context(docs_dir)

    memory_before = snapshot_memory(client, memory_store_id)
    print(f"Memory store holds {len(memory_before)} entries before this session.")

    print(f"\nStarting session with memory store {memory_store_id} attached...")
    session = client.beta.sessions.create(
        agent=agent_id,
        environment_id=environment_id,
        title=title,
        resources=[
            {
                "type": "memory_store",
                "memory_store_id": memory_store_id,
                "access": "read_write",
                "instructions": memory_instructions,
            }
        ],
    )

    user_message = (
        f"{framing}{context}\n\n"
        "==================================================\n"
        f"QUESTION: {scenario.test_question}"
    )

    final_text_parts: list[str] = []
    events: list[dict] = []
    started = datetime.now(timezone.utc)

    print("\nAgent working...\n")
    with client.beta.sessions.events.stream(session.id) as stream:
        client.beta.sessions.events.send(
            session.id,
            events=[
                {
                    "type": "user.message",
                    "content": [{"type": "text", "text": user_message}],
                }
            ],
        )
        for event in stream:
            if event.type == "agent.message":
                for block in event.content:
                    if getattr(block, "type", None) == "text":
                        final_text_parts.append(block.text)
                        events.append({"kind": "text", "text": block.text})
                        print(block.text, end="", flush=True)
            elif event.type == "agent.tool_use":
                name = getattr(event, "name", "?")
                inp = getattr(event, "input", {}) or {}
                target = (
                    inp.get("path") or inp.get("file_path") or inp.get("command") or ""
                )
                is_memory = "/mnt/memory" in str(target)
                events.append(
                    {
                        "kind": "tool_use",
                        "name": name,
                        "target": str(target),
                        "isMemory": is_memory,
                    }
                )
                if is_memory:
                    print(f"\n  [memory: {name}  {target}]", flush=True)
                else:
                    print(f"\n  [{name}]", flush=True)
            elif event.type == "session.status_idle":
                print("\n\n[agent finished]")
                break

    final_text = "".join(final_text_parts)
    memory_after = snapshot_memory(client, memory_store_id)
    out_dir = scenario.output_dir()

    txt_path = out_dir / f"session{round_number}.txt"
    txt_path.write_text(
        f"=== CARD {scenario.card} — {scenario.name} — SESSION {round_number} ===\n"
        f"Question: {scenario.test_question}\n\n--- ANSWER ---\n{final_text}\n"
    )

    json_path = out_dir / f"session{round_number}.json"
    json_path.write_text(
        json.dumps(
            {
                "scenarioId": scenario.id,
                "round": round_number,
                "sessionId": session.id,
                "title": title,
                "question": scenario.test_question,
                "startedAt": started.isoformat(),
                "finishedAt": datetime.now(timezone.utc).isoformat(),
                "answer": final_text,
                "events": events,
                "memoryBefore": memory_before,
                "memoryAfter": memory_after,
            },
            indent=2,
        )
    )

    print(f"\nSaved {txt_path}")
    print(f"Saved {json_path}  (this is what the UI reads)")
    print(
        f"Memory store went from {len(memory_before)} to {len(memory_after)} entries."
    )
    return json_path

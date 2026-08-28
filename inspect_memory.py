"""
List every memory in a scenario's memory store, with content previews.

This is your demo helper — run it between sessions to see what the agent has
chosen to remember.

Usage:
    python inspect_memory.py                       # Card A, previews
    python inspect_memory.py --scenario b --full   # Card B, full content
"""

import argparse
import os

from anthropic import Anthropic

import scenarios


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    scenarios.add_scenario_arg(parser)
    parser.add_argument("--full", action="store_true", help="Print full content.")
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Set ANTHROPIC_API_KEY before running.")

    scenario = scenarios.get(args.scenario)
    store_id_path = scenario.state_path("memory_store_id")
    if not store_id_path.exists():
        raise SystemExit(
            f"Missing {store_id_path}. Run:  "
            f"python create_agent.py --scenario {scenario.card.lower()}"
        )
    store_id = store_id_path.read_text().strip()

    client = Anthropic()
    print(f"Card {scenario.card} — {scenario.name}")
    print(f"Memory store: {store_id}\n" + "=" * 60)

    # `order_by` is no longer honored by the memory-stores list endpoint
    # (server returns a deterministic but unspecified order as of the
    # agent-memory-2026-07-22 behavior). We sort client-side instead so the
    # demo output stays stable and readable.
    page = client.beta.memory_stores.memories.list(store_id, path_prefix="/")

    items = sorted(page.data, key=lambda item: item.path)
    if not items:
        print("(memory store is empty — has run_session_1.py been run?)")
        return

    for item in items:
        # `item.type` is "memory" for files (or "directory" for nested dirs)
        if item.type != "memory":
            print(f"\n[dir] {item.path}")
            continue

        retrieved = client.beta.memory_stores.memories.retrieve(
            item.id, memory_store_id=store_id
        )
        content = retrieved.content or ""

        print(f"\n--- {item.path}  ({len(content)} chars) ---")
        print(content if args.full else content[:400] + ("..." if len(content) > 400 else ""))


if __name__ == "__main__":
    main()

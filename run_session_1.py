"""
Session 1 — Baseline.

Starts a Managed Agents session with the scenario's memory store ATTACHED so
the agent can read and write /mnt/memory/. Inlines the round1 docs.

After this session, inspect the memory store to see what the agent saved:
    python inspect_memory.py --scenario b

Usage:
    python run_session_1.py                  # Card A (default)
    python run_session_1.py --scenario b     # Card B
"""

import argparse

import scenarios
from session_runner import ROUND1_FRAMING, run_session


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    scenarios.add_scenario_arg(parser)
    args = parser.parse_args()

    scenario = scenarios.get(args.scenario)
    run_session(
        scenario,
        round_number=1,
        docs_dir=scenario.round1_dir,
        framing=ROUND1_FRAMING,
        title=f"Card {scenario.card} — Session 1 — baseline",
        memory_instructions=(
            "This is your persistent institutional memory. Mounted at "
            "/mnt/memory/. Check it before starting. Record what you learn "
            "for future sessions."
        ),
    )
    print(f"\nNext:  python run_session_2.py --scenario {scenario.card.lower()}")


if __name__ == "__main__":
    main()

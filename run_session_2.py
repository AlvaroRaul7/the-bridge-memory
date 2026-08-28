"""
Session 2 — After memory + new context.

Same agent, same memory store, fresh session. The round2 docs contradict
round1. The agent should read memory first, notice the contradictions, UPDATE
memory rather than appending, and lead its answer with what changed.

Usage:
    python run_session_2.py                  # Card A (default)
    python run_session_2.py --scenario c     # Card C
"""

import argparse

import scenarios
from session_runner import ROUND2_FRAMING, run_session


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    scenarios.add_scenario_arg(parser)
    args = parser.parse_args()

    scenario = scenarios.get(args.scenario)
    run_session(
        scenario,
        round_number=2,
        docs_dir=scenario.round2_dir,
        framing=ROUND2_FRAMING,
        title=f"Card {scenario.card} — Session 2 — after memory + new context",
        memory_instructions=(
            "This is your persistent institutional memory. Some entries may be "
            "out of date — reconcile against the new documents in this session "
            "and UPDATE existing entries (don't just append)."
        ),
    )
    print("\nCompare the two sessions in the UI:  cd ui && npm run dev")


if __name__ == "__main__":
    main()

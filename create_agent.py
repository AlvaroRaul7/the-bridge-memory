"""
Provision the three things a scenario needs:
  1. A Managed Agent with the full agent toolset and a scenario-tuned prompt
  2. A cloud Environment (the container the agent runs in)
  3. A Memory Store that survives across sessions

The memory store mounts at /mnt/memory/ inside the session container. The agent
reads and writes it with normal file tools. It persists across sessions —
that's the whole point of this track.

Each scenario gets its OWN agent, environment and memory store, so all four
cards can be provisioned side by side. IDs are written to
.state/<scenario-id>/{agent_id,environment_id,memory_store_id}.

Usage:
    export ANTHROPIC_API_KEY="sk-ant-..."
    python create_agent.py                   # Card A (default)
    python create_agent.py --scenario b      # Card B
    python create_agent.py --all             # all four cards
"""

import argparse
import os

from anthropic import Anthropic

import scenarios
from scenarios import Scenario


SYSTEM_PROMPT_TEMPLATE = """\
You are the Institutional Memory Agent for {domain}.

{persona}

Your job: be the smartest possible answer to questions about this domain. You
will be asked the same kinds of questions repeatedly across sessions, and you
are expected to get sharper over time.

# Memory protocol (mandatory)

You have a persistent memory store mounted at `/mnt/memory/`. It survives
across sessions. Treat it like the team wiki.

1. **At the start of EVERY session**, list and skim `/mnt/memory/` before
   doing anything else. Use your bash and file tools.
2. Read any files that look relevant to the current question.
3. As you work, **record what you learn for future sessions**. For this domain
   that means: {focus}.
   Always record the effective date and the source document for any fact.
4. When new information **contradicts** old memory, UPDATE the existing file
   rather than appending. Note the effective date. Trust the newer version,
   and keep a one-line note of what the old value was and when it changed.
5. Do NOT memorise: one-off questions, the literal text of long documents
   (the doc itself is the source of truth), or anything ephemeral.

# How to answer

- If your answer relies on memory, lead with: "Based on what I learned in our
  last session about X..."
- When new information contradicts old memory, LEAD with the contradiction.
  Don't paper over it. Name the old value, the new value, and the date.
- If the question itself contains a premise that your memory says is now
  false, correct the premise before answering.
- Be concise.
"""


def provision(client: Anthropic, scenario: Scenario) -> None:
    print(f"\n=== Card {scenario.card} — {scenario.name} ===")

    agent = client.beta.agents.create(
        name=f"Institutional Memory Agent — Card {scenario.card}",
        model="claude-sonnet-4-6",
        system=SYSTEM_PROMPT_TEMPLATE.format(
            domain=scenario.domain,
            persona=scenario.persona,
            focus=scenario.system_prompt_focus,
        ),
        tools=[{"type": "agent_toolset_20260401"}],
        metadata={
            "hackathon": "partner-basecamp-2026",
            "track": "memory-agent",
            "scenario": scenario.id,
        },
    )
    scenario.state_path("agent_id").write_text(agent.id)
    print(f"Agent created:        {agent.id}")

    environment = client.beta.environments.create(
        name=f"memory-agent-env-{scenario.card.lower()}",
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )
    scenario.state_path("environment_id").write_text(environment.id)
    print(f"Environment created:  {environment.id}")

    memory_store = client.beta.memory_stores.create(
        name=f"Institutional Memory — {scenario.name}",
        description=(
            f"Persistent memory for the {scenario.name} covering {scenario.domain}. "
            "Contains facts learned across sessions. Used as an authoritative "
            "wiki — newer entries supersede older ones on the same topic."
        ),
    )
    scenario.state_path("memory_store_id").write_text(memory_store.id)
    print(f"Memory store created: {memory_store.id}")
    print(
        f"  Console: https://platform.claude.com/memory-stores/{memory_store.id}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    scenarios.add_scenario_arg(parser)
    parser.add_argument(
        "--all", action="store_true", help="Provision all four scenario cards."
    )
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Set ANTHROPIC_API_KEY before running.")

    client = Anthropic()
    targets = (
        scenarios.all_scenarios() if args.all else [scenarios.get(args.scenario)]
    )
    for scenario in targets:
        provision(client, scenario)

    print("\nSetup complete.")
    first = targets[0]
    print(f"Next:  python run_session_1.py --scenario {first.card.lower()}")


if __name__ == "__main__":
    main()

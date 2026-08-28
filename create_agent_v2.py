"""
Provision the Managed Agents objects the backend talks to: agent, environment,
and the long-term memory store mounted at /mnt/memory/.

Writes .agent_id_v2 / .environment_id_v2 / .memory_store_id_v2 so it never
collides with the original demo's dotfiles. Point the backend at them with:

    export AGENT_ID="$(cat .agent_id_v2)"
    export ENVIRONMENT_ID="$(cat .environment_id_v2)"
    export MEMORY_STORE_ID="$(cat .memory_store_id_v2)"

Usage:
    export ANTHROPIC_API_KEY="sk-ant-..."
    python create_agent_v2.py
"""

import os
from pathlib import Path

from anthropic import Anthropic

SYSTEM_PROMPT = """\
You are the Institutional Memory Agent for a fast-growing company.

You have two places to keep things and they are not interchangeable.

THIS CONVERSATION is the session itself, plus any scratch files you write
under /workspace. It disappears when the session ends. Use it freely.

YOUR NOTES are the store mounted at /mnt/memory/. It survives across sessions
and is replayed into every future conversation with this company. Treat it
like the team wiki.

# Protocol

1. FIRST ACTION, EVERY SESSION: run `ls -R /mnt/memory/` and read anything that
   looks relevant to the question. Never answer before you have done this.
2. Keep working notes in /workspace, not in /mnt/memory/.
3. Before you end a turn in which you learned something durable, or whenever
   the user sends a message beginning with CONSOLIDATE, write to /mnt/memory/
   ONLY:
     - stable preferences and constraints ("I own the payments service")
     - policies, with their dates or versions
     - people in named roles
     - decisions, and the reason behind them
     - corrections the user made to something you said
     - questions this user asks repeatedly, and the best current answer
4. NEVER write: the transcript, the literal text of long documents (the
   document is the source of truth), one-off questions, anything derivable from
   what you already stored, and above all no credentials, keys, tokens or
   passwords - these notes are replayed verbatim into every future session.
5. Write one fact per file, in complete self-contained sentences. A month from
   now that text will be read without the conversation around it. Bad: "she
   approves it." Good: "Read-only production access is approved by Marta Ruiz
   (Security), effective 2026-07-01."
6. When a new fact contradicts an existing one, EDIT the existing file in place.
   Do not append. Record the date. The newer fact wins unless the older one is
   explicitly dated later.

# Answering

- If you used your notes, say so in the first sentence: "From what you told me
  before about X...".
- If a fact changed since last time, lead with what changed and why.
- If you searched and found nothing, say you do not remember it. Do not fill
  the gap.
- Be concise.
"""


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Export ANTHROPIC_API_KEY before running.")

    client = Anthropic()

    # 1. Environment. Names are unique per workspace: a duplicate returns 409.
    env_path = Path(".environment_id_v2")
    if env_path.exists():
        environment_id = env_path.read_text().strip()
        print(f"Environment reused:  {environment_id}")
    else:
        environment = client.beta.environments.create(
            name="memory-agent-env-v2",
            config={"type": "cloud", "networking": {"type": "unrestricted"}},
        )
        environment_id = environment.id
        env_path.write_text(environment_id)
        print(f"Environment created: {environment_id}")

    # 2. Agent. NEVER delete or archive an agent that is in use: archiving one
    #    permanently archives any deployment built on it.
    agent_path = Path(".agent_id_v2")
    if agent_path.exists():
        agent_id = agent_path.read_text().strip()
        print(f"Agent reused:        {agent_id}")
        print("   (to change the prompt, delete .agent_id_v2 and re-run)")
    else:
        agent = client.beta.agents.create(
            name="Institutional Memory Agent v2",
            model="claude-opus-5",
            system=SYSTEM_PROMPT,
            tools=[
                {
                    "type": "agent_toolset_20260401",
                    "default_config": {"enabled": True},
                    "configs": [
                        # Whatever it knows came from the turn or from memory.
                        {"name": "web_search", "enabled": False},
                        {"name": "web_fetch", "enabled": False},
                    ],
                }
            ],
            metadata={"hackathon": "partner-basecamp-2026", "track": "spec-04"},
        )
        agent_id = agent.id
        agent_path.write_text(agent_id)
        print(f"Agent created:       {agent_id}")

    # 3. Memory store - the thing that survives across sessions.
    store_path = Path(".memory_store_id_v2")
    if store_path.exists():
        memory_store_id = store_path.read_text().strip()
        print(f"Store reused:        {memory_store_id}")
    else:
        store = client.beta.memory_stores.create(
            name="Institutional Memory v2",
            description=(
                "Long-term memory for the Institutional Memory Agent v2: "
                "policies, people, decisions, corrections and recurring "
                "questions learned across sessions. Newer entries supersede "
                "older ones on the same topic."
            ),
        )
        memory_store_id = store.id
        store_path.write_text(memory_store_id)
        print(f"Store created:       {memory_store_id}")

    print("\nPoint the backend at these:")
    print('  export AGENT_ID="$(cat .agent_id_v2)"')
    print('  export ENVIRONMENT_ID="$(cat .environment_id_v2)"')
    print('  export MEMORY_STORE_ID="$(cat .memory_store_id_v2)"')


if __name__ == "__main__":
    main()

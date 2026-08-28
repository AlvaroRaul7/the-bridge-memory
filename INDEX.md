# Repository Index — the-bridge-memory

Hackathon track **"Option 2 — Institutional Memory Agent"** (Partner Basecamp 2026).
A ~60-minute exercise that builds a Claude **Managed Agent** with a persistent
**memory store**, then runs two sessions on the same domain where the second
session's documents contradict the first. The demo is the diff between the two answers.

Python only, no build system, no tests, no framework. Every script is a standalone
`python <file>.py` entry point that reads/writes dotfiles in the repo root.

---

## Run order

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."
python create_agent.py      # provisions agent + environment + memory store
python run_session_1.py     # baseline answer,  -> outputs/session1.txt
python inspect_memory.py    # see what the agent chose to remember
python run_session_2.py     # same question, contradicting docs -> outputs/session2.txt
```

Then diff `outputs/session1.txt` against `outputs/session2.txt`.

---

## Files

| File | Role |
|---|---|
| [create_agent.py](create_agent.py) | Provisions the three resources and writes their IDs to dotfiles. Holds the agent's `SYSTEM_PROMPT`, including the mandatory memory protocol (read `/mnt/memory/` first; **update** contradicted entries rather than appending). Model: `claude-sonnet-4-6`. |
| [run_session_1.py](run_session_1.py) | Baseline session. Inlines `synthetic-data/round1/*.md` into the user message, streams the session, writes `outputs/session1.txt`. |
| [run_session_2.py](run_session_2.py) | Fresh session, **same** agent and memory store. Inlines `round2/`, instructs reconciliation, writes `outputs/session2.txt`. Near-identical to session 1 apart from `DOCS_DIR`, the resource `instructions`, and the user-message preamble. |
| [inspect_memory.py](inspect_memory.py) | Demo helper. Lists every memory in the store with previews (`--full` for whole contents). Sorts client-side because `order_by` is no longer honored by the list endpoint. |
| [stretch_memory_curator.py](stretch_memory_curator.py) | Stretch goal S2. A second, Haiku-backed agent whose only job is memory hygiene — merge duplicates, flag contradictions, prune stale entries. |
| [memory_backend.py](memory_backend.py) | **Deprecated**; raises `ImportError` on import. Superseded by the `memory_stores` primitive. Safe to delete. |
| [requirements.txt](requirements.txt) | `anthropic>=0.116.0` (floor raised for the `agent-memory-2026-07-22` beta header), `python-dotenv`. |
| [README.md](README.md) | The participant-facing track brief. |
| [scenario-cards.md](scenario-cards.md) | Four personas to choose from: A New-Hire Onboarding (the one the data fits), B Customer Success, C M&A Diligence, D Sales Engineer. |
| [stretch-goals.md](stretch-goals.md) | Nine stretch goals in four tiers, from "explicit memory policy" to "sub-agent per memory topic". |
| [CLAUDE.md](CLAUDE.md) | Workshop notes on prompt engineering, diagnosing AI failures, evals, and inference optimization. General guidance — **not** instructions specific to this repo. |

## Generated at runtime (untracked, and **not** in a `.gitignore`)

`.agent_id` · `.environment_id` · `.memory_store_id` · `.curator_agent_id` · `outputs/`

---

## Architecture

Three resources, created once by `create_agent.py`:

1. **Agent** (`client.beta.agents.create`) — system prompt + `agent_toolset_20260401`.
2. **Environment** (`client.beta.environments.create`) — a cloud container, unrestricted networking.
3. **Memory store** (`client.beta.memory_stores.create`) — the only thing that survives across sessions.

Each session attaches the memory store as a `resources` entry with `access: "read_write"`;
it mounts at `/mnt/memory/` inside the container and the agent manipulates it with
ordinary bash/file tools. Sessions are driven by opening
`client.beta.sessions.events.stream(...)`, sending a `user.message` event, then consuming
`agent.message` / `agent.tool_use` events until `session.status_idle`. Both run scripts
special-case tool-use events touching `/mnt/memory` so the demo shows memory writes live.

## The synthetic domain

Fictional company **BTS-Synthetic**. `round1/` (January 2026) establishes a production
access policy gated on 2 weeks' tenure plus an SRE pairing session, plus a team directory.
`round2/` (May 2026) contradicts both: the policy update of 2026-05-15 replaces pairing
with online certification and just-in-time access through IAM, and a re-org moves Anika
Reddy out of Head of Engineering (Yuki Tanaka in, Tom Bryce to Head of Platform).

The shared test question — asked verbatim in both sessions — is a new hire needing
read-only prod access tomorrow. A correct session-2 answer cites the new policy, does
not recommend the pairing session, and names the current people.

---

## Discrepancies worth knowing

- **README describes the Files API**; both run scripts actually inline the documents as
  text in the user message. No Files API call exists in the repo.
- **README's file tree omits** `inspect_memory.py` and `memory_backend.py`, and names the
  folder `02-institutional-memory-agent/` rather than this repo's name.
- `stretch_memory_curator.py` sets the older `managed-agents-2026-04-01` beta header
  explicitly and consumes `agent.message_delta` events, while the run scripts rely on the
  SDK default header and consume `agent.message`. It also tells the curator to curate
  "the memory store of agent {id}" in prose without attaching the store as a resource.

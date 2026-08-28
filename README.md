# Option 2 — Institutional Memory Agent

**Concept landed:** Memory & context engineering
**Tech:** [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) + the [Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
**Time:** 60 minutes
**Output:** An agent that visibly gets sharper across multiple sessions on the same domain.

## The pitch

Memory is the concept enterprise clients ask about most and understand least. Most people think it means "a vector database for documents." It doesn't — it means **the agent decides what to remember, what to forget, and what to update when it learns something new.**

You'll build an agent that runs two sessions on the same domain. Between the two sessions, the agent's memory persists. New information in session 2 contradicts session 1. The agent should reconcile, update, and answer better than it did the first time.

That's the demo: same question, two sessions, visibly sharper answer.

## Setup (5 min)

You need a workspace API key on the Console (your hackathon team workspace).

```bash
cd 02-institutional-memory-agent
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."
```

That's it. No infrastructure to spin up. Managed Agents handles the runtime.

## Pick a scenario card

Four cards in [`scenario-cards.md`](./scenario-cards.md). Each is a persona that benefits from memory across sessions. **All four are built** — each has its own synthetic documents, its own persona prompt, its own test question and its own tracked contradictions.

| Card | Persona | Domain | `--scenario` |
| --- | --- | --- | --- |
| A | New-Hire Onboarding Agent | BTS-Synthetic Engineering | `a` |
| B | Customer Success Specialist | Acme Corp | `b` |
| C | M&A Diligence Analyst | Project Lighthouse / Helios | `c` |
| D | Sales Engineer for Product X | Vertex Financial | `d` |

[`scenarios.json`](./scenarios.json) is the single source of truth for all four — the Python scripts and the UI both read it. Add a card there and both sides pick it up.

## Core build (25 min)

Every script takes `--scenario` (a card letter or a full id). It defaults to Card A, so the original commands still work unchanged.

1. **Create the agent.** `python create_agent.py --scenario b` creates a Managed Agent with a scenario-tuned system prompt, a cloud environment, and a memory store. IDs land in `.state/<scenario-id>/`. Use `--all` to provision all four cards at once.

2. **Run session 1.** `python run_session_1.py --scenario b`:
   - Inlines the docs from `synthetic-data/<card>/round1/`
   - Starts a session with the memory store attached at `/mnt/memory/`
   - Writes `outputs/<scenario-id>/session1.txt` and `session1.json`

3. **Run session 2.** `python run_session_2.py --scenario b`:
   - Inlines `synthetic-data/<card>/round2/` (which contradicts round 1)
   - Starts a *new* session against the *same* agent and memory store
   - Asks the same question
   - Writes `session2.txt` and `session2.json`

4. **Compare.** Open the UI, or diff the two text files. The session 2 answer should acknowledge the conflict, reflect the newer information, and reference what it learned in session 1.

`inspect_memory.py --scenario b [--full]` prints the memory store between runs.

## The UI

`frontend/` implements [`specs/03-frontend-react-shadcn.md`](./specs/03-frontend-react-shadcn.md)
against the API in [`specs/02-backend-fastapi.md`](./specs/02-backend-fastapi.md).

```bash
cd frontend && npm install && npm run dev
```

Runs with no backend — msw serves all seven Spec 2 routes in the browser.
Set `VITE_USE_MOCKS=false` in `frontend/.env.local` to point at the real
FastAPI service; nothing else changes.

- **Console tab** — the three Spec 3 views: a chat that shows which memories
  `GET /memory/search` returned for each turn, a memory inspector with per-row
  delete, and a session switcher.
- **Scenarios tab** — demo scaffolding over the four cards: briefs, documents,
  the round-1 vs round-2 contradiction table, a two-session replay and a
  memory diff.

See [`frontend/README.md`](./frontend/README.md).

## Stretch goals (20 min — pick at least one)

See [`stretch-goals.md`](./stretch-goals.md).

**Tier 1 — Make memory deliberate:**
- Add explicit memory instructions to the system prompt. Tell the agent what kinds of things to remember and what to ignore.
- Add a sub-agent that curates the memory store (the "memory curator" pattern).

**Tier 2 — Make memory resilient:**
- Adversarial test: feed it deliberately wrong information in session 2 and see if it spots the contradiction.
- Add a third session where you ask: "What have you learned?" and see what the agent says.

**Tier 3 — Make memory production-shaped:**
- Tie memory to a customer ID via metadata so the agent has per-tenant memory.
- Use Files API to attach growing document sets across multiple sessions and watch context grow.

## Two-minute demo

Side-by-side terminal windows:
- Left: session 1 answer
- Right: session 2 answer (same question, after memory + new context)

Read both out loud. Let the room see the agent's answer sharpen. Then open the memory store on the third terminal — show what the agent chose to remember.

## What's in this folder

```
02-institutional-memory-agent/
├── README.md                      (you are here)
├── scenario-cards.md              (the four personas)
├── scenarios.json                 (registry — read by Python AND the UI)
├── scenarios.py                   (registry loader for the Python side)
├── stretch-goals.md
├── requirements.txt
├── create_agent.py                (--scenario / --all)
├── session_runner.py              (shared session logic for both rounds)
├── run_session_1.py               (--scenario)
├── run_session_2.py               (--scenario)
├── inspect_memory.py              (--scenario --full)
├── stretch_memory_curator.py      (stretch: curator sub-agent)
├── specs/                         (the four workstream specs)
├── frontend/                      (Spec 3 — React + shadcn, msw-mocked)
└── synthetic-data/
    ├── card-a-onboarding/         round1/ round2/
    ├── card-b-customer-success/   round1/ round2/
    ├── card-c-ma-diligence/       round1/ round2/
    └── card-d-sales-engineer/     round1/ round2/
```

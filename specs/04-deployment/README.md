# Spec 4 — Work plan

**Owner:** Esteban · **Spec:** [`../04-deployment-managed-agents.md`](../04-deployment-managed-agents.md)

> **Written against `c6d4a76`.** The backend is now two-tiered: `/session` over
> the agent's native `/mnt/memory/` mount, and `/memory` over the tenant-scoped
> ChromaDB tier. Nothing currently writes to that second tier except a human
> with `curl` — closing that is task 05, and it is the part of this spec that
> matters most. See [`TEAM-NOTES.md`](TEAM-NOTES.md).

---

## What is actually on `main` now

```
   browser (Spec 3)                our host                    Anthropic
   ┌──────────────┐   HTTPS   ┌──────────────────┐   HTTPS   ┌───────────────────┐
   │ React + Vite ├──────────►│ backend/ FastAPI ├──────────►│ Managed Agents    │
   └──────────────┘  X-API-Key└──────────────────┘  SDK key  │  agent + session  │
                                                             │  /mnt/memory/     │
                                                             └───────────────────┘
```

The agent never calls in. `backend/` calls Anthropic on the browser's behalf,
opens sessions with the memory store mounted `read_write`, and exposes read
access to what the agent wrote. Its `ask()` already has the idle gate right.

Consequences for this spec:

- **For the `/session` tier, no tunnel is needed.** The backend calls the agent;
  the agent calls nobody.
- **For the Chroma tier, one is** — the agent has to reach `/memory/*` from
  outside our network, which is task 05.
- **Chroma Cloud is hosted**, so the long-term tier does not depend on our
  laptop staying up. The backend in front of it does.

**Unchanged hard constraint:** neither the backend nor the frontend can be
deployed on Managed Agents. That platform deploys agents, not web apps.

---

## What is left for Spec 4

The spec's original framing ("make the agent call FastAPI as its memory
backend") no longer matches `main`. What remains is still the whole deployment
story, just pointing the other way:

1. Provision the `agent_` / `env_` / `memstore_` objects the backend points at,
   on `claude-opus-5` and with a memory protocol worth demoing.
2. Bring the backend up against those objects and prove the round trip.
3. Prove "session 2 remembers session 1" through the backend's own API.
4. Write `DEPLOYMENT.md`: where each piece runs, what secrets it needs, how to
   verify, what breaks and how to fix it.

---

## Decisions already made (do not reopen)

| Topic | Decision | Why |
|---|---|---|
| Which architecture | What is merged on `main`: native memory store, backend as proxy | It is what exists, it is tested, and Spec 3 needs an API to call |
| Where the backend runs | Any always-on host. For the hackathon, the demo laptop | Managed Agents does not host web apps |
| Which resource IDs the backend uses | `AGENT_ID` / `ENVIRONMENT_ID` / `MEMORY_STORE_ID` env vars pointing at the v2 dotfiles | The backend falls back to `.agent_id` etc., which belong to the original demo. Env vars win, so both demos survive side by side |
| Model | `claude-opus-5` | `create_agent.py:70` pins the older `claude-sonnet-4-6` |
| Existing files | Untouched. New work in `create_agent_v2.py`, `run_demo_v2.py` | `create_agent.py` and `run_session_*.py` stay as the fallback demo |
| Consolidation | A normal message (`POST /session/{id}/message`) carrying the CONSOLIDATE text | The backend has no special endpoint for it, and it does not need one |

---

## Task order

| # | Task | Leaves working | Needs a live API key |
|---|---|---|---|
| [01](tasks/01-provision-agent.md) | Provision agent v2, environment, memory store | `.agent_id_v2`, `.environment_id_v2`, `.memory_store_id_v2` | yes |
| [02](tasks/02-run-backend.md) | Backend running against those objects | A local API answering `/healthz` and `/session` | yes |
| [03](tasks/03-two-session-proof.md) | The two-session proof through the backend | `outputs/session1_v2.txt`, `session2_v2.txt` | yes |
| [04](tasks/04-deployment-doc.md) | `DEPLOYMENT.md` | Deliverable 3 of the spec | no |
| [05](tasks/05-connect-long-term-tier.md) | Agent → the Chroma tier | The promotion moment actually promoting | yes |

**Out of scope here:** the cron-scheduled curator (`depl_`) belongs to track C of
`PLAN.md`. If it gets built it needs its own `resources` block with the memory
store — the upstream `stretch_memory_curator.py` is missing it.

---

## Ground rules for whoever executes these tasks (human or agent)

1. **Do not modify** `create_agent.py`, `run_session_1.py`, `run_session_2.py`,
   `inspect_memory.py`, `stretch_memory_curator.py`, or anything under
   `backend/`. `backend/` belongs to Spec 2; if it needs a change, say so in the
   task file instead of editing it.
2. **Everything in this repo is written in English** — code, comments, docs,
   prompts, commit messages.
3. **Do not invent SDK signatures.** If a call is rejected for an unknown
   parameter, inspect the real signature and adjust, then record what was
   correct in the task file.
4. **One task = one commit**, with its verification passing first.
5. **No secrets in the repo.** `.gitignore` already covers the v2 dotfiles.
6. If a verification fails three times, **stop and report** what was tried.
7. Tasks 01–03 create real cloud resources and spend real money. Do not run them
   without `ANTHROPIC_API_KEY` exported by the repo owner.

---

## For teammates

[`TEAM-NOTES.md`](TEAM-NOTES.md) — three things that need saying after this
merge, plus a message ready to paste into chat.

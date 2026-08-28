# Task 04 — `DEPLOYMENT.md` (deliverable 3 of the spec)

**Goal:** write down how this is deployed, reached and verified, for someone who
was not here.

**Depends on:** [03](03-two-session-proof.md) · **Time:** ~20 min · **Needs a live API key:** no
**Files:** `DEPLOYMENT.md` (new, repo root)

---

## What it must contain

### 1. What runs where

The three-box diagram from the plan's [README](../README.md), and the rule
behind it: **Managed Agents deploys agents, not web apps.** `backend/` and Spec
3's frontend run on a host of ours; the agent's container is per-session,
ephemeral, and has no public ingress.

For the hackathon everything runs on the demo laptop. If the frontend has to
reach the backend from another machine, the backend — not the agent — is the
thing that needs a public address (`cloudflared tunnel --url http://localhost:8000`),
and then `CORS_ORIGINS` must include the frontend's origin.

### 2. Secrets and variables, per side

| Where | Variable | For what |
|---|---|---|
| Backend host | `ANTHROPIC_API_KEY` | the backend calls Anthropic on the browser's behalf |
| Backend host | `BACKEND_API_KEY` | the `X-API-Key` callers must send; startup fails without it |
| Backend host | `AGENT_ID` / `ENVIRONMENT_ID` / `MEMORY_STORE_ID` | point it at the v2 objects instead of the original demo's dotfiles |
| Backend host | `CORS_ORIGINS` | Spec 3's origin |
| Frontend | the same `BACKEND_API_KEY` | workshop-grade shared key |

State the limitation plainly, because it will be the first question asked: the
key authenticates the caller but does not scope them — every caller sees the same
store. `backend/README.md` already describes the upgrade path; link it rather
than repeating it.

Then list the git-ignored files and why: `.agent_id_v2`, `.environment_id_v2`,
`.memory_store_id_v2`.

### 3. How to verify a deployment is actually working

Condense the checks from tasks 02 and 03 into a copy-pasteable block: `/healthz`,
the 401-without-key check, one real turn returning `end_turn`, and at least one
`tool_use` with `touched_memory: true`. That last one is the answer to the
spec's question — how do we know the agent really used its long-term memory.

### 4. Failure runbook

| Symptom | Near-certain cause | Fix |
|---|---|---|
| `ConfigError` on startup | Env var empty and dotfile missing | Export the three IDs, or run `create_agent_v2.py` |
| 502 from the backend | Anthropic rejected *our* key | Check `ANTHROPIC_API_KEY` on the host, not the caller's key |
| 401 from the backend | The caller's `X-API-Key` is wrong | Check the frontend's env |
| `stop_reason: "timeout"` | Turn ran past `AGENT_TIMEOUT_SECONDS` | Raise it; a cold first turn is slow |
| Answer arrives but nothing touched memory | Prompt ordering | Task 01, one change at a time |
| Frontend blocked by CORS | `CORS_ORIGINS` missing the origin | Set it; it is comma-separated |

---

## Done when

- [ ] `DEPLOYMENT.md` exists at the repo root with all four sections
- [ ] Someone who has not touched this follows it and brings the stack up
      without asking questions
- [ ] It contains no keys and no real tunnel URLs
- [ ] It links `backend/README.md` rather than duplicating it

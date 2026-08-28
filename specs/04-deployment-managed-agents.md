# Spec 4 — Deployment on Anthropic Managed Agents

**Owner:** Esteban
**Depends on:** Spec 1 + Spec 2 (needs a working backend to point the agent at)
**Consumed by:** end-to-end demo

> **Work plan:** [`04-deployment/`](./04-deployment/) — step-by-step tasks, each
> with its own verification. Start at its [`README.md`](./04-deployment/README.md).
> What needs deciding with the rest of the team is in
> [`04-deployment/TEAM-NOTES.md`](./04-deployment/TEAM-NOTES.md).
>
> **Superseded in part by `5067e32`.** The backend that landed on `main` is a
> proxy over Managed Agents using the native memory store, not a ChromaDB
> service the agent calls — so the tool-based memory backend described below is
> no longer what we are building. What survives is provisioning the agent, where
> each piece runs, the secrets it needs, and the end-to-end proof. Both open
> questions at the bottom are answered in the plan: the native memory store
> stays, and the backend runs **outside** Managed Agents (the platform deploys
> agents, not web apps).

## Context

`create_agent.py` currently provisions a Managed Agent that relies on the
_native_ `memory_stores` primitive (`/mnt/memory/`, a per-session mounted
filesystem — see its docstring and `README.md`). That primitive is
session-container-local: it's the right tool for "let the agent freely
read/write files," but it is not the ChromaDB-backed engine from Spec 1.

This spec's job is to make the Managed Agent talk to Spec 2's FastAPI
service — over the network — as its memory backend, instead of (or
alongside) the native memory store, and to handle the fact that Managed
Agents sandboxes are **ephemeral**: nothing written to local sandbox disk
survives past that session unless it went through the persistent backend.

## Goal

A Managed Agent configuration where memory read/write happens by calling
Spec 2's FastAPI endpoints as tools, backed durably by Spec 1's ChromaDB
store — reproducing the README's "session 2 remembers session 1" demo end
to end through the new stack.

## Scope

- Tool definitions for the agent (`platform.claude.com` Managed Agents
  tool-use config) that map to Spec 2's endpoints:
  - `search_memory(query, k)` → `GET /memory/search`
  - `write_memory(text, kind)` → `POST /memory`
  - Tool descriptions must be specific and example-driven (see
    `CLAUDE.md` §5: "tool description quality determines tool selection
    quality") — bad descriptions here directly cause the agent to skip
    memory writes or over/under-fetch on search.
- System prompt update: replace the current `/mnt/memory/` instructions in
  `create_agent.py`'s `SYSTEM_PROMPT` with a memory protocol built around
  the two tools above (when to search before answering, when to write
  after learning something new, how to handle a contradiction it detects
  via search results).
- Environment/network config: the Managed Agent's sandbox needs outbound
  network access to reach the FastAPI service's URL; document how that
  service is reached (public endpoint + API key, or whatever networking
  Managed Agents environments support — confirm against current platform
  docs, this may have changed since `create_agent.py` was written, similar
  to the `06616eb` fix already in this repo's history for a memory-stores
  API behavior change).
- Secrets: FastAPI's API key must reach the agent's environment as a
  secret/env var at environment-creation time, not hardcoded in the system
  prompt or committed to the repo.
- Update `run_session_1.py` / `run_session_2.py` (or replace them) to
  exercise the new tool-based flow and produce the same "session 2 answer
  reflects session 1 + new info" proof point the original demo relies on.

## Out of scope

- CI/CD pipeline automation for redeploying FastAPI/Chroma on every push
  (fine to deploy manually for the workshop; flag as a stretch item).
- High-availability / autoscaling of the FastAPI + Chroma service.

## Deliverables

1. Updated `create_agent.py` (or a new `create_agent_v2.py` to avoid
   breaking the existing native-memory-store demo) with the new tool
   definitions and system prompt.
2. Updated session-runner script(s) proving the round-trip.
3. A short `DEPLOYMENT.md`: how the FastAPI+Chroma service gets deployed
   and reached, what secrets/env vars the agent environment needs, and how
   to verify the agent is actually hitting the network service (not
   silently falling back to `/mnt/memory/`).

## Open questions to resolve during implementation

- Keep the native `memory_stores` mount as a fallback/cache, or fully
  replace it with the ChromaDB-backed tools? Recommend fully replacing for
  this track, since running both creates two sources of truth for "what
  does the agent remember."
- Where does the FastAPI + Chroma service itself run — is it also inside
  a Managed Agents Environment, or an entirely separate always-on host?
  This determines whether Spec 1's "ephemeral sandbox" concern even
  applies to the service, or only to the agent's own container.

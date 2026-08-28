# Spec 2 — Backend (FastAPI)

**Owner:** TBD
**Depends on:** Spec 1 (memory engine package)
**Consumed by:** Spec 3 (frontend), Spec 4 (Managed Agents integration)

## Context

FastAPI is the single access point between the outside world (frontend,
and the Managed Agent's own tool calls) and the ChromaDB-backed memory
engine from Spec 1. It should not contain any Chroma-specific logic itself
— it imports `memory_engine` and stays a thin, well-typed HTTP layer.

## Goal

A running FastAPI service with OpenAPI docs (`/docs`) covering session
and memory CRUD, deployable as the backing service the Managed Agent
calls into.

## Scope

- Pydantic schemas: `MemoryWriteRequest`, `MemoryHit`, `MemoryRecord`,
  `SessionCreateRequest`, `SessionResponse` — mirror `memory_engine`'s
  return types 1:1, don't leak Chroma internals (raw distances, embedding
  vectors) into the API surface unless explicitly requested via a
  `?debug=true` flag.
- Endpoints:
  - `POST /memory` — write a memory (wraps `write_memory`)
  - `GET /memory/search?q=...&k=5&tenant_id=...` — semantic query
  - `GET /memory?tenant_id=...` — list (for the inspector panel)
  - `DELETE /memory/{id}`
  - `POST /session` — create/register a session (session_id, tenant_id,
    user_id)
  - `GET /session/{id}` — session metadata + recent memory writes
  - `GET /healthz` — liveness/readiness probe (Managed Agents deployment
    needs this — see Spec 4)
- Auth: at minimum an API-key header (`X-API-Key`) checked against an env
  var; document the upgrade path to per-tenant keys if this goes further
  than the workshop.
- CORS: allow the frontend's dev origin (`localhost:5173` or whatever Vite
  picks) and the deployed frontend origin, configured via env var, not
  hardcoded.
- Error handling: memory-engine exceptions map to proper HTTP status codes
  (404 for missing id, 422 for bad filters) — don't let Chroma exceptions
  leak as raw 500s.

## Out of scope

- Frontend rendering (Spec 3).
- The Managed Agent's own system prompt / tool-calling config (Spec 4) —
  this spec only has to expose endpoints an agent _could_ call as tools.

## Deliverables

1. `backend/` FastAPI app (`app/main.py`, `app/routers/`, `app/schemas.py`).
2. `requirements.txt` / dependency pin for `fastapi`, `uvicorn`,
   `chromadb`, plus whatever Spec 1 needs.
3. Integration tests hitting the app with `httpx`/`TestClient` against a
   temp Chroma path (no live network dependency).
4. `backend/README.md`: how to run locally (`uvicorn app.main:app --reload`)
   and what env vars it expects.

## Open questions to resolve during implementation

- Does session state live in Chroma metadata only, or does it need its own
  lightweight store (SQLite) if session semantics grow beyond what
  metadata filtering can express cleanly?
- Sync vs. async Chroma client — confirm current `chromadb` client
  supports async before committing FastAPI's endpoints to `async def`.

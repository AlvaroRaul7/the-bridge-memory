# Backend — FastAPI wrapper around Managed Agents + ChromaDB

A thin HTTP layer over two separate memory tiers:

- **Short-term / conversational** — the `/session` routes open a Managed
  Agent session with its native memory store mounted at `/mnt/memory/`.
  This service just relays messages; the agent itself decides what it
  writes there during a conversation.

> **Two long-term stores, and `/memory` reads the agent's by default.**
> The agent writes markdown into its own memory store during a session, using
> ordinary file tools against `/mnt/memory/`. It has **no tool that can reach
> this service**, so the Chroma tier stays empty until something explicitly
> writes to it (Spec 4 would be what changes that). A caller asking "what does
> the agent remember?" wants the store, so that is the default; pass
> `?source=chroma` for the vector tier.

- **Long-term** — the `/memory` routes are a thin wrapper over
  `memory_engine` (ChromaDB, see `../memory_engine/README.md`), scoped by a
  caller-supplied `tenant_id`. This service writes/reads/deletes memories
  directly here; there's no agent in the loop for these routes.

Neither router contains logic belonging to the other tier's backend — no
Chroma calls in `agents.py`, no `anthropic` client in `routers/memory.py`.

## Run it

```bash
pip install -r requirements.txt

export ANTHROPIC_API_KEY="sk-ant-..."
export BACKEND_API_KEY="$(openssl rand -hex 16)"
# CHROMA_API_KEY / CHROMA_TENANT / CHROMA_DATABASE / CHROMA_COLLECTION_NAME —
# see ../.env.example. Read via python-dotenv; a `.env` in the repo root
# works, no need to re-export them here.

uvicorn app.main:app --reload      # from backend/
```

OpenAPI docs at http://127.0.0.1:8000/docs.

## Environment

| Variable                                                                       | Required | Default                        | Notes                                                                                                                                                            |
| ------------------------------------------------------------------------------ | -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                                            | yes      | —                              | Read by the SDK. An `ant auth login` profile works too.                                                                                                          |
| `BACKEND_API_KEY`                                                              | yes      | —                              | The `X-API-Key` callers must send. Startup fails without it, so the service is never accidentally open.                                                          |
| `AGENT_ID`                                                                     | —        | `.agent_id`                    | Falls back to the dotfile `create_agent.py` writes in the repo root.                                                                                             |
| `ENVIRONMENT_ID`                                                               | —        | `.environment_id`              | Same.                                                                                                                                                            |
| `CORS_ORIGINS`                                                                 | —        | `http://localhost:5173`        | Comma-separated. Vite's dev origin by default.                                                                                                                   |
| `AGENT_TIMEOUT_SECONDS`                                                        | —        | `300`                          | Wall-clock ceiling on one agent turn.                                                                                                                            |
| `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, `CHROMA_COLLECTION_NAME` | —        | see `../.env.example`          | Read by `memory_engine`, not by this service directly. Falls back to a local `PersistentClient` if `CHROMA_API_KEY` is unset.                                    |
| `CUSTOMER_STORE_REGISTRY_PATH`                                                 | —        | `.customer_memory_stores.json` | Read by `agents.py`. Maps `customer_id` → native memory store id (see Tier-3 section below). Gitignored — it's local, mutable state, not a provisioned resource. |

There is no more `MEMORY_STORE_ID` — every session now gets its own
customer-scoped store instead of one shared one; see below.

Because the resource IDs fall back to the dotfiles, a local checkout that has
already run `create_agent.py` needs only `ANTHROPIC_API_KEY` and `BACKEND_API_KEY`.

## Endpoints

| Method   | Path                      | Notes                                                                                                                                            |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/session`                | `{customer_id, title?, instructions?}` — get-or-creates that customer's own native store, mounts it `read_write`.                                |
| `POST`   | `/session/{id}/message`   | Sends one message, returns the full reply. References every document attached via `/documents` so far.                                           |
| `GET`    | `/session/{id}`           | `?customer_id=...` — status, title, token/cost usage.                                                                                            |
| `POST`   | `/session/{id}/documents` | `{documents: [{filename, content, media_type?}]}` — uploads via the Files API, adds to this session's accumulated set. See Tier-3 section below. |
| `POST`   | `/memory`                 | `{tenant_id, text, metadata}` — write a long-term memory.                                                                                        |
| `GET`    | `/memory/search`          | `?tenant_id=...&q=...&k=5` — semantic search.                                                                                                    |
| `GET`    | `/memory`                 | `?source=agent` (default) lists the agent's own store; `?source=chroma&tenant_id=...` lists the vector tier.                                     |
| `DELETE` | `/memory/{id}`            | `?source=` is **required, no default**. `chroma` also needs `tenant_id` and 404s if it isn't that tenant's.                                      |
| `POST`   | `/memory/curate`          | `{tenant_id}` — merge duplicates, flag contradictions, prune stale entries. See `app/curator.py`.                                                |
| `GET`    | `/healthz`                | No auth, no upstream call.                                                                                                                       |

All except `/healthz` require `X-API-Key`.

## Things worth knowing before you extend this

**`POST /message` blocks for the whole turn.** Tens of seconds is normal; a
tool-heavy turn can take minutes. That is fine behind `uvicorn` directly, but
many proxies and load balancers cut idle connections at 30–60s. The fix, when it
becomes a problem, is to stream: `agents.ask()` is already an event loop, so the
SSE version is the same loop yielding `text/event-stream` chunks instead of
accumulating them. Spec 3 will want that anyway for a typing indicator.

**Requests are synchronous on purpose.** The handlers are `def`, not
`async def`, so FastAPI runs them in a threadpool — correct for the blocking
SDK client. Writing `async def` around a blocking call would stall the event
loop for every other request. A long turn holds a threadpool thread (40 by
default), so if real concurrency is ever needed, switch to `AsyncAnthropic`
rather than raising the thread count.

**Transient idle events are not the end of a turn.** See the comment in
`agents.ask()` and the regression test in `tests/test_session.py`. This is the
one real bug in the upstream scripts and it is easy to reintroduce.

**Upstream auth failures return 502, not 401.** A 401 from this service means
_your_ `X-API-Key` was wrong. If Anthropic rejects _our_ credentials that is a
502, so nobody wastes time debugging the wrong key.

## Tier-3: production-shaped memory

Two stretch-goal pieces, both in `agents.py`:

**Per-customer native memory (`get_or_create_customer_store`).** Every
`/session` used to mount the one store in `MEMORY_STORE_ID`, shared by every
caller. Now `POST /session` takes `customer_id` and get-or-creates a store
tagged `metadata={"customer_id": ...}`, cached in a local
`CUSTOMER_STORE_REGISTRY_PATH` JSON file (`customer_id` → store id) so the
same customer gets the same store back on their next session. `GET
/session/{id}` needs `customer_id` too, for the same reason `/memory` needs
`tenant_id`: this service has no other way to know which store a given
session's response should report.

**Growing document sets (`attach_documents` / Files API).**
`POST /session/{id}/documents` uploads documents via the Files API instead
of inlining their text into the prompt (the old `run_session_1.py` pattern),
and accumulates file ids per session in memory. Every subsequent
`POST /session/{id}/message` attaches the whole accumulated set as
`{"type": "document", "source": {"type": "file", "file_id": ...}}` content
blocks ahead of the text — call `/documents` again with a new batch and the
next message sees the union, not just the latest batch. Two caveats: the
accumulated-set-per-session state is process-local (a restart or a second
instance loses it — fine for a demo, not for production), and the document
content-block shape mirrors the standard Messages API's file-reference
block, which hasn't been confirmed against a live Managed Agents session
(nothing else in this repo uses the Files API yet).

## Auth, and where it needs to go

Today there is one shared key in `BACKEND_API_KEY`, checked with
`secrets.compare_digest`. That is the workshop-grade minimum, and it has a
specific limitation worth stating plainly: **the key authenticates the caller
but does not authorize a tenant.** Both `tenant_id` on `/memory` and
`customer_id` on `/session` are plain caller-supplied params — `memory_engine`
and the customer-store registry each guarantee their id can't see past its
own data, but nothing stops a caller holding the one shared `X-API-Key` from
passing a different id than the one it should be scoped to.

The upgrade path, when this needs to serve more than one real tenant:

1. Replace the single key with a lookup — key → `{tenant_id, customer_id}` —
   in a small table or a secrets manager. `require_api_key` returns the
   caller's identity instead of `None`.
2. Take both ids from that identity rather than from the request, so a
   caller physically cannot address another tenant's or customer's data. Do
   not keep accepting them as parameters once there's a real identity to
   derive them from; that just moves the trust boundary to the client.
3. For `/session` specifically: mount a shared read-only store alongside the
   customer's read-write one (max 8 mounted per session) for org-wide
   documents, so a customer's session still sees company-wide policy without
   being able to write to it.

## Tests

```bash
pytest tests -q
```

50 tests, no network, no API key, no provisioned resources. `agents.py`'s
Anthropic client is replaced by a fake covering the slice of `client.beta.*`
and `client.files.*` it uses; `memory.py` and `curator.py` are tested by monkeypatching
`memory_engine` calls and the curator's judge call directly.

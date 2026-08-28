# Backend — FastAPI wrapper around Managed Agents + ChromaDB

A thin HTTP layer over two separate memory tiers:

- **Short-term / conversational** — the `/session` routes open a Managed
  Agent session with its native memory store mounted at `/mnt/memory/`.
  This service just relays messages; the agent itself decides what it
  writes there during a conversation.
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

| Variable                                                                       | Required | Default                 | Notes                                                                                                                         |
| ------------------------------------------------------------------------------ | -------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                                            | yes      | —                       | Read by the SDK. An `ant auth login` profile works too.                                                                       |
| `BACKEND_API_KEY`                                                              | yes      | —                       | The `X-API-Key` callers must send. Startup fails without it, so the service is never accidentally open.                       |
| `AGENT_ID`                                                                     | —        | `.agent_id`             | Falls back to the dotfile `create_agent.py` writes in the repo root.                                                          |
| `ENVIRONMENT_ID`                                                               | —        | `.environment_id`       | Same.                                                                                                                         |
| `MEMORY_STORE_ID`                                                              | —        | `.memory_store_id`      | Same.                                                                                                                         |
| `CORS_ORIGINS`                                                                 | —        | `http://localhost:5173` | Comma-separated. Vite's dev origin by default.                                                                                |
| `AGENT_TIMEOUT_SECONDS`                                                        | —        | `300`                   | Wall-clock ceiling on one agent turn.                                                                                         |
| `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, `CHROMA_COLLECTION_NAME` | —        | see `../.env.example`   | Read by `memory_engine`, not by this service directly. Falls back to a local `PersistentClient` if `CHROMA_API_KEY` is unset. |

Because the resource IDs fall back to the dotfiles, a local checkout that has
already run `create_agent.py` needs only the two keys.

## Endpoints

| Method   | Path                    | Notes                                                                   |
| -------- | ----------------------- | ----------------------------------------------------------------------- |
| `POST`   | `/session`              | Creates a session with the native memory store mounted `read_write`.    |
| `POST`   | `/session/{id}/message` | Sends one message, returns the full reply.                              |
| `GET`    | `/session/{id}`         | Status, title, token/cost usage.                                        |
| `POST`   | `/memory`               | `{tenant_id, text, metadata}` — write a long-term memory.               |
| `GET`    | `/memory/search`        | `?tenant_id=...&q=...&k=5` — semantic search.                           |
| `GET`    | `/memory`               | `?tenant_id=...` — list, no ranking (for a memory-inspector panel).     |
| `DELETE` | `/memory/{id}`          | `?tenant_id=...` — 404s if the id doesn't exist or isn't that tenant's. |
| `GET`    | `/healthz`              | No auth, no upstream call.                                              |

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

## Auth, and where it needs to go

Today there is one shared key in `BACKEND_API_KEY`, checked with
`secrets.compare_digest`. That is the workshop-grade minimum, and it has a
specific limitation worth stating plainly: **the key authenticates the caller
but does not authorize a tenant.** `tenant_id` on every `/memory` route is a
plain caller-supplied query/body param — `memory_engine` guarantees a given
`tenant_id` can't see past its own data, but nothing stops a caller holding
the one shared `X-API-Key` from passing a different `tenant_id` than the one
it should be scoped to.

The upgrade path, when this needs to serve more than one real tenant:

1. Replace the single key with a lookup — key → `tenant_id` — in a small
   table or a secrets manager. `require_api_key` returns the caller's
   `tenant_id` instead of `None`.
2. Take `tenant_id` from that identity in every `/memory` route rather than
   from the request, so a caller physically cannot address another tenant's
   memories. Do not keep accepting a `tenant_id` query parameter once there's
   a real identity to derive it from; that just moves the trust boundary to
   the client.
3. The `/session` side has a parallel, already-solved version of this: give
   each user their own native memory store (max 8 mounted per session) plus
   a shared read-only store for org-wide documents, so isolation follows from
   how the session is created rather than from filtering code.

## Tests

```bash
pytest tests -q
```

23 tests, no network, no API key, no provisioned resources — the Anthropic
client is replaced by a fake covering the slice of `client.beta.*` that
`agents.py` uses.

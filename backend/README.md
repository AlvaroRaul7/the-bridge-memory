# Backend — FastAPI wrapper around Managed Agents

A thin HTTP layer over an Anthropic Managed Agent. It opens sessions with the
long-term memory store mounted, relays messages, and exposes read access to what
the agent chose to remember.

It is a **proxy, not a memory system**. It never decides what is worth
remembering — the agent does that inside its session, writing to `/mnt/memory/`.
There is no vector store here and no `memory_engine` import.

## Run it

```bash
pip install -r requirements.txt

export ANTHROPIC_API_KEY="sk-ant-..."
export BACKEND_API_KEY="$(openssl rand -hex 16)"

uvicorn app.main:app --reload      # from backend/
```

OpenAPI docs at http://127.0.0.1:8000/docs.

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Read by the SDK. An `ant auth login` profile works too. |
| `BACKEND_API_KEY` | yes | — | The `X-API-Key` callers must send. Startup fails without it, so the service is never accidentally open. |
| `AGENT_ID` | — | `.agent_id` | Falls back to the dotfile `create_agent.py` writes in the repo root. |
| `ENVIRONMENT_ID` | — | `.environment_id` | Same. |
| `MEMORY_STORE_ID` | — | `.memory_store_id` | Same. |
| `CORS_ORIGINS` | — | `http://localhost:5173` | Comma-separated. Vite's dev origin by default. |
| `AGENT_TIMEOUT_SECONDS` | — | `300` | Wall-clock ceiling on one agent turn. |

Because the resource IDs fall back to the dotfiles, a local checkout that has
already run `create_agent.py` needs only the two keys.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/session` | Creates a session with the store mounted `read_write`. |
| `POST` | `/session/{id}/message` | Sends one message, returns the full reply. |
| `GET` | `/session/{id}` | Status, title, token/cost usage. |
| `GET` | `/memory` | `?path_prefix=/&include_content=false` |
| `DELETE` | `/memory/{id}` | |
| `GET` | `/healthz` | No auth, no upstream call. |

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
*your* `X-API-Key` was wrong. If Anthropic rejects *our* credentials that is a
502, so nobody wastes time debugging the wrong key.

## Auth, and where it needs to go

Today there is one shared key in `BACKEND_API_KEY`, checked with
`secrets.compare_digest`. That is the workshop-grade minimum, and it has a
specific limitation worth stating plainly: **the key authenticates the caller
but does not scope them.** Every caller sees the same single memory store, taken
from `MEMORY_STORE_ID`.

The upgrade path, when this needs to serve more than one user:

1. Replace the single key with a lookup — key → `{tenant_id, memory_store_id}` —
   in a small table or a secrets manager. `require_api_key` returns the caller's
   identity instead of `None`.
2. Take the store ID from that identity rather than from settings, so a caller
   physically cannot address another tenant's store. Do not accept a
   `memory_store_id` query parameter; that just moves the trust boundary to the
   client.
3. Give each user their own store (max 8 mount per session) and mount a shared
   read-only store alongside it for org-wide documents. Isolation then follows
   from how the session is created rather than from filtering code.

## Tests

```bash
pytest tests -q
```

23 tests, no network, no API key, no provisioned resources — the Anthropic
client is replaced by a fake covering the slice of `client.beta.*` that
`agents.py` uses.

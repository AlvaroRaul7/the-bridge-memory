# memory_engine

ChromaDB-backed memory store. Implements `specs/01-memory-engine-chromadb.md`.
Imported directly by the FastAPI backend (`specs/02-backend-fastapi.md`) — no
HTTP boundary between them.

## Config

Reads from the environment (`.env`, see `.env.example`):

| Var                      | Purpose                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CHROMA_API_KEY`         | Chroma Cloud API key. If unset, falls back to a local `PersistentClient` under `.chroma/` (dev/tests only — no network dependency). |
| `CHROMA_TENANT`          | Chroma Cloud tenant id.                                                                                                             |
| `CHROMA_DATABASE`        | Chroma Cloud database name (e.g. `dev`).                                                                                            |
| `CHROMA_COLLECTION_NAME` | Collection name (default `intelligent-memory`).                                                                                     |

## Schema

One collection (`intelligent-memory`), shared across tenants. Every record
carries:

- `tenant_id` — **set by the engine, not trusted from callers.** This is the
  isolation boundary: every query/list/delete filter is merged with
  `tenant_id` before it reaches Chroma, so a caller can narrow a query but
  can never widen it past its own tenant.
- `timestamp` — ISO-8601 UTC, set by the engine if the caller didn't supply one.
- `session_id`, `user_id`, `source`, `kind` — caller-supplied, optional,
  free-form metadata for filtering (e.g. `kind="correction"`).

### Why one collection with a `tenant_id` filter, not one collection per tenant

Chroma Cloud was provisioned with a single `intelligent-memory` collection.
Metadata-filtered queries against one collection also avoid the operational
overhead of creating/tracking a collection per tenant at demo scale (a
handful of tenants, a few dozen memories each). Revisit if a tenant's memory
volume grows large enough that per-tenant collections meaningfully improve
query latency.

### Embedding function

Uses Chroma's built-in default embedding function (no explicit
`embedding_function=` passed to `get_or_create_collection`) — no extra
dependency, good enough for short factual memories at this scale. Swapping
in a different embedding function later (e.g. an Anthropic/OpenAI call) only
touches `client.py::get_collection` — the public API in `engine.py` doesn't
change.

## Public API

```python
from memory_engine import write_memory, query_memory, list_memories, delete_memory, delete_by_filter

write_memory(tenant_id, text, metadata=None) -> str  # returns the new id
query_memory(tenant_id, query_text, k=5, filters=None) -> list[MemoryHit]
list_memories(tenant_id, filters=None) -> list[MemoryRecord]
delete_memory(record_id) -> None
delete_by_filter(tenant_id, filters=None) -> None
```

All five accept an optional `collection=` keyword for tests/callers that
want to pass in a specific Chroma collection instead of the cached default.

## Retention / curation policy — not implemented in v1

`delete_by_filter` and `delete_memory` are **hard deletes**. There's no
tombstone/supersede model yet. If the curation policy (see
`stretch_memory_curator.py` for the original sketch) needs to detect and
merge contradictory memories rather than just overwrite, that logic belongs
in a separate curator module that calls `query_memory` + `write_memory` +
`delete_memory` — it should not be built into the engine's write path.

## Running tests

```bash
pytest tests/test_memory_engine.py
```

Tests run against an ephemeral in-memory Chroma client (no network, no real
credentials needed) via the `collection=` override on every function.

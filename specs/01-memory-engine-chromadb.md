# Spec 1 — Memory Engine (ChromaDB)

**Owner:** TBD
**Depends on:** none (foundation for Spec 2)
**Consumed by:** Spec 2 (FastAPI backend)

## Context

The current repo implements memory via the Managed Agents native
`memory_stores` filesystem primitive (`/mnt/memory/`, see `create_agent.py`,
`run_session_1.py`, `run_session_2.py`). `memory_backend.py` is an older,
explicitly deprecated attempt at a client-side filesystem backend.

This spec replaces both with a real vector-backed memory engine using
ChromaDB, so memory becomes queryable by semantic similarity rather than
"the agent skims files it decides to open."

## Goal

A standalone Python module (`memory_engine/`) that FastAPI (Spec 2) imports
directly — no HTTP boundary between them.

## Scope

- Chroma collection schema:
  - one collection per tenant/customer (or a single collection with a
    `tenant_id` metadata field — pick one and document why)
  - metadata fields: `session_id`, `user_id`, `timestamp`, `source`
    (e.g. "session-1-doc", "agent-note"), `kind` (e.g. "fact", "correction")
- Embedding function: use Chroma's default `SentenceTransformer` embedding
  function to start; leave a seam to swap in an Anthropic/OpenAI embedding
  call later without changing the public API.
- Public API (exact function signatures are this spec's deliverable):
  - `write_memory(tenant_id, text, metadata) -> id`
  - `query_memory(tenant_id, query_text, k=5, filters=None) -> list[MemoryHit]`
  - `delete_memory(id)` / `delete_by_filter(tenant_id, filters)`
  - `list_memories(tenant_id, filters=None) -> list[MemoryRecord]` (for the
    frontend's memory-inspector panel in Spec 3)
- Retention/curation policy: define (doesn't have to be implemented in v1)
  how contradictory or stale memories get superseded rather than just
  accumulating — this is the "memory curator" idea already sketched in
  `stretch_memory_curator.py`; decide whether it runs synchronously on
  write or as a periodic job.
- Persistence: use Chroma's `PersistentClient` with a mounted volume path
  (not in-memory `Client()`) since the target deployment is Anthropic
  Managed Agents, whose sandboxes are ephemeral — the Chroma data directory
  must live outside the agent's own sandbox lifecycle (see Spec 4 for where
  that volume actually lives).

## Out of scope

- The HTTP layer (Spec 2 owns that).
- Multi-region / high-availability Chroma deployment.

## Deliverables

1. `memory_engine/` package with the functions above, type-hinted.
2. Unit tests covering write → query round-trip, tenant isolation, and
   filter behavior.
3. A short `memory_engine/README.md` documenting the schema and the
   embedding-function seam.

## Open questions to resolve during implementation

- Single global Chroma collection with metadata filtering vs. one
  collection per tenant — affects query performance at scale differently.
- Does `delete_by_filter` need to be soft (tombstone) or hard delete for
  the curation policy to work?

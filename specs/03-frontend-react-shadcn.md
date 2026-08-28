# Spec 3 — Frontend (React + shadcn/ui)

**Owner:** TBD
**Depends on:** Spec 2 (FastAPI backend — can start against a mocked API)
**Consumed by:** end users / demo

## Context

The workshop's current "demo" is reading two `.txt` files side by side
(`outputs/session1.txt`, `outputs/session2.txt`) in a terminal. This spec
replaces that with a real UI so the memory behavior (write, recall,
contradiction-reconciliation) is visible live, not post-hoc from log files.

## Goal

A React + Vite + shadcn/ui SPA that talks to the FastAPI backend (Spec 2)
and gives a human-usable window into the agent's memory.

## Scope

- **Chat/session view**: send a message, show the agent's (or a stubbed)
  response, show which memories were retrieved and used for that turn
  (surfacing `GET /memory/search` results inline, not just the final
  answer — this is the actual product differentiator described in the
  README: "the agent decides what to remember").
- **Memory inspector panel**: a side panel listing memories for the
  current tenant/session (`GET /memory`), with metadata (kind, source,
  timestamp) visible, and a manual delete action per row for demo control.
- **Session switcher**: a simple dropdown/select to create or switch
  between sessions (`POST /session`, `GET /session/{id}`), so the classic
  demo ("session 1 answer vs. session 2 answer, same question") can be
  reproduced in the UI instead of two terminal windows.
- Use shadcn/ui primitives (`Card`, `ScrollArea`, `Sheet` or `Dialog` for
  the inspector panel, `Command`/`Select` for the session switcher) rather
  than hand-rolled components — the point of shadcn here is consistent,
  ownable components, not a component library dependency.
- API client: a thin typed fetch wrapper (or `openapi-typescript` codegen
  from FastAPI's `/openapi.json` if time allows) — don't hand-write
  duplicate types that drift from Spec 2's schemas.

## Out of scope

- Auth/login UI (assume a single dev API key in an env var for the
  workshop; flag as a stretch item for real multi-tenant use).
- Mobile-responsive polish — desktop-first is fine for the demo.

## Deliverables

1. `frontend/` Vite + React + TypeScript app with shadcn/ui installed and
   configured (`components.json`, Tailwind config).
2. The three views above, wired to real endpoints (or a mock server if
   Spec 2 isn't ready yet — use `msw` so the swap to the real API is a
   one-line change).
3. `frontend/README.md`: `npm install && npm run dev`, plus the API base
   URL env var it expects.

## Open questions to resolve during implementation

- Does the "memories used this turn" view need real-time streaming (SSE/WS)
  from the backend, or is a simple request/response per turn sufficient
  for the demo? Default to request/response; only add streaming if the
  agent response itself is streamed by Spec 4.

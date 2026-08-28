# Frontend — Spec 3

React + Vite + TypeScript + shadcn/ui. Implements
[`specs/03-frontend-react-shadcn.md`](../specs/03-frontend-react-shadcn.md)
against the API defined in
[`specs/02-backend-fastapi.md`](../specs/02-backend-fastapi.md).

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 12 tests: every Spec 2 route, through the real client
npm run build
```

Runs out of the box with **no backend** — msw serves the Spec 2 API in the
browser until the real one exists.

## Environment

Copy `.env.example` to `.env.local`.

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL of the Spec 2 FastAPI service. |
| `VITE_API_KEY` | `dev-key` | Sent as `X-API-Key` on every request. Spec 2's single dev key; per-tenant keys are the documented upgrade path. |
| `VITE_USE_MOCKS` | `true` | `true` starts the msw worker. **Set to `false` to hit the real backend.** |
| `VITE_CLERK_PUBLISHABLE_KEY` | *(blank)* | Blank runs unauthenticated. Set a `pk_test_…` key to gate the app behind Clerk sign-in. |

**That last row is the one-line swap Spec 3 asks for.** No call site changes —
`src/lib/api.ts` is the only place that calls `fetch`, and it always talks to
`VITE_API_BASE_URL`. When mocks are off, msw is not even bundled (it is a
dynamic import in `src/main.tsx`).

## The three Spec 3 views — the **Console** tab

| View | Component | Endpoints |
| --- | --- | --- |
| **Chat / session** | `components/console/chat-view.tsx` | `GET /memory/search` per turn, rendered **inline above each answer** — which memories were retrieved and how they scored. "Commit to memory" calls `POST /memory`. |
| **Memory inspector** | `components/console/memory-inspector.tsx` | `GET /memory?tenant_id=` in a shadcn `Sheet`, showing kind / source / timestamp / id, with a per-row `DELETE /memory/{id}`. |
| **Session switcher** | `components/console/session-switcher.tsx` | shadcn `Select` over sessions; **New session** calls `POST /session`, selecting one calls `GET /session/{id}`. A new session against the same tenant is the "session 1 vs session 2" demo, in one window instead of two terminals. |

Each scenario card is its own **tenant** (`tenant_<scenario-id>`), so switching
cards switches tenant. Isolation is a property of the request, not of filtering
code in the UI.

### On the agent's reply

Spec 2 exposes memory and session CRUD only — it has no chat endpoint, because
per Spec 4 the agent calls the backend *as tools* rather than the UI proxying a
conversation. So the reply text is the stub Spec 3 explicitly permits.

**Retrieval is not stubbed.** Every turn issues a real `GET /memory/search` and
renders exactly what came back. Per Spec 3's open question, this is
request/response — no SSE — pending Spec 4.

## The Scenarios tab

A reference view over the four cards in [`../scenarios.json`](../scenarios.json):
the persona and graded criteria, every synthetic document, and a round-1 vs
round-2 contradiction table.

This is demo **content**, not architecture — the same documents feed whatever
Spec 1 ingests. It makes no backend calls and holds no memory model of its own.

## Layout

```
src/
├── lib/
│   ├── api.ts            ← the ONLY place this app calls fetch
│   ├── api-types.ts      ← mirrors Spec 2's Pydantic schemas 1:1
│   ├── scenarios.ts      ← loads ../scenarios.json + ../synthetic-data/
│   └── types.ts          ← scenario registry types (no backend contract)
├── mocks/
│   ├── handlers.ts       ← all 7 Spec 2 routes in msw
│   ├── handlers.spec.ts  ← 12 tests over those routes
│   ├── seed.ts           ← seeds tenants from the scenario registry
│   └── browser.ts
├── data/
│   └── scenario-answers.ts  ← stubbed replies + seed memories; delete once
│                              Specs 1/2/4 are running
├── components/
│   ├── console/          ← the three Spec 3 views
│   ├── scenario/         ← the Scenarios content tabs
│   └── ui/               ← shadcn primitives (components.json at the root)
└── App.tsx
```

## Known gaps

- **`api-types.ts` is hand-written**, which Spec 3 warns against. There is no
  `/openapi.json` to generate from yet. The moment Spec 2 runs:

  ```bash
  npx openapi-typescript http://localhost:8000/openapi.json -o src/lib/api-types.ts
  ```

  Until then that file *is* the contract — change it and change
  `specs/02-backend-fastapi.md` with it.
- **The msw search is keyword overlap, not embeddings.** Chroma does semantic
  similarity; the mock does not pretend to. Ranking will change when Spec 1 is
  real.
- **`?debug=true`** is implemented in the mock (returns `distance`) but nothing
  in the UI surfaces it yet.
- Desktop-first; no mobile polish, out of scope per Spec 3.
- **Clerk goes beyond Spec 3**, which puts auth out of scope. See below.

## Authentication (Clerk) — beyond Spec 3

Spec 3 puts auth out of scope: *"assume a single dev API key in an env var for
the workshop; flag as a stretch item for real multi-tenant use."* This is that
stretch item, built so it does not disturb the spec'd behaviour.

**Clerk is optional and off by default.** With `VITE_CLERK_PUBLISHABLE_KEY`
blank, the app runs exactly as Spec 3 describes — unauthenticated, single dev
API key. That is also how the e2e suite runs. Set the key and:

- the app gates behind a Clerk sign-in screen;
- requests carry `Authorization: Bearer <clerk session token>` **alongside**
  the existing `X-API-Key`, so a Spec 2 backend that knows nothing about Clerk
  keeps working;
- memory is scoped to the signed-in account.

### Package note

Use **`@clerk/react`** (v6), not `@clerk/clerk-react` (the v5 name). v6 also
replaced `<SignedIn>` / `<SignedOut>` with a single
`<Show when="signed-in" fallback={…}>`.

`<Show>` renders `null` until Clerk resolves, so `<ClerkLoading>` and
`<ClerkFailed>` are handled explicitly — without the failure branch, an
unreachable Clerk leaves a permanently blank page. There is an e2e test for
exactly that.

### Tenant scoping

Two things must stay isolated, on different axes: the four assistants must not
read each other's memory, and one account must not read another's. So the
Spec 2 `tenant_id` is the pair:

```
tenant_<accountId>_<scenarioId>      signed in
tenant_demo_<scenarioId>             Clerk off / signed out
```

### What Spec 2 needs to change for this to be real

Right now the backend still trusts `tenant_id` as a query parameter — fine for
a workshop, not for multi-tenant use. The real version verifies the Clerk token
server-side and **derives** the tenant from it, ignoring whatever the client
sent. That is a change to Spec 2's auth section, not something the frontend can
do on its own.

### The sign-in backdrop

`src/images/The Bridge.jpeg` is the source photo (4032px, 1.3 MB).
`src/images/the-bridge.jpg` is the resized, recompressed copy the app actually
imports (2400px, 409 KB) — a login screen should not block on a 1.3 MB image.
Regenerate it after replacing the source:

```bash
sips -Z 2400 -s format jpeg -s formatOptions 68 \
  "src/images/The Bridge.jpeg" --out src/images/the-bridge.jpg
```

The photo is hazy and low-contrast, so the frame applies a small
contrast/saturation filter plus a two-part scrim — a vertical gradient for the
white type at top and bottom, and a radial pool behind the card — which keeps
the bridge visible through the middle instead of flattening it to grey.

Run the auth tests with:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... npx playwright test auth
```

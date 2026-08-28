# Task 02 — Run the backend against agent v2

**Goal:** bring `backend/` up pointing at the v2 objects, and prove one real
round trip: browser-side call → backend → Managed Agents → answer.

**Depends on:** [01](01-provision-agent.md) · **Time:** ~20 min · **Needs a live `ANTHROPIC_API_KEY`:** yes
**Files:** none. `backend/` belongs to Spec 2 — **do not edit it**. If something
there needs changing, write it down here and tell its owner.

---

## Steps

### 1. Install and run the offline test suite first

```bash
pip install -r backend/requirements.txt
cd backend && pytest tests -q
```

23 tests, no network, no API key. If they fail on a clean checkout, that is a
Spec 2 problem — report it before going further, do not work around it.

### 2. Start the service pointed at the v2 objects

Configuration lives in a git-ignored `.env` at the repo root — copy
`.env.example` and fill it in. Since `c6d4a76` the backend reads it through
`python-dotenv`, so a `.env` in the repo root is picked up without exporting
anything. From `backend/`:

```bash
uvicorn app.main:app --port 8010
```

The Chroma tier needs `CHROMA_API_KEY` / `CHROMA_TENANT` / `CHROMA_DATABASE`
too — those belong to Spec 1, ask whoever provisioned the Chroma Cloud account.

Environment variables win over the dotfiles, so the original demo's `.agent_id`
is untouched and both can coexist.

**Port 8010, not 8000.** On the demo laptop 8000 is taken by an unrelated
project. Whatever port is chosen, Spec 3 needs to know it, and `CORS_ORIGINS`
must list the frontend's origin (not the backend's).

---

## How to verify

```bash
curl -s localhost:8000/healthz
# {"status":"ok"}

# auth actually gates the rest
curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/memory          # 401
curl -s -o /dev/null -w "%{http_code}\n" -H "X-API-Key: $BACKEND_API_KEY" \
  localhost:8000/memory                                                  # 200

# one real turn, end to end
SESSION=$(curl -s -X POST localhost:8000/session \
  -H "X-API-Key: $BACKEND_API_KEY" -H "content-type: application/json" \
  -d '{"title":"smoke test"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "$SESSION"        # sesn_...

curl -s -X POST "localhost:8000/session/$SESSION/message" \
  -H "X-API-Key: $BACKEND_API_KEY" -H "content-type: application/json" \
  -d '{"text":"List what you find under /mnt/memory/ and say how many files there are."}' \
  | python3 -m json.tool
```

The last response must have `"stop_reason": "end_turn"`, non-empty `text`, and a
`tool_uses` array containing at least one entry with `"touched_memory": true`.
That flag is the proof the agent actually looked at the store — it is also what
Spec 3 renders in its panel.

First call is slow (the container is booting). Tens of seconds is normal.

---

## Done when

- [ ] `pytest tests -q` passes on a clean checkout
- [ ] `/healthz` answers, and every other route 401s without the key
- [ ] A session is created and one message returns `stop_reason: end_turn`
- [ ] At least one `tool_use` came back with `touched_memory: true`
- [ ] `git status` shows no changes under `backend/`

## Verified on 2026-08-28

- `pytest tests -q` → **23 passed in 0.09s**, on Python 3.12.9 with
  `anthropic 1.2.0`, `fastapi 0.141.1`, in a venv at `.venv/`.
- `/healthz` → `{"status":"ok"}`; `/memory` → 401 without the key, 200 with it,
  reporting the v2 store and zero memories.
- One real turn: `stop_reason: "end_turn"` in **11.4s** on a cold container,
  with three `bash` tool uses, all `touched_memory: true`. The agent ran
  `ls -R /mnt/memory/` as its first action, exactly as the protocol says.

## Gotchas

- **`ConfigError` at startup** naming `AGENT_ID`: the env var is empty and the
  dotfile fallback is missing. Check you exported from inside `backend/` with
  `../` paths.
- **A 502 means Anthropic rejected *our* credentials**, not yours: the backend
  deliberately maps upstream auth failures to 502 so nobody debugs the wrong key.
- **`stop_reason: "timeout"`** means the turn ran past `AGENT_TIMEOUT_SECONDS`
  (300 by default). On a first cold boot with big documents that can happen —
  raise it rather than assuming the agent hung.

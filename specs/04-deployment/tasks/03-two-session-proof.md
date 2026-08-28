# Task 03 — The two-session proof, through the backend

**Goal:** the demo the whole track exists for — *session 2 answers better than
session 1 because it remembers* — driven through the backend's own API, not the
SDK. If it works here, it works for Spec 3's UI.

**Depends on:** [02](02-run-backend.md) · **Time:** ~30 min · **Needs a live `ANTHROPIC_API_KEY`:** yes
**Files:** `run_demo_v2.py` (new). **Do not touch** `run_session_1.py`, `run_session_2.py`, `backend/`.

---

## What the script does

Two sessions against the same agent and the same store, with the same question:

1. Session 1: inline the `synthetic-data/round1/` documents, ask the question,
   then send `CONSOLIDATE` so the promotion moment is explicit and visible.
2. Session 2: a **new** session (so the only thing carried over is long-term
   memory), inline `synthetic-data/round2/` — which contradicts round 1 — ask
   the identical question.
3. Save both answers to `outputs/session1_v2.txt` and `session2_v2.txt`, and
   print the memory store's contents before and after.

It talks to `http://localhost:8000` with `X-API-Key`, using only `POST /session`,
`POST /session/{id}/message` and `GET /memory`. Use `httpx` or `requests` — no
Anthropic SDK in this script; the point is to exercise the same surface the
frontend will.

Suggested shape (contract, not code to copy blindly):

```python
def create_session(title: str) -> str: ...
def ask(session_id: str, text: str) -> dict: ...      # returns the MessageResponse dict
def list_memories(include_content: bool = True) -> list[dict]: ...
```

Read `backend/README.md` and `backend/app/schemas.py` for the exact request and
response shapes. Do not guess field names — `MessageResponse` carries
`text`, `stop_reason` and `tool_uses[]`.

---

## How to verify

### 1. The store starts empty and fills up

```bash
curl -s -H "X-API-Key: $BACKEND_API_KEY" "localhost:8000/memory?include_content=true" \
  | python3 -m json.tool
```

Empty before session 1, 3–10 files after. Fifty means the agent is storing the
transcript — that is a prompt problem, fix it in task 01.

### 2. Session 2 demonstrably used memory

Its answer must:

- say it is drawing on something learned earlier ("From what you told me
  before..."),
- reflect the **new** information from `round2/`,
- name the contradiction rather than papering over it.

And its `tool_uses[]` must contain entries with `touched_memory: true` **before**
the answer text — the agent read the store, it did not just carry context.

### 3. The contradiction was reconciled, not appended

```bash
curl -s -H "X-API-Key: $BACKEND_API_KEY" "localhost:8000/memory?include_content=true" \
  | python3 -c "import sys,json;[print(m['path'],'|',(m.get('content') or '')[:120]) for m in json.load(sys.stdin)['memories']]"
```

The file about the contradicted fact must have been **edited in place**, with
the new fact and a date — not a second file saying the opposite of the first.
Two files disagreeing is the failure mode this whole prompt exists to prevent.

### 4. Read the rate, not the anecdote

Run the full sequence three times from an empty store (delete the memories
between runs with `DELETE /memory/{id}`, or provision a fresh store) and record:

| Run | Read memory before answering? | Reflected round2? | Named the contradiction? | Edited in place? |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Two out of three is the minimum for a live demo. If it is one out of three, fix
the system prompt in task 01 — one change at a time, then re-run all three.

---

## Done when

- [ ] `run_demo_v2.py` runs both sessions end to end without manual steps
- [ ] `outputs/session1_v2.txt` and `outputs/session2_v2.txt` written
- [ ] All four checks above pass
- [ ] The three-run table is filled in, at least 2 of 3
- [ ] Screenshot of the memory store contents after session 2, for the deck

## Gotchas

- **Do not reuse session 1's session for the second round.** A new session is
  the entire point: if the conversation carried over, nothing was proven.
- **A slow first turn is the container booting**, not a hang. Pre-warm one
  session before demoing.
- If the agent answers well but `tool_uses[]` shows nothing touching memory, it
  answered from the documents in the same turn. Reorder the prompt so the
  `ls -R /mnt/memory/` comes first, and re-measure.

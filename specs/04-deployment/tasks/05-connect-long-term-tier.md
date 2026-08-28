# Task 05 — Connect the agent to the long-term tier

**Goal:** let the agent read and write the tenant-scoped ChromaDB tier, so a
consolidation turn promotes facts into it. Today nothing does — this is the gap
described in [`../TEAM-NOTES.md`](../TEAM-NOTES.md).

**Depends on:** [02](02-run-backend.md) · **Time:** ~45 min · **Needs a live `ANTHROPIC_API_KEY`:** yes
**Files:** `create_agent_v2.py` (prompt + tools), `create_vault_v2.py` (new). **Do not touch** `backend/`.

---

## Why it is shaped this way

The agent runs in Anthropic's infrastructure; the backend listens on our laptop.
For the agent to call `/memory/*`, the backend needs an address reachable from
the internet, and the agent needs a key.

Two options were considered:

- **Custom tools** (`type: "custom"`), executed by whatever client is streaming
  the session. Rejected: a scheduled deployment fires with no client attached,
  so the agent would hang forever. It also puts the tool call outside the
  backend's own auth path.
- **`bash` + `curl` from inside the sandbox**, with the key supplied by an
  Anthropic vault. Chosen: works in a cron-fired session, and the sandbox never
  sees the real key — a vault `environment_variable` credential shows an opaque
  placeholder and the secret is substituted at egress, only for our host.

---

## Steps

### 1. Expose the backend

```bash
cloudflared tunnel --url http://localhost:8010
echo "https://<the-printed-host>" > .memory_service_url    # git-ignored, no trailing slash
```

Keep the process alive: a quick tunnel gets a new hostname on every restart, and
the vault credential is pinned to the host.

### 2. Put `BACKEND_API_KEY` in a vault

`create_vault_v2.py`: create a vault, then a credential

```python
auth={
    "type": "environment_variable",
    "secret_name": "BACKEND_API_KEY",
    "secret_value": os.environ["BACKEND_API_KEY"],
    "networking": {"type": "limited", "allowed_hosts": [host]},
    "injection_location": {"header": True},
}
```

Make it idempotent: the secret name is unique per vault (409 on a duplicate), so
list credentials, archive the one with that `secret_name`, then create the new
one. That is also the recovery path when the tunnel host changes.

Confirm the SDK signatures before writing it — do not guess:

```bash
.venv/bin/python -c "import anthropic, inspect; c=anthropic.Anthropic(api_key='x'); \
print(inspect.signature(c.beta.vaults.create)); \
print(inspect.signature(c.beta.vaults.credentials.create))"
```

### 3. Give the agent the two tools, in the system prompt

The agent reaches them with `curl`; there is no tool schema to declare. Add to
`create_agent_v2.py`'s prompt, with `<BASE_URL>` supplied in each session's
first message (never baked into the prompt — the tunnel host changes):

```
SEARCH the company's long-term memory before answering anything about this
company, its people or its policies:

    curl -s -G "<BASE_URL>/memory/search" \
      -H "X-API-Key: $BACKEND_API_KEY" \
      --data-urlencode "tenant_id=<tenant>" \
      --data-urlencode "q=<query>" -d "k=5"

PROMOTE a durable fact to it, on a CONSOLIDATE turn:

    curl -s -X POST "<BASE_URL>/memory" \
      -H "content-type: application/json" -H "X-API-Key: $BACKEND_API_KEY" \
      -d '{"tenant_id":"<tenant>","text":"<one fact>","metadata":{"kind":"fact"}}'
```

Check the exact request and response shapes against
`backend/app/routers/memory.py` and `backend/app/schemas.py` before writing the
prompt. `tenant_id` is required on every `/memory` route and is the isolation
boundary. Do not invent field names.

### 4. Attach the vault at session creation

`vault_ids` is **create-only** — it cannot be added to a running session. The
backend's `agents.create_session()` does not pass it, so either it grows the
parameter (a Spec 2 change — ask, do not edit `backend/`) or task 05's proof
runs through a small script of our own that creates the session directly.
Decide, write down which, and say why.

---

## How to verify

1. `curl "$(cat .memory_service_url)/healthz"` answers from a phone on mobile
   data — proves the tunnel, not just localhost.
2. A consolidation turn produces a `POST /memory` in the backend's log, and
   `GET /memory?tenant_id=…` then returns the fact.
3. `GET /memory/search` with a differently-worded query returns it — that is the
   semantic tier earning its place over the file store.
4. Ask the agent to `echo $BACKEND_API_KEY`. What comes back must **not** be the
   real key.

## Done when

- [ ] A fact stated in conversation lands in Chroma through the agent's own tool
      call, with no human curl
- [ ] It comes back on a search phrased differently
- [ ] The key is not readable inside the sandbox
- [ ] The tunnel URL and vault ID are git-ignored, and no key is in the repo

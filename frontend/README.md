# Frontend — Streamlit tier tester

The simplest possible UI for click-testing the backend's three tiers instead
of curl/Postman: short-term session chat, Tier-3 growing document sets,
the ChromaDB long-term tier, and the Tier-1 curator.

Not a product UI — see `../BRIEF.md` for why Streamlit and not React here.
It's a thin `requests` wrapper: every button is one HTTP call to `backend/`,
and every response is dumped as raw JSON so you can see exactly what the API
returned.

## Run it

```bash
# backend/, in a separate terminal:
cd ../backend && uvicorn app.main:app --reload

# frontend/, here:
pip install -r requirements.txt
streamlit run app.py
```

Opens at http://localhost:8501. Fill in the backend URL and `X-API-Key` in
the sidebar (matches whatever `BACKEND_API_KEY` the backend was started
with) — nothing works until both are set correctly.

## What's on each tab

- **Session & Chat** — creates a session for `customer_id` (sidebar), sends
  messages, and can list what the agent has written to its own native
  memory store (`GET /memory?source=agent`).
- **Documents (Tier 3)** — attaches documents to the active session via the
  Files API. Attach a batch, send a message, attach another batch — every
  message from then on references the whole accumulated set.
- **Long-term Memory** — write/search/list/delete against the Chroma tier,
  scoped by `tenant_id` (sidebar).
- **Curator (Tier 1)** — runs one curation pass over `tenant_id`'s Chroma
  memories. Write a couple of overlapping or contradicting memories in the
  Long-term Memory tab first; the curator has nothing to do over 0 or 1
  memory.

## Known limits

- No error handling beyond showing the raw HTTP status/JSON — this is a
  testing tool, not a hardened client.
- `session_id`/document rows live in `st.session_state`, so a browser
  refresh loses them (the backend session itself is unaffected).
- Same trust-boundary caveat as the backend: `customer_id` and `tenant_id`
  are plain text fields here, exactly as caller-supplied as they are over
  the API (see `backend/README.md`'s Auth section).

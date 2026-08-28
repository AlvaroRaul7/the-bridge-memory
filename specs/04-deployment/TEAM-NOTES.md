# Team notes — Spec 4

Esteban · deployment on Managed Agents

Written against `c6d4a76`. One finding that needs a decision, one thing the
merge left behind, and one note for Spec 3.

---

## Message ready to paste into chat

> Read the two-tier backend after #6 and #7 landed. It's good, and it makes the
> architecture concrete: `/session` over the agent's native `/mnt/memory/`, and
> `/memory` over the tenant-scoped Chroma tier. One gap though, and it's the
> important one:
>
> **Nothing writes to the long-term tier except a human with curl.**
> `agents.py` doesn't import `memory_engine`, and the agent can't call
> `/memory/*` because it runs on Anthropic's servers, not ours. So the Chroma
> tier is a database nobody fills — and the "promotion moment", the thing that
> makes the demo more than a chatbot with a notepad, has no mechanism behind it.
>
> That's exactly the gap Spec 4 was written to close, so I'm taking it: give the
> agent two tools, `search_memory` → `GET /memory/search` and `write_memory` →
> `POST /memory`, so a consolidation turn promotes facts into Chroma. Plan is in
> `specs/04-deployment/tasks/05-connect-long-term-tier.md`. It needs the backend
> reachable from the internet (the agent's sandbox is outside our network), which
> is a `cloudflared` tunnel and a key in an Anthropic vault — no change to
> `backend/`.
>
> Two smaller things: **`BRIEF.md` was deleted in `966eee7`** while `CLAUDE.md`
> still tells people to read it before touching the memory layer — deliberate, or
> a rebase accident? And **Spec 3: the API you code against is
> `backend/README.md`**; note `/session/{id}/message` blocks for the whole agent
> turn (tens of seconds, put a spinner on it) and every response carries
> `tool_uses[]` with `touched_memory` — that's your "what did it remember this
> turn" panel, for free.

---

## Detail, in case anyone asks

### The gap, precisely

Checked on `c6d4a76`: the only callers of `memory_engine.write_memory` are
`backend/app/routers/memory.py` and the tests. `backend/app/agents.py` imports
`anthropic` and `schemas` and nothing else. The agent's session container has no
route to `/memory/*` — it runs in Anthropic's infrastructure and the backend
listens on a laptop.

So today a fact reaches long-term memory only if a person, or Spec 3's UI, posts
it. That is a legitimate design — but it means the agent is not the one deciding
what deserves to be remembered, which is the sentence the whole pitch rests on.

### Why the agent calls out rather than the backend calling in

Only one of the two can initiate. The backend already calls the agent for chat;
having it also *extract* memories after each turn would mean a second model call
per turn and a judgement made outside the agent's own reasoning. Giving the agent
the tools keeps the decision where the demo says it is, and costs one tunnel.

### What has not changed

**Managed Agents deploys agents, not web apps.** `backend/` and Spec 3's
frontend run on a host of ours; the agent's container is per-session, ephemeral,
and has no public ingress. Chroma Cloud is hosted, so it is not affected either
way.

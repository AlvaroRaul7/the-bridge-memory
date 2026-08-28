# Team notes — after the Spec 2 backend merge

Esteban · deployment on Managed Agents

Three things worth saying now that `5067e32` is on `main`. The first two are
repo hygiene, the third decides whether a whole workstream is alive or dead.

---

## Message ready to paste into chat

> Read the merged backend — it's good, and it settles the architecture argument
> by itself: it's a proxy over Managed Agents using the **native** memory store
> (`/mnt/memory/`), with no vector store and no `memory_engine` import. I'm
> re-pointing Spec 4 at that and I'm not building the Chroma integration.
> Three things though:
>
> **1. `BRIEF.md` was deleted in that commit** (`966eee7`). Deliberate or a
> rebase accident? `CLAUDE.md` still tells people to read it before touching the
> memory layer, so right now that pointer is broken. If it was accidental:
> `git show f5022b8:BRIEF.md > BRIEF.md`. If it was deliberate, I'll fix the
> `CLAUDE.md` reference instead — just tell me which.
>
> **2. `feature/memory-engine-chromadb` is orphaned.** Spec 1's engine is one
> unmerged commit and nothing on `main` imports it. Either it lands and the
> backend grows a second memory path, or we call it out of scope now and stop
> spending time on it. My vote: out of scope — the merged design is simpler and
> already tested.
>
> **3. Spec 3: the API you're coding against is `backend/README.md`**, not
> anything in `specs/`. `POST /session`, `POST /session/{id}/message`,
> `GET /memory`. Two things to know: `/message` blocks for the whole agent turn
> (tens of seconds — put a spinner on it), and each response carries
> `tool_uses[]` with `touched_memory: true` on the calls that hit the store.
> That flag is your "what did it remember this turn" panel, for free.
>
> I need one thing from whoever owns the backend: it reads `AGENT_ID` /
> `ENVIRONMENT_ID` / `MEMORY_STORE_ID` from env, falling back to the dotfiles.
> I'm provisioning a v2 agent on `claude-opus-5` with a better memory prompt and
> writing `.agent_id_v2` etc., so the backend gets pointed at it with env vars.
> Nothing in `backend/` changes.

---

## Detail, in case anyone asks

### Why I dropped the ChromaDB integration from Spec 4

Spec 4 was written as "make the Managed Agent call Spec 2's FastAPI as its
memory backend". The merged backend is the opposite: it calls the agent, and the
agent's memory is the platform's own mounted store. Building the Chroma path on
top would give the agent two places to write and nobody would be able to say, on
stage, where a given fact ended up. One source of truth is worth more than one
extra buzzword in the pitch.

What Spec 4 still owns, unchanged: provisioning the agent the backend talks to,
where each piece runs, what secrets it needs, and proving the whole thing works
end to end.

### What did not change

The deployment constraint is the same as it always was: **Managed Agents deploys
agents, not web apps**. `backend/` and Spec 3's frontend run on a host of ours.
The container Anthropic gives us is per-session and ephemeral, with no public
ingress.

### A risk that is now smaller

Memory is hosted by Anthropic again, not by us. If our backend dies mid-demo,
the memory survives and we can fall back to `run_session_1.py`. That is a better
position than the one the Chroma design put us in.

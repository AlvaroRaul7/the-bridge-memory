"""Minimal Streamlit UI over backend/ — one tab per tier we built.

Not a real UI (see BRIEF.md's "refuse this" list for why not React/shadcn
here) — it's a thin `requests` wrapper around the FastAPI service so the
three tiers are click-testable instead of curl-testable:

- Session & Chat  — short-term memory (native /mnt/memory/), Tier-3
  per-customer store.
- Documents       — Tier-3 growing document sets via the Files API.
- Long-term Memory — the ChromaDB tier (write/search/list/delete).
- Curator         — Tier-1 memory curator over the Chroma tier.

Run it:
    pip install -r requirements.txt
    streamlit run app.py
"""

from __future__ import annotations

import json

import requests
import streamlit as st

st.set_page_config(page_title="Institutional Memory — tier tester", layout="wide")


def api(method: str, path: str, **kwargs) -> requests.Response:
    headers = {"X-API-Key": st.session_state.api_key}
    return requests.request(
        method, f"{st.session_state.base_url}{path}", headers=headers, timeout=60, **kwargs
    )


def show_response(response: requests.Response) -> None:
    if response.ok:
        st.success(f"{response.status_code}")
    else:
        st.error(f"{response.status_code}")
    try:
        st.json(response.json())
    except ValueError:
        st.code(response.text)


# --- sidebar: shared connection + identity fields ---------------------------

with st.sidebar:
    st.header("Connection")
    st.session_state.setdefault("base_url", "http://127.0.0.1:8000")
    st.session_state.setdefault("api_key", "")
    st.session_state.base_url = st.text_input("Backend URL", st.session_state.base_url)
    st.session_state.api_key = st.text_input(
        "X-API-Key", st.session_state.api_key, type="password"
    )

    st.divider()
    st.header("Identity")
    st.session_state.setdefault("customer_id", "demo-customer")
    st.session_state.setdefault("tenant_id", "demo-tenant")
    st.session_state.customer_id = st.text_input(
        "customer_id", st.session_state.customer_id, help="Scopes the native /session store."
    )
    st.session_state.tenant_id = st.text_input(
        "tenant_id", st.session_state.tenant_id, help="Scopes the Chroma /memory tier."
    )

    if st.button("Check /healthz"):
        try:
            r = requests.get(f"{st.session_state.base_url}/healthz", timeout=10)
            st.success(r.json()) if r.ok else st.error(r.text)
        except requests.RequestException as e:
            st.error(str(e))


tab_session, tab_documents, tab_memory, tab_curator = st.tabs(
    ["Session & Chat", "Documents (Tier 3)", "Long-term Memory", "Curator (Tier 1)"]
)


# --- Session & Chat: short-term memory + Tier-3 per-customer store ---------

with tab_session:
    st.subheader("Session & Chat")
    st.caption(
        "Short-term memory is the Managed Agent session itself. `customer_id` "
        "(sidebar) picks which native memory store gets mounted — same "
        "customer_id always gets the same store back."
    )

    st.session_state.setdefault("session_id", None)

    col1, col2 = st.columns(2)
    with col1:
        title = st.text_input("Session title (optional)", "")
        if st.button("Create session", type="primary"):
            r = api(
                "POST",
                "/session",
                json={"customer_id": st.session_state.customer_id, "title": title or None},
            )
            if r.ok:
                st.session_state.session_id = r.json()["id"]
            show_response(r)

    with col2:
        st.text_input("Current session_id", st.session_state.session_id or "", disabled=True)
        if st.session_state.session_id and st.button("Refresh session status"):
            r = api(
                "GET",
                f"/session/{st.session_state.session_id}",
                params={"customer_id": st.session_state.customer_id},
            )
            show_response(r)

    st.divider()

    message = st.text_area("Message to the agent", "")
    if st.button("Send message", disabled=not st.session_state.session_id):
        r = api(
            "POST",
            f"/session/{st.session_state.session_id}/message",
            json={"text": message},
        )
        show_response(r)

    st.divider()
    with st.expander("What has the agent remembered? (native store, source=agent)"):
        if st.button("List agent memory"):
            r = api("GET", "/memory", params={"customer_id": st.session_state.customer_id})
            show_response(r)


# --- Documents: Tier-3 growing document sets --------------------------------

with tab_documents:
    st.subheader("Documents — growing sets via the Files API")
    st.caption(
        "Uploads accumulate per session: attach a batch, send a message, "
        "attach another batch, and every message from here on references "
        "the whole growing set. Needs an active session (see the first tab)."
    )

    st.session_state.setdefault("doc_rows", [{"filename": "note1.md", "content": ""}])

    for i, row in enumerate(st.session_state.doc_rows):
        c1, c2 = st.columns([1, 3])
        row["filename"] = c1.text_input("filename", row["filename"], key=f"fn_{i}")
        row["content"] = c2.text_area("content", row["content"], key=f"ct_{i}", height=80)

    c1, c2 = st.columns(2)
    if c1.button("+ add another document"):
        st.session_state.doc_rows.append({"filename": "", "content": ""})
        st.rerun()

    if c2.button(
        "Attach documents to session", type="primary", disabled=not st.session_state.session_id
    ):
        docs = [row for row in st.session_state.doc_rows if row["filename"] and row["content"]]
        r = api(
            "POST",
            f"/session/{st.session_state.session_id}/documents",
            json={"documents": docs},
        )
        show_response(r)


# --- Long-term Memory: ChromaDB tier -----------------------------------------

with tab_memory:
    st.subheader("Long-term memory (ChromaDB)")
    st.caption("Scoped by tenant_id (sidebar) — separate from the native store above.")

    write_col, search_col = st.columns(2)

    with write_col:
        st.markdown("**Write a memory**")
        text = st.text_area("text", "", key="write_text")
        metadata_raw = st.text_input("metadata (JSON, optional)", "{}", key="write_meta")
        if st.button("Write memory"):
            try:
                metadata = json.loads(metadata_raw or "{}")
            except json.JSONDecodeError as e:
                st.error(f"Invalid JSON: {e}")
            else:
                r = api(
                    "POST",
                    "/memory",
                    json={
                        "tenant_id": st.session_state.tenant_id,
                        "text": text,
                        "metadata": metadata,
                    },
                )
                show_response(r)

    with search_col:
        st.markdown("**Semantic search**")
        query = st.text_input("query", "", key="search_q")
        k = st.number_input("k", min_value=1, max_value=50, value=5)
        if st.button("Search"):
            r = api(
                "GET",
                "/memory/search",
                params={"tenant_id": st.session_state.tenant_id, "q": query, "k": k},
            )
            show_response(r)

    st.divider()

    list_col, delete_col = st.columns(2)
    with list_col:
        st.markdown("**List all**")
        if st.button("List Chroma memories"):
            r = api(
                "GET",
                "/memory",
                params={"source": "chroma", "tenant_id": st.session_state.tenant_id},
            )
            show_response(r)

    with delete_col:
        st.markdown("**Delete by id**")
        memory_id = st.text_input("memory id", "", key="delete_id")
        if st.button("Delete"):
            r = api(
                "DELETE",
                f"/memory/{memory_id}",
                params={"source": "chroma", "tenant_id": st.session_state.tenant_id},
            )
            show_response(r)


# --- Curator: Tier-1 stretch goal --------------------------------------------

with tab_curator:
    st.subheader("Curator (Tier 1)")
    st.caption(
        "Runs over the Chroma tenant's memories: merges duplicates, flags "
        "contradictions (never auto-deleted), prunes stale entries. Write a "
        "few overlapping memories in the Long-term Memory tab first, "
        "otherwise there's nothing to curate."
    )

    if st.button("Run curation", type="primary"):
        r = api("POST", "/memory/curate", json={"tenant_id": st.session_state.tenant_id})
        show_response(r)

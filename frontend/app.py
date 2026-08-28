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

Every interactive widget has an explicit `key=` — not needed for the app
itself, but it's what lets tests/ address them reliably with
streamlit.testing.v1.AppTest instead of guessing at auto-generated keys.
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


def stream_agent_reply(session_id: str, text: str):
    """Generator of text fragments for st.write_stream, consuming the
    backend's SSE endpoint. Stashes stop_reason/tool_uses/errors onto
    session_state under stream_* keys since a generator can't return them
    alongside the yielded text."""
    st.session_state.stream_stop_reason = None
    st.session_state.stream_tool_uses = []
    st.session_state.stream_error = None

    with requests.post(
        f"{st.session_state.base_url}/session/{session_id}/message/stream",
        headers={"X-API-Key": st.session_state.api_key},
        json={"text": text},
        stream=True,
        timeout=(10, 600),
    ) as response:
        if not response.ok:
            response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            chunk = json.loads(line[len("data: ") :])
            if chunk["type"] == "text":
                yield chunk["text"]
            elif chunk["type"] == "done":
                st.session_state.stream_stop_reason = chunk["stop_reason"]
                st.session_state.stream_tool_uses = chunk["tool_uses"]
            elif chunk["type"] == "error":
                st.session_state.stream_error = chunk["message"]


# --- sidebar: shared connection + identity fields ---------------------------

with st.sidebar:
    st.header("Connection")
    st.session_state.setdefault("base_url", "http://127.0.0.1:8000")
    st.session_state.setdefault("api_key", "")
    st.session_state.base_url = st.text_input(
        "Backend URL", st.session_state.base_url, key="base_url_input"
    )
    st.session_state.api_key = st.text_input(
        "X-API-Key", st.session_state.api_key, type="password", key="api_key_input"
    )

    st.divider()
    st.header("Identity")
    st.session_state.setdefault("customer_id", "demo-customer")
    st.session_state.setdefault("tenant_id", "demo-tenant")
    st.session_state.customer_id = st.text_input(
        "customer_id",
        st.session_state.customer_id,
        help="Scopes the native /session store.",
        key="customer_id_input",
    )
    st.session_state.tenant_id = st.text_input(
        "tenant_id",
        st.session_state.tenant_id,
        help="Scopes the Chroma /memory tier.",
        key="tenant_id_input",
    )

    if st.button("Check /healthz", key="btn_healthz"):
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
    st.session_state.setdefault("chat_history", [])

    col1, col2 = st.columns(2)
    with col1:
        title = st.text_input("Session title (optional)", "", key="session_title")
        if st.button("Create session", type="primary", key="btn_create_session"):
            r = api(
                "POST",
                "/session",
                json={"customer_id": st.session_state.customer_id, "title": title or None},
            )
            if r.ok:
                st.session_state.session_id = r.json()["id"]
                st.session_state.chat_history = []
            show_response(r)

    with col2:
        st.text_input(
            "Current session_id",
            st.session_state.session_id or "",
            disabled=True,
            key="session_id_display",
        )
        if st.session_state.session_id and st.button(
            "Refresh session status", key="btn_refresh_session"
        ):
            r = api(
                "GET",
                f"/session/{st.session_state.session_id}",
                params={"customer_id": st.session_state.customer_id},
            )
            show_response(r)

    st.divider()

    for turn in st.session_state.chat_history:
        with st.chat_message(turn["role"]):
            st.markdown(turn["content"])

    user_message = st.chat_input(
        "Message to the agent",
        disabled=not st.session_state.session_id,
        key="chat_input_message",
    )
    if user_message:
        st.session_state.chat_history.append({"role": "user", "content": user_message})
        with st.chat_message("user"):
            st.markdown(user_message)

        with st.chat_message("assistant"):
            try:
                full_reply = st.write_stream(
                    stream_agent_reply(st.session_state.session_id, user_message)
                )
            except requests.RequestException as e:
                full_reply = ""
                st.error(f"Request failed: {e}")
            else:
                if st.session_state.stream_error:
                    st.error(st.session_state.stream_error)
                stop_reason = st.session_state.stream_stop_reason
                tool_uses = st.session_state.stream_tool_uses
                caption_bits = []
                if stop_reason and stop_reason != "end_turn":
                    caption_bits.append(f"stop_reason: {stop_reason}")
                if tool_uses:
                    caption_bits.append(f"{len(tool_uses)} tool call(s)")
                if caption_bits:
                    st.caption(" · ".join(caption_bits))

        st.session_state.chat_history.append({"role": "assistant", "content": full_reply})

    st.divider()
    with st.expander("What has the agent remembered? (native store, source=agent)"):
        if st.button("List agent memory", key="btn_list_agent_memory"):
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
    if c1.button("+ add another document", key="btn_add_doc_row"):
        st.session_state.doc_rows.append({"filename": "", "content": ""})
        st.rerun()

    if c2.button(
        "Attach documents to session",
        type="primary",
        disabled=not st.session_state.session_id,
        key="btn_attach_documents",
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
        if st.button("Write memory", key="btn_write_memory"):
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
        k = st.number_input("k", min_value=1, max_value=50, value=5, key="search_k")
        if st.button("Search", key="btn_search_memory"):
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
        if st.button("List Chroma memories", key="btn_list_chroma"):
            r = api(
                "GET",
                "/memory",
                params={"source": "chroma", "tenant_id": st.session_state.tenant_id},
            )
            show_response(r)

    with delete_col:
        st.markdown("**Delete by id**")
        memory_id = st.text_input("memory id", "", key="delete_id")
        if st.button("Delete", key="btn_delete_memory"):
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

    if st.button("Run curation", type="primary", key="btn_run_curation"):
        r = api("POST", "/memory/curate", json={"tenant_id": st.session_state.tenant_id})
        show_response(r)

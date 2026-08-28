"""Teach a customer's agents what the scenario documents say.

A freshly provisioned module answers every question with "my memory store is
empty" — correctly, because nothing has ever put anything in it. This runs the
round-1 (and optionally round-2) documents through a real session so the agent
reads them and writes what matters to /mnt/memory/.

Why not run_session_1.py: that script mounts the *scenario's* store from
.state/, while the API mounts a store scoped to (customer, module). Seeding
through the API is the only way to fill the store the UI actually reads.

    # the customer_id the UI sends is your signed-in user id
    python backend/seed_memory.py --customer user_3IYt... --all
    python backend/seed_memory.py --customer demo --module card-a-onboarding
    python backend/seed_memory.py --customer demo --all --round 2

Round 2 is the demo's second half: documents that contradict round 1, so the
agent has to reconcile rather than accumulate. Seed round 1, ask the question,
then seed round 2 and ask again.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv
import os

REPO_ROOT = Path(__file__).resolve().parents[1]

ROUND1_FRAMING = (
    "These are our source documents. Please:\n"
    "1. First, check your memory store at /mnt/memory/ to see what you have "
    "learned in previous sessions.\n"
    "2. Then read the attached documents.\n"
    "3. Then answer the question.\n"
    "4. Before you finish, save anything worth remembering to /mnt/memory/ — "
    "durable facts, policies, owners and decisions, not this conversation.\n\n"
)

ROUND2_FRAMING = (
    "These are updated and new documents. Some of them contradict what you "
    "learned before.\n\n"
    "Please:\n"
    "1. First, check /mnt/memory/ for what you already know.\n"
    "2. Read the attached documents and note where they conflict with it.\n"
    "3. Answer the question using the CURRENT position.\n"
    "4. Update /mnt/memory/ so the superseded facts are corrected, not merely "
    "appended to. Say what changed and when it changed.\n\n"
)


def load_env() -> None:
    for path in (
        REPO_ROOT / ".env",
        REPO_ROOT / ".env_backend",
        REPO_ROOT / "frontend" / ".env_backend",
    ):
        if path.exists():
            load_dotenv(path, override=True)


def call(method: str, path: str, base: str, key: str, body: dict | None = None,
         timeout: float = 400.0) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{base.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={"X-API-Key": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read() or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:400]
        raise SystemExit(f"{method} {path} failed: {exc.code} {detail}")
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Could not reach the backend at {base}: {exc.reason}\n"
            "Start it with: python backend/run_local.py"
        )


def read_round(scenario: dict, round_number: int) -> list[dict]:
    docs_dir = REPO_ROOT / scenario["docsDir"] / f"round{round_number}"
    if not docs_dir.is_dir():
        raise SystemExit(f"No documents at {docs_dir}")

    documents = []
    for path in sorted(docs_dir.glob("*.md")):
        documents.append(
            {
                "filename": path.name,
                "content": path.read_text(),
                # text/plain, not text/markdown — the Files API sniffs the
                # bytes and rejects .md uploaded under a markdown type.
                "media_type": "text/plain",
            }
        )
    if not documents:
        raise SystemExit(f"No .md files in {docs_dir}")
    return documents


def seed(scenario: dict, customer: str, round_number: int, base: str, key: str) -> bool:
    module_id = scenario["id"]
    print(f"\n=== {module_id} — round {round_number} ===")

    session = call(
        "POST", "/session", base, key,
        {
            "customer_id": customer,
            "module": module_id,
            "title": f"Seed round {round_number} — {scenario['shortName']}",
        },
    )
    print(f"  session {session['id']}  ->  store {session['memory_store_id']}")

    documents = read_round(scenario, round_number)
    attached = call(
        "POST", f"/session/{session['id']}/documents", base, key,
        {"documents": documents},
    )
    print(f"  attached {len(documents)} docs ({attached['total_files']} total): "
          + ", ".join(d["filename"] for d in documents))

    framing = ROUND1_FRAMING if round_number == 1 else ROUND2_FRAMING
    prompt = f"{framing}QUESTION: {scenario['testQuestion']}"

    print("  running the turn (this takes 30-90s)...", flush=True)
    started = time.monotonic()
    reply = call("POST", f"/session/{session['id']}/message", base, key,
                 {"text": prompt})
    elapsed = time.monotonic() - started

    wrote = [t for t in reply["tool_uses"] if t.get("touched_memory")]
    print(f"  {reply['stop_reason']} in {elapsed:.0f}s, "
          f"{len(reply['tool_uses'])} tool calls, {len(wrote)} touching memory")

    listing = call(
        "GET",
        f"/memory?source=agent&customer_id={customer}&module={module_id}",
        base, key,
    )
    files = listing["memories"]
    print(f"  memory now holds {len(files)} file(s):")
    for record in files:
        print(f"    {record['path']}")

    if not files:
        print("  WARNING: the agent wrote nothing. Its answer began:")
        print("    " + reply["text"][:200].replace("\n", " "))
    return bool(files)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--customer", required=True,
                        help="Same customer_id the UI sends (your signed-in user id).")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--module", help="One module id, e.g. card-a-onboarding.")
    group.add_argument("--all", action="store_true", help="Every module.")
    parser.add_argument("--round", type=int, default=1, choices=(1, 2),
                        help="Which document round to teach. Default 1.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    load_env()
    key = os.environ.get("BACKEND_API_KEY", "").strip()
    if not key:
        raise SystemExit("BACKEND_API_KEY is not set — check .env.")

    registry = json.loads((REPO_ROOT / "scenarios.json").read_text())["scenarios"]
    if args.all:
        chosen = registry
    else:
        chosen = [s for s in registry if s["id"] == args.module]
        if not chosen:
            raise SystemExit(
                f"Unknown module {args.module!r}. Known: "
                + ", ".join(s["id"] for s in registry)
            )

    results = {
        s["id"]: seed(s, args.customer, args.round, args.base_url, key)
        for s in chosen
    }

    print(f"\n=== seeded round {args.round} for customer {args.customer} ===")
    for module_id, ok in results.items():
        print(f"  {'OK  ' if ok else 'EMPTY'} {module_id}")
    if not all(results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()

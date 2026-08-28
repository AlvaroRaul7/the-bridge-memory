"""Run the API locally with this checkout's environment files.

Loads, in increasing precedence:

    .env             repo-root config (see .env.example)
    .env_backend     backend-only overrides, repo root
    frontend/.env_backend

The last of these is where the Managed Agents resource IDs (AGENT_ID,
ENVIRONMENT_ID, MEMORY_STORE_ID) are kept in this checkout. `app.config` reads
plain os.environ and does not load any file itself, so something has to put
them there before the app is imported — that is all this script does.

    python backend/run_local.py            # from the repo root
    uvicorn app.main:app --reload          # from backend/, if your env is already exported
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]

# Later files win, so the more specific file overrides the general one.
ENV_FILES = (
    REPO_ROOT / ".env",
    REPO_ROOT / ".env_backend",
    REPO_ROOT / "frontend" / ".env_backend",
)


def main() -> None:
    loaded = []
    for path in ENV_FILES:
        if path.exists():
            load_dotenv(path, override=True)
            loaded.append(path.relative_to(REPO_ROOT))

    if not loaded:
        sys.exit(
            "No environment file found. Copy .env.example to .env and fill it in."
        )

    print("Loaded env from: " + ", ".join(str(p) for p in loaded))

    missing = [
        name
        for name in ("ANTHROPIC_API_KEY", "BACKEND_API_KEY")
        if not os.environ.get(name, "").strip()
    ]
    if missing:
        sys.exit(f"Missing required config: {', '.join(missing)}")

    for name in ("AGENT_ID", "ENVIRONMENT_ID", "MEMORY_STORE_ID"):
        value = os.environ.get(name, "").strip()
        if not value or "PLACEHOLDER" in value:
            # Not fatal: /healthz and every /memory route work without them.
            # Only /session and /session/{id}/message need real ids.
            print(f"  warning: {name} is not a real resource id — /session will fail")

    # Imported after the environment is populated; app.config reads it eagerly.
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        reload="--reload" in sys.argv,
        log_level="info",
    )


if __name__ == "__main__":
    main()

"""Put the repo root on sys.path so `memory_engine` (a sibling of backend/,
not a package under it) is importable regardless of cwd — whether this is
run via `uvicorn app.main:app` from backend/, or via pytest.
"""

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

"""Provision one Managed Agent per module.

    python backend/provision.py --all
    python backend/provision.py --module card-b-customer-success
    python backend/provision.py --all --force     # re-create, ignoring .state/

Reads the same environment files as run_local.py. Ids land in
`.state/<module>/`, which is gitignored — provisioning creates billable cloud
resources, so it is never run implicitly by the service.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

for env_file in (
    REPO_ROOT / ".env",
    REPO_ROOT / ".env_backend",
    REPO_ROOT / "frontend" / ".env_backend",
):
    if env_file.exists():
        load_dotenv(env_file, override=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--module", help="Module id to provision.")
    parser.add_argument("--all", action="store_true", help="Provision every module.")
    parser.add_argument(
        "--force", action="store_true", help="Re-create even if ids already exist."
    )
    args = parser.parse_args()

    if not args.all and not args.module:
        parser.error("pass --all or --module <id>")
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        sys.exit("ANTHROPIC_API_KEY is not set.")

    from anthropic import Anthropic

    from app.modules import all_modules
    from app.provisioning import MODEL, provision_all, provision_module

    client = Anthropic()
    print(f"Model: {MODEL}")

    results = (
        provision_all(client, force=args.force)
        if args.all
        else [provision_module(client, args.module, force=args.force)]
    )

    for result in results:
        state = "created" if result.created else "already provisioned, skipped"
        print(f"\n{result.module_id} — {state}")
        print(f"  agent:        {result.resources.agent_id}")
        print(f"  environment:  {result.resources.environment_id}")
        print(f"  memory store: {result.resources.memory_store_id}")

    print(f"\n{len(all_modules())} modules known. Ids written to .state/<module>/.")
    print("Restart the service to pick them up:  python backend/run_local.py")


if __name__ == "__main__":
    main()

"""Settings and Managed Agents resource-ID resolution.

Resource IDs come from the environment, falling back to the dotfiles that
create_agent.py writes into the repo root, so a local run needs no setup at all.
Environment wins, so a deployment can point at different resources without
touching the checkout.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

# backend/app/config.py -> backend/app -> backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_CORS_ORIGINS = ("http://localhost:5173",)


class ConfigError(RuntimeError):
    """Raised at startup when required configuration is missing."""


def _resource_id(env_var: str, id_file: str) -> str:
    value = os.environ.get(env_var, "").strip()
    if value:
        return value

    path = REPO_ROOT / id_file
    if path.exists():
        value = path.read_text().strip()
        if value:
            return value

    raise ConfigError(
        f"{env_var} is not set and {path} is missing or empty. "
        f"Either export {env_var}, or run create_agent.py to provision the "
        f"resources and write {id_file}."
    )


@dataclass(frozen=True)
class Settings:
    agent_id: str
    environment_id: str
    backend_api_key: str
    cors_origins: tuple[str, ...]
    agent_timeout_seconds: float

    @classmethod
    def from_env(cls) -> "Settings":
        backend_api_key = os.environ.get("BACKEND_API_KEY", "").strip()
        if not backend_api_key:
            raise ConfigError(
                "BACKEND_API_KEY is not set. The service refuses to start "
                "without one so it is never accidentally exposed unauthenticated."
            )

        raw_origins = os.environ.get("CORS_ORIGINS", "").strip()
        origins = (
            tuple(o.strip() for o in raw_origins.split(",") if o.strip())
            if raw_origins
            else DEFAULT_CORS_ORIGINS
        )

        return cls(
            agent_id=_resource_id("AGENT_ID", ".agent_id"),
            environment_id=_resource_id("ENVIRONMENT_ID", ".environment_id"),
            backend_api_key=backend_api_key,
            cors_origins=origins,
            agent_timeout_seconds=float(
                os.environ.get("AGENT_TIMEOUT_SECONDS", "300")
            ),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()

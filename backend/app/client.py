"""Anthropic client singleton.

Constructed lazily so /healthz answers even when ANTHROPIC_API_KEY is absent —
a liveness probe should not depend on a credential.
"""

from __future__ import annotations

from functools import lru_cache

from anthropic import Anthropic


@lru_cache(maxsize=1)
def get_client() -> Anthropic:
    # Reads ANTHROPIC_API_KEY (or an `ant auth login` profile) from the env.
    return Anthropic()

"""Shared FastAPI dependencies."""

from __future__ import annotations

import secrets

from fastapi import Depends, Header, HTTPException, status

from .client import get_client
from .config import Settings, get_settings

__all__ = ["get_client", "get_settings", "require_api_key"]


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    """Guard every route except /healthz.

    compare_digest rather than `==` so a wrong key cannot be recovered by
    timing the comparison.
    """
    if x_api_key is None or not secrets.compare_digest(
        x_api_key, settings.backend_api_key
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-API-Key.",
        )

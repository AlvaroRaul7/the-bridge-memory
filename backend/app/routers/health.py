"""Liveness probe. No auth, no upstream call — Spec 4's deployment needs it."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import Health

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=Health)
def healthz() -> Health:
    return Health()

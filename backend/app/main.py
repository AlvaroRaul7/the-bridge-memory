"""FastAPI application — a thin wrapper around Anthropic Managed Agents.

Run it:
    uvicorn app.main:app --reload      # from backend/
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .errors import register_exception_handlers
from .routers import health, memory, session


def create_app() -> FastAPI:
    app = FastAPI(
        title="Institutional Memory API",
        description=(
            "HTTP wrapper around an Anthropic Managed Agent: open a session "
            "with the long-term memory store mounted, talk to it, and read "
            "back what it chose to remember."
        ),
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(get_settings().cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(session.router)
    app.include_router(memory.router)

    return app


app = create_app()

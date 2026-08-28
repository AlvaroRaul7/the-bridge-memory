"""Translation from upstream/SDK failures into HTTP responses.

Two rules here:

1. No SDK error text is forwarded verbatim. Anthropic's messages can carry
   request details, and ANTHROPIC_API_KEY must never end up in a response body.
   Callers get a stable, generic sentence; the real error goes to the log.
2. An auth failure *upstream* is not a 401. Returning 401 would tell the caller
   their X-API-Key was wrong when the real problem is our Anthropic credential,
   sending them off to debug the wrong thing. That is a 502.
"""

from __future__ import annotations

import logging

import anthropic
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import ConfigError

logger = logging.getLogger(__name__)


def _json(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail})


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(anthropic.NotFoundError)
    def _not_found(request: Request, exc: anthropic.NotFoundError) -> JSONResponse:
        logger.info("upstream 404 on %s: %s", request.url.path, exc)
        return _json(404, "Not found.")

    @app.exception_handler(anthropic.BadRequestError)
    def _bad_request(request: Request, exc: anthropic.BadRequestError) -> JSONResponse:
        logger.warning("upstream 400 on %s: %s", request.url.path, exc)
        return _json(422, "The request was rejected upstream as invalid.")

    @app.exception_handler(anthropic.RateLimitError)
    def _rate_limited(request: Request, exc: anthropic.RateLimitError) -> JSONResponse:
        logger.warning("upstream rate limit on %s", request.url.path)
        return _json(429, "Rate limited upstream. Retry shortly.")

    @app.exception_handler(anthropic.APIConnectionError)
    def _unreachable(
        request: Request, exc: anthropic.APIConnectionError
    ) -> JSONResponse:
        logger.error("cannot reach Anthropic on %s: %s", request.url.path, exc)
        return _json(503, "Upstream unreachable.")

    @app.exception_handler(anthropic.AuthenticationError)
    @app.exception_handler(anthropic.PermissionDeniedError)
    def _upstream_auth(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Anthropic rejected our credentials on %s", request.url.path)
        return _json(502, "Upstream credentials rejected. Check the service's key.")

    @app.exception_handler(anthropic.APIStatusError)
    def _upstream_status(
        request: Request, exc: anthropic.APIStatusError
    ) -> JSONResponse:
        logger.error("upstream %s on %s", exc.status_code, request.url.path)
        return _json(502, "Upstream error.")

    @app.exception_handler(ConfigError)
    def _misconfigured(request: Request, exc: ConfigError) -> JSONResponse:
        logger.error("configuration error on %s: %s", request.url.path, exc)
        return _json(500, "Service is misconfigured.")

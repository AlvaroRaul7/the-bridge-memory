"""Chroma client + collection construction.

Reads config from the environment (see .env.example). Deliberately isolated
from engine.py so tests can monkeypatch get_collection() without touching
any network/cloud config.
"""

from __future__ import annotations

import os
from functools import lru_cache

import chromadb
from chromadb.api.models.Collection import Collection
from dotenv import load_dotenv

load_dotenv()

DEFAULT_COLLECTION_NAME = "intelligent-memory"


def _env(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name, default)


@lru_cache(maxsize=1)
def get_chroma_client() -> chromadb.ClientAPI:
    """Return a Chroma client.

    Uses Chroma Cloud when CHROMA_API_KEY is set (the deployed/shared-team
    config); falls back to a local PersistentClient under .chroma/ for
    development and tests that don't want a network dependency.
    """
    api_key = _env("CHROMA_API_KEY")
    if api_key:
        return chromadb.CloudClient(
            api_key=api_key,
            tenant=_env("CHROMA_TENANT"),
            database=_env("CHROMA_DATABASE", "dev"),
        )
    return chromadb.PersistentClient(path=_env("CHROMA_LOCAL_PATH", ".chroma"))


def get_collection(name: str | None = None) -> Collection:
    """Get-or-create the memory collection.

    A single collection is shared across tenants; tenant isolation is
    enforced via the `tenant_id` metadata field on every record (see
    engine.py), not via separate collections — this matches the one
    "intelligent-memory" collection already provisioned in Chroma Cloud.
    """
    client = get_chroma_client()
    collection_name = name or _env("CHROMA_COLLECTION_NAME", DEFAULT_COLLECTION_NAME)
    return client.get_or_create_collection(name=collection_name)

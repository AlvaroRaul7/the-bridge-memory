"""Public data shapes returned by memory_engine. No Chroma types leak past here."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class MemoryRecord:
    """One stored memory, as returned by list/get operations."""

    id: str
    text: str
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True)
class MemoryHit(MemoryRecord):
    """A MemoryRecord returned from a similarity query, with its distance.

    `distance` is Chroma's raw metric (lower = more similar for the default
    cosine space) — callers needing a normalized "score" should convert it
    themselves; we don't invent a fake similarity score here.
    """

    distance: float = 0.0

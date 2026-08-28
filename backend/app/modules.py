"""The modules this service can open a session against.

One Managed Agent per module, rather than one shared agent, so each carries its
own persona and its own memory store. `scenarios.json` at the repo root is the
single registry the Python scripts and the UI already read; this reads the same
file so a module cannot exist on one side and not the other.

Resource ids resolve per module, in this order:

    1. AGENT_ID_<MODULE>        e.g. AGENT_ID_CARD_A_ONBOARDING
    2. .state/<module>/agent_id  written by `python backend/provision.py`
    3. AGENT_ID                  the single-agent fallback, so a deployment
                                 that has not provisioned per module still runs

Same for ENVIRONMENT_ID and MEMORY_STORE_ID.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY = REPO_ROOT / "scenarios.json"
STATE_DIR = REPO_ROOT / ".state"


class ModuleError(RuntimeError):
    """Raised when a module is unknown or has no provisioned resources."""


@dataclass(frozen=True)
class Module:
    id: str
    name: str
    domain: str
    persona: str
    focus: str

    @property
    def env_prefix(self) -> str:
        """`card-a-onboarding` -> `CARD_A_ONBOARDING`."""
        return re.sub(r"[^A-Za-z0-9]+", "_", self.id).upper()

    @property
    def state_dir(self) -> Path:
        return STATE_DIR / self.id

    def system_prompt(self) -> str:
        return SYSTEM_PROMPT_TEMPLATE.format(
            domain=self.domain, persona=self.persona, focus=self.focus
        )


SYSTEM_PROMPT_TEMPLATE = """\
You are the Institutional Memory Agent for {domain}.

{persona}

Your job: be the smartest possible answer to questions about this domain. You
will be asked the same kinds of questions repeatedly across sessions, and you
are expected to get sharper over time.

# Memory protocol (mandatory)

You have a persistent memory store mounted under `/mnt/memory/`. It survives
across sessions. Run `ls -R /mnt/memory/` first — stores mount under their own
name, so do not hard-code a path.

1. At the start of EVERY session, list and skim the store before anything else.
2. Read whatever looks relevant to the question.
3. Record what you learn for future sessions. For this domain that means:
   {focus}. Always record the effective date and the source document.
4. When new information CONTRADICTS old memory, UPDATE the existing file rather
   than appending. Note the effective date, trust the newer version, and keep a
   one-line note of what the old value was and when it changed.
5. Do NOT memorise one-off questions, the literal text of long documents, or
   anything ephemeral.

NEVER write a credential, API key or token to memory. Memory is replayed
verbatim into every future session; there is no unsee.

# How to answer

- If your answer relies on memory, lead with what you already knew.
- When new information contradicts old memory, LEAD with the contradiction:
  name the old value, the new value, and the date.
- If the question's premise is something your memory says is now false, correct
  the premise before answering.
- Be concise.
"""


@lru_cache(maxsize=1)
def all_modules() -> tuple[Module, ...]:
    if not REGISTRY.exists():
        raise ModuleError(f"{REGISTRY} is missing; it defines the modules.")
    raw = json.loads(REGISTRY.read_text())["scenarios"]
    return tuple(
        Module(
            id=s["id"],
            name=s["name"],
            domain=s["domain"],
            persona=s["persona"],
            focus=s["systemPromptFocus"],
        )
        for s in raw
    )


def get_module(module_id: str) -> Module:
    for module in all_modules():
        if module.id == module_id:
            return module
    known = ", ".join(m.id for m in all_modules())
    raise ModuleError(f"Unknown module {module_id!r}. Known modules: {known}")


@dataclass(frozen=True)
class ModuleResources:
    agent_id: str
    environment_id: str
    memory_store_id: str


def _resolve(module: Module, kind: str) -> str | None:
    """kind is 'agent' | 'environment' | 'memory_store'."""
    env_var = f"{kind.upper()}_ID_{module.env_prefix}"
    value = os.environ.get(env_var, "").strip()
    if value:
        return value

    path = module.state_dir / f"{kind}_id"
    if path.exists():
        value = path.read_text().strip()
        if value:
            return value

    # Single-agent fallback, so an unprovisioned deployment still starts.
    shared = os.environ.get(f"{kind.upper()}_ID", "").strip()
    return shared or None


def resources_for(module_id: str) -> ModuleResources:
    module = get_module(module_id)
    resolved = {kind: _resolve(module, kind) for kind in
                ("agent", "environment", "memory_store")}

    missing = [k for k, v in resolved.items() if not v or "PLACEHOLDER" in v]
    if missing:
        raise ModuleError(
            f"Module {module.id!r} has no provisioned "
            f"{', '.join(missing)} id. Run: python backend/provision.py "
            f"--module {module.id}"
        )

    return ModuleResources(
        agent_id=resolved["agent"],            # type: ignore[arg-type]
        environment_id=resolved["environment"],  # type: ignore[arg-type]
        memory_store_id=resolved["memory_store"],  # type: ignore[arg-type]
    )


def is_provisioned(module_id: str) -> bool:
    try:
        resources_for(module_id)
        return True
    except ModuleError:
        return False

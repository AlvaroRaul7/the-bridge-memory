"""Create the Managed Agents resources a module needs.

One agent, one environment and one memory store per module. Ids are written to
`.state/<module>/` (gitignored) where `app.modules` picks them up, so the
service needs no further configuration after a run.

Provisioning is idempotent at the file level: a module whose ids already exist
is skipped unless `force=True`, because three people running this means three
agents and an afternoon wondering why memory is empty.
"""

from __future__ import annotations

from dataclasses import dataclass

from anthropic import Anthropic

from .modules import Module, ModuleResources, all_modules, get_module

# Sonnet 5 rather than Opus: four agents, and the judgement-heavy step is
# recording what changed, which Sonnet handles well. Raise to claude-opus-5 for
# a module where consolidation quality is the product.
MODEL = "claude-sonnet-5"


@dataclass(frozen=True)
class Provisioned:
    module_id: str
    resources: ModuleResources
    created: bool


def _existing(module: Module) -> ModuleResources | None:
    ids = {}
    for kind in ("agent", "environment", "memory_store"):
        path = module.state_dir / f"{kind}_id"
        if not path.exists() or not path.read_text().strip():
            return None
        ids[kind] = path.read_text().strip()
    return ModuleResources(
        agent_id=ids["agent"],
        environment_id=ids["environment"],
        memory_store_id=ids["memory_store"],
    )


def provision_module(
    client: Anthropic, module_id: str, *, force: bool = False
) -> Provisioned:
    module = get_module(module_id)

    if not force:
        existing = _existing(module)
        if existing is not None:
            return Provisioned(module.id, existing, created=False)

    module.state_dir.mkdir(parents=True, exist_ok=True)

    environment = client.beta.environments.create(
        name=f"memory-env-{module.id}",
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )
    (module.state_dir / "environment_id").write_text(environment.id)

    memory_store = client.beta.memory_stores.create(
        name=f"Institutional Memory — {module.name}",
        description=(
            f"Long-term memory for the {module.name} covering {module.domain}. "
            "Newer entries supersede older ones on the same topic."
        ),
    )
    (module.state_dir / "memory_store_id").write_text(memory_store.id)

    agent = client.beta.agents.create(
        name=f"Institutional Memory — {module.name}",
        model=MODEL,
        system=module.system_prompt(),
        tools=[{"type": "agent_toolset_20260401"}],
        metadata={"track": "memory-agent", "module": module.id},
    )
    (module.state_dir / "agent_id").write_text(agent.id)

    return Provisioned(
        module.id,
        ModuleResources(
            agent_id=agent.id,
            environment_id=environment.id,
            memory_store_id=memory_store.id,
        ),
        created=True,
    )


def provision_all(client: Anthropic, *, force: bool = False) -> list[Provisioned]:
    return [provision_module(client, m.id, force=force) for m in all_modules()]

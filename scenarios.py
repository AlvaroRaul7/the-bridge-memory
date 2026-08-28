"""
Scenario registry loader.

`scenarios.json` at the repo root is the single source of truth for the four
scenario cards. The Python session scripts read it through this module; the UI
reads the same file directly. Add a card to the JSON and both sides pick it up.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).parent
REGISTRY_PATH = REPO_ROOT / "scenarios.json"
DEFAULT_SCENARIO = "card-a-onboarding"


@dataclass(frozen=True)
class Scenario:
    id: str
    card: str
    name: str
    domain: str
    persona: str
    system_prompt_focus: str
    test_question: str
    docs_dir: Path
    success_criteria: list[str]

    @property
    def round1_dir(self) -> Path:
        return self.docs_dir / "round1"

    @property
    def round2_dir(self) -> Path:
        return self.docs_dir / "round2"

    def state_path(self, suffix: str) -> Path:
        """Per-scenario id files live under .state/<scenario-id>/ so the four
        cards can be provisioned side by side without clobbering each other."""
        d = REPO_ROOT / ".state" / self.id
        d.mkdir(parents=True, exist_ok=True)
        return d / suffix

    def output_dir(self) -> Path:
        d = REPO_ROOT / "outputs" / self.id
        d.mkdir(parents=True, exist_ok=True)
        return d


def _load_raw() -> list[dict]:
    return json.loads(REGISTRY_PATH.read_text())["scenarios"]


def all_scenarios() -> list[Scenario]:
    return [
        Scenario(
            id=s["id"],
            card=s["card"],
            name=s["name"],
            domain=s["domain"],
            persona=s["persona"],
            system_prompt_focus=s["systemPromptFocus"],
            test_question=s["testQuestion"],
            docs_dir=REPO_ROOT / s["docsDir"],
            success_criteria=s["successCriteria"],
        )
        for s in _load_raw()
    ]


def get(scenario_id: str | None) -> Scenario:
    """Resolve by full id ('card-b-customer-success'), by card letter ('b'),
    or by a unique prefix. Falls back to Card A."""
    wanted = (scenario_id or DEFAULT_SCENARIO).strip().lower()
    scenarios = all_scenarios()
    for s in scenarios:
        if wanted in (s.id, s.card.lower(), f"card-{s.card.lower()}"):
            return s
    matches = [s for s in scenarios if s.id.startswith(wanted)]
    if len(matches) == 1:
        return matches[0]
    known = ", ".join(s.id for s in scenarios)
    raise SystemExit(f"Unknown scenario {scenario_id!r}. Known: {known}")


def add_scenario_arg(parser) -> None:
    parser.add_argument(
        "--scenario",
        "-s",
        default=DEFAULT_SCENARIO,
        help=(
            "Scenario card to run: a card letter (a/b/c/d) or a full id. "
            f"Default: {DEFAULT_SCENARIO}"
        ),
    )


def load_docs_as_context(docs_dir: Path, verbose: bool = True) -> str:
    """Inline every markdown doc in a round directory as one context block."""
    blocks = []
    for path in sorted(docs_dir.glob("*.md")):
        if verbose:
            print(f"  including {path.name}")
        blocks.append(f"=====  DOCUMENT: {path.name}  =====\n{path.read_text()}")
    if not blocks:
        raise SystemExit(f"No .md documents found in {docs_dir}")
    return "\n\n".join(blocks)

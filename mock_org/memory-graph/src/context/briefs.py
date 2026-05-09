"""Generate skinny work-order briefs for autonomous fixing agents."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FixBrief:
    note_id: str
    defect: str
    requirement: str
    cited_paths: list[str]
    scope: str
    provenance: str


FORBIDDEN_FIELDS = {"transcript", "patch", "excerpt", "importance", "weight", "actor_name"}


def render_brief(brief: FixBrief) -> str:
    lines = [
        f"# Fix candidate: {brief.note_id}",
        "",
        "## Defect",
        brief.defect,
        "",
        "## Requirement",
        brief.requirement,
        "",
        "## Cited paths",
        *[f"- `{path}`" for path in brief.cited_paths],
        "",
        "## Scope",
        brief.scope,
        "",
        "## Provenance",
        brief.provenance,
    ]
    return "\n".join(lines) + "\n"


def validate_payload(payload: dict) -> None:
    present = FORBIDDEN_FIELDS.intersection(payload)
    if present:
        raise ValueError(f"brief contains context-poisoning fields: {sorted(present)}")

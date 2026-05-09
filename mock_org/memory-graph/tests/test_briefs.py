import pytest

from context.briefs import FixBrief, render_brief, validate_payload


def test_render_brief_contains_requirement_without_patch():
    brief = FixBrief(
        note_id="demo_context_no_patch_briefs",
        defect="Agent embedded suggested patches inside autonomous PR briefs.",
        requirement="Briefs may state requirements but must not include patches.",
        cited_paths=["memory-graph/src/context/briefs.py"],
        scope="repo",
        provenance="Created 2026-05-09 from signals: reverted diff + correction phrase.",
    )

    rendered = render_brief(brief)

    assert "## Requirement" in rendered
    assert "diff --git" not in rendered


def test_validate_payload_rejects_poisoning_fields():
    with pytest.raises(ValueError):
        validate_payload({"note_id": "n1", "patch": "diff --git ..."})

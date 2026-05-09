"""Short-term injection filter for the current coding session."""

from __future__ import annotations

TOKEN_BUDGET = 900


def select_notes(candidates: list[dict], already_injected: set[str]) -> list[dict]:
    kept: list[dict] = []
    spent = 0
    for note in sorted(candidates, key=lambda n: n["score"], reverse=True):
        if note["id"] in already_injected:
            continue
        cost = int(note.get("token_cost", 160))
        if spent + cost > TOKEN_BUDGET:
            continue
        kept.append(note)
        spent += cost
    return kept

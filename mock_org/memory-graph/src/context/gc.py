"""Long-term hygiene for the shared note graph."""

from __future__ import annotations


def should_prune(note: dict, rejected_patterns: set[str]) -> bool:
    if note.get("pattern") in rejected_patterns:
        return False
    return note["importance"] < 0.1 and note.get("inject_count", 0) == 0


def merge_key(note: dict) -> tuple:
    return tuple(sorted(note.get("files", []))), note["correction"].lower().strip()

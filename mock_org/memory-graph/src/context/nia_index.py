"""Org-scoped Nia indexing helpers."""

from __future__ import annotations


def index_id(org_id: str, source_id: str) -> str:
    if not org_id or not source_id:
        raise ValueError("org_id and source_id are required")
    return f"{org_id}:{source_id}:notes"

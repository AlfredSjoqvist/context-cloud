"""Mock module for memory-graph: src/context/graph.py."""

from __future__ import annotations

def graph_entrypoint(context: dict) -> dict:
    """Small placeholder used by the NM demo seed."""
    return {"ok": True, "context_keys": sorted(context.keys())}

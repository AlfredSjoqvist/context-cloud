"""Mock module for runtime-orchestrator: src/runtime/metrics.py."""

from __future__ import annotations

def metrics_entrypoint(context: dict) -> dict:
    """Small placeholder used by the NM demo seed."""
    return {"ok": True, "context_keys": sorted(context.keys())}

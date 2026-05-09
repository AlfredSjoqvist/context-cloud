"""Durable checkpoint storage for sandboxed background jobs."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Checkpoint:
    run_id: str
    step: str
    payload: dict[str, Any]


class StateStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def write_checkpoint(self, checkpoint: Checkpoint) -> None:
        target = self.root / f"{checkpoint.run_id}.json"
        target.write_text(json.dumps(checkpoint.__dict__, sort_keys=True), encoding="utf-8")

    def read_checkpoint(self, run_id: str) -> Checkpoint | None:
        target = self.root / f"{run_id}.json"
        if not target.exists():
            return None
        data = json.loads(target.read_text(encoding="utf-8"))
        return Checkpoint(**data)

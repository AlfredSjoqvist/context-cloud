"""Cron and webhook scheduling for background agent runs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ScheduledRun:
    run_id: str
    trigger: str
    scheduled_at: datetime


class Scheduler:
    def __init__(self) -> None:
        self._seen_run_ids: set[str] = set()

    def reserve(self, run: ScheduledRun) -> bool:
        if run.run_id in self._seen_run_ids:
            return False
        self._seen_run_ids.add(run.run_id)
        return True

    def next_gc_run(self, org_id: str) -> ScheduledRun:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
        return ScheduledRun(run_id=f"{org_id}:gc:{stamp}", trigger="cron", scheduled_at=datetime.now(timezone.utc))

"""Runs sandboxed jobs with bounded resources."""

from __future__ import annotations

from dataclasses import dataclass


MAX_MEMORY_MB = 4096
DEFAULT_TIMEOUT_S = 300


@dataclass(frozen=True)
class JobSpec:
    image: str
    command: list[str]
    memory_mb: int = MAX_MEMORY_MB
    timeout_s: int = DEFAULT_TIMEOUT_S


def build_job_spec(image: str, command: list[str], memory_mb: int | None = None) -> JobSpec:
    requested = memory_mb or MAX_MEMORY_MB
    if requested > MAX_MEMORY_MB:
        raise ValueError("memory_mb exceeds org budget")
    return JobSpec(image=image, command=command, memory_mb=requested)

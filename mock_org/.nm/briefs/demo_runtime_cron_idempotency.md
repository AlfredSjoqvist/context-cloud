# Fix candidate: demo_runtime_cron_idempotency

## Defect
Agent made scheduled GC jobs non-idempotent.

## Requirement
Use the run id as an idempotency key before applying any GC action.

## Cited paths
- `runtime-orchestrator/src/runtime/scheduler.py`
- `memory-graph/src/context/gc.py`
- `runtime-orchestrator/tests/test_scheduler.py`

## Scope
- Org: `northstar-ai`
- Repo: `runtime-orchestrator`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: repeated failed test + production incident link.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

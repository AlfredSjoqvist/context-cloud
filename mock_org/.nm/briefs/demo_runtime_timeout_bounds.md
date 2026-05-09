# Fix candidate: demo_runtime_timeout_bounds

## Defect
Agent removed the sandbox timeout guard.

## Requirement
Keep timeout_s bounded and surface timeout failures as recoverable job states.

## Cited paths
- `runtime-orchestrator/src/runtime/job_runner.py`
- `runtime-orchestrator/src/runtime/recovery.py`

## Scope
- Org: `northstar-ai`
- Repo: `runtime-orchestrator`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + review feedback.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

# Fix candidate: demo_runtime_microvm_state

## Defect
Agent stored job recovery state only in process memory.

## Requirement
Persist job checkpoints through StateStore before acknowledging each step.

## Cited paths
- `runtime-orchestrator/src/runtime/state_store.py`
- `runtime-orchestrator/src/runtime/recovery.py`
- `runtime-orchestrator/tests/test_recovery.py`

## Scope
- Org: `northstar-ai`
- Repo: `runtime-orchestrator`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: tool error loop + failed test + correction phrase.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

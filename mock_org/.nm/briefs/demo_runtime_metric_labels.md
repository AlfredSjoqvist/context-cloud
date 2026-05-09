# Fix candidate: demo_runtime_metric_labels

## Defect
Metrics used raw user emails as labels.

## Requirement
Hash user identifiers before metric emission and keep labels bounded.

## Cited paths
- `runtime-orchestrator/src/runtime/metrics.py`

## Scope
- Org: `northstar-ai`
- Repo: `runtime-orchestrator`
- Note scope: `file`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + failed test.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

# Fix candidate: demo_context_gc_rejection_rule

## Defect
GC re-pruned a note after maintainer rejection.

## Requirement
Record rejected prune patterns and check them before future GC actions.

## Cited paths
- `memory-graph/src/context/gc.py`
- `memory-graph/src/context/graph.py`

## Scope
- Org: `northstar-ai`
- Repo: `memory-graph`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + review feedback.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

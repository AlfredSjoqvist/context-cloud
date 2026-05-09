# Fix candidate: demo_context_guardian_budget

## Defect
Guardian injected every file-matched note into a short session.

## Requirement
Apply the per-call token budget after relevance scoring and keep only the highest-scoring notes.

## Cited paths
- `memory-graph/src/context/guardian.py`
- `memory-graph/tests/test_guardian.py`
- `agent-gateway/src/api/injections.ts`

## Scope
- Org: `northstar-ai`
- Repo: `memory-graph`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: user interruption + low usefulness feedback.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

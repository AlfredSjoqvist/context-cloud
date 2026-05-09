# Fix candidate: demo_api_injection_dedupe

## Defect
The same note was injected repeatedly in one session.

## Requirement
Suppress notes already injected in the current session unless the touched path changes materially.

## Cited paths
- `agent-gateway/src/api/injections.ts`
- `memory-graph/src/context/guardian.py`

## Scope
- Org: `northstar-ai`
- Repo: `agent-gateway`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: low usefulness feedback + repeated injection log.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

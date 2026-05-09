# Fix candidate: demo_context_nia_namespace

## Defect
Nia search used a shared test index.

## Requirement
Build Nia index ids from org_id and source_id, never from global defaults.

## Cited paths
- `memory-graph/src/context/nia_index.py`
- `connectors/src/nia/search.ts`

## Scope
- Org: `northstar-ai`
- Repo: `memory-graph`
- Note scope: `org`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + failed test.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

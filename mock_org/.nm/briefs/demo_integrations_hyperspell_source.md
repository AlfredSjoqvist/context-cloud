# Fix candidate: demo_integrations_hyperspell_source

## Defect
Hyperspell enrichment was treated as the source of truth.

## Requirement
Keep live-session signals as the primary provenance and attach Hyperspell references as supporting context.

## Cited paths
- `connectors/src/slack/hyperspell.ts`
- `memory-graph/src/context/extract.py`

## Scope
- Org: `northstar-ai`
- Repo: `connectors`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: design correction + review comment.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

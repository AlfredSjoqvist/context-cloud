# Fix candidate: demo_testing_no_snapshot_update

## Defect
Agent updated snapshots to hide a regression.

## Requirement
Do not update snapshots unless the task explicitly asks for a UI text or layout change.

## Cited paths
- `control-plane/components/ActivityFeed.tsx`
- `agent-gateway/tests/mcp.test.ts`

## Scope
- Org: `northstar-ai`
- Repo: `control-plane`
- Note scope: `org`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + failed test.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

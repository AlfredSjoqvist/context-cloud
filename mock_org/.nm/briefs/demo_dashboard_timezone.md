# Fix candidate: demo_dashboard_timezone

## Defect
Activity timestamps rendered in UTC.

## Requirement
Render relative times client-side and keep absolute timestamps in the tooltip.

## Cited paths
- `control-plane/lib/format.ts`
- `control-plane/components/ActivityFeed.tsx`

## Scope
- Org: `northstar-ai`
- Repo: `control-plane`
- Note scope: `file`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + review feedback.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

# Fix candidate: demo_dashboard_activity_window

## Defect
Dashboard counted all-time injections as live activity.

## Requirement
Compute activity metrics over the last fifteen minutes and label seeded rows clearly.

## Cited paths
- `control-plane/components/ActivityFeed.tsx`
- `control-plane/components/InjectionPanel.tsx`
- `control-plane/lib/format.ts`

## Scope
- Org: `northstar-ai`
- Repo: `control-plane`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: user correction + dashboard mismatch.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

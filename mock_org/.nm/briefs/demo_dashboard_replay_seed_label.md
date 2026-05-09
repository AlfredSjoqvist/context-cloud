# Fix candidate: demo_dashboard_replay_seed_label

## Defect
Seeded replay events looked like live production activity.

## Requirement
Mark seeded events explicitly while keeping the live activity feed unmarked.

## Cited paths
- `control-plane/components/ReplayTimeline.tsx`
- `control-plane/components/ActivityFeed.tsx`

## Scope
- Org: `northstar-ai`
- Repo: `control-plane`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + failed test.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

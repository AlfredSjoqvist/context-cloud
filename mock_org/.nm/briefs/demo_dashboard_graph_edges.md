# Fix candidate: demo_dashboard_graph_edges

## Defect
Collapsed folder edges anchored at the graph origin.

## Requirement
When a file is hidden by a collapsed ancestor, merge those edges onto the visible folder anchor.

## Cited paths
- `control-plane/components/NoteGraph.tsx`
- `control-plane/components/ReplayTimeline.tsx`

## Scope
- Org: `northstar-ai`
- Repo: `control-plane`
- Note scope: `file`

## Provenance
Created 2026-05-09 from signals: visual bug report + accepted fix.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

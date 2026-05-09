# Fix candidate: demo_context_no_patch_briefs

## Defect
Agent embedded suggested patches inside autonomous PR briefs.

## Requirement
Briefs may state the requirement and cited paths, but must not include code snippets or patch text.

## Cited paths
- `memory-graph/src/context/briefs.py`
- `memory-graph/tests/test_briefs.py`

## Scope
- Org: `northstar-ai`
- Repo: `memory-graph`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: reverted diff + failed review + correction phrase.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

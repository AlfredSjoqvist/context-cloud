# Fix candidate: demo_readme_catalog_owner

## Defect
Agent guessed code ownership from file names.

## Requirement
Read catalog metadata before assigning review owners or team labels.

## Cited paths
- `runtime-orchestrator/catalog-info.yaml`
- `control-plane/catalog-info.yaml`

## Scope
- Org: `northstar-ai`
- Repo: `runtime-orchestrator`
- Note scope: `org`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + review feedback.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

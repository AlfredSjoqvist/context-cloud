# Fix candidate: demo_integrations_linear_issue_once

## Defect
Linear issue creation duplicated on webhook retry.

## Requirement
Use the NM note id as the external id before creating a Linear issue.

## Cited paths
- `connectors/src/linear/issues.ts`

## Scope
- Org: `northstar-ai`
- Repo: `connectors`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + review feedback.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

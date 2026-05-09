# Fix candidate: demo_integrations_vercel_preview

## Defect
Vercel deploy status was read before the preview URL existed.

## Requirement
Wait for the ready event before attaching preview links to PR briefs.

## Cited paths
- `connectors/src/vercel/deployments.ts`

## Scope
- Org: `northstar-ai`
- Repo: `connectors`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + failed test.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

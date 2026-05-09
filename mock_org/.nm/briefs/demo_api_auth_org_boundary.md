# Fix candidate: demo_api_auth_org_boundary

## Defect
Auth accepted source ids outside the caller org.

## Requirement
Validate org ownership before returning notes, sessions, or injection history.

## Cited paths
- `agent-gateway/src/api/auth.ts`
- `agent-gateway/src/db/schema.ts`

## Scope
- Org: `northstar-ai`
- Repo: `agent-gateway`
- Note scope: `org`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + failed test.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

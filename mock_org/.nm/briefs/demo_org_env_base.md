# Fix candidate: demo_org_env_base

## Defect
Agent hardcoded an internal API host.

## Requirement
Read service hosts from INTERNAL_API_BASE and fail fast when it is missing.

## Cited paths
- `agent-gateway/src/api/mcp.ts`
- `control-plane/lib/convex.ts`
- `connectors/src/convex/sync.ts`

## Scope
- Org: `northstar-ai`
- Repo: `agent-gateway`
- Note scope: `org`

## Provenance
Created 2026-05-09 from signals: reverted diff + correction phrase + failed lint.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

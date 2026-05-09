# Fix candidate: demo_api_rate_limit_scope

## Defect
Rate limits were keyed only by IP address.

## Requirement
Key rate limits by org_id and agent_id with IP as a secondary signal.

## Cited paths
- `agent-gateway/src/api/rateLimit.ts`

## Scope
- Org: `northstar-ai`
- Repo: `agent-gateway`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: correction phrase + file touch + review feedback.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

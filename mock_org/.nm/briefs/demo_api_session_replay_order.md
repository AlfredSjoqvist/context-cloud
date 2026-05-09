# Fix candidate: demo_api_session_replay_order

## Defect
Session replay sorted messages by ingest time.

## Requirement
Order replay events by timestamp and use parent_uuid as a deterministic tie-breaker.

## Cited paths
- `agent-gateway/src/api/sessions.ts`
- `agent-gateway/tests/mcp.test.ts`

## Scope
- Org: `northstar-ai`
- Repo: `agent-gateway`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: replay mismatch + corrected output.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

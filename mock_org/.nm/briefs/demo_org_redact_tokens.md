# Fix candidate: demo_org_redact_tokens

## Defect
Agent logged bearer tokens in an MCP request trace.

## Requirement
Pass all request headers and tool inputs through redactSecrets before writing traces or activity rows.

## Cited paths
- `agent-gateway/src/lib/redaction.ts`
- `agent-gateway/src/api/mcp.ts`
- `memory-graph/src/context/extract.py`

## Scope
- Org: `northstar-ai`
- Repo: `agent-gateway`
- Note scope: `org`

## Provenance
Created 2026-05-09 from signals: security correction + reverted diff + review rejection.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

# Fix candidate: demo_integrations_verify_github_signature

## Defect
GitHub webhook handler trusted unsigned payloads.

## Requirement
Verify the GitHub HMAC signature before parsing or enqueueing webhook bodies.

## Cited paths
- `connectors/src/github/webhooks.ts`
- `connectors/tests/github-webhooks.test.ts`

## Scope
- Org: `northstar-ai`
- Repo: `connectors`
- Note scope: `repo`

## Provenance
Created 2026-05-09 from signals: security correction + failed test.

## Exit conditions
- Existing issue or PR already references this note id.
- Live HEAD no longer contains the defect.
- The cited files are unrelated after reading HEAD.

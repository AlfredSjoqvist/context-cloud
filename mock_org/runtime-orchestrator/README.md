# runtime-orchestrator

Mock Northstar AI repository for NM shared-memory demos.

Conventions:
- Route internal service hosts through INTERNAL_API_BASE.
- Redact secrets before persisting traces or activity feed rows.
- Treat Tensorlake retries as normal and make background work idempotent.

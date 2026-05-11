# Needs Nicolas

Append-only. Each item: who-when-what-why.

---

## Backend — 2026-05-10 — Convex prod deploy path

**Who:** Backend agent (this loop)
**What:** A fix is on `main` (commit `4d0c6c0` — `fix(convex): expose docsIngestRuns in /dashboard/everything`) but it is NOT yet deployed to the prod Convex deployment `colorless-porcupine-926`. The mock V2 dashboard at hindsight-nm.vercel.app/v2.html will keep rendering "No ingestion runs yet" until that deploy happens.

**Blockers preventing me from deploying:**
1. No `CONVEX_DEPLOY_KEY` for `colorless-porcupine-926` in env or `.env*` files. Local `CONVEX_DEPLOYMENT` points to `dev:acoustic-fish-389` (a different deployment).
2. No CI workflow at `.github/workflows/` — deploys appear to be manual from a specific machine.
3. Local `convex/_generated/` types are stale (missing `docsIngestRuns`, `hurdles`, `injections` in dataModel; missing many `internal.*` entries in api.d.ts). `npx convex codegen` bails on pre-existing TS errors in `convex/http.ts` (e.g., `internal.notes.upsertNote` referenced but `notes.ts` only exports public `mutation`, not `internalMutation`). This is pre-existing — not caused by my change.

**What I need from you (pick one):**
- (A) Give me a `CONVEX_DEPLOY_KEY` for `colorless-porcupine-926` so I can `npx convex deploy --prod` myself, OR
- (B) Tell me which machine / who currently deploys to prod and how (so I can stop trying), OR
- (C) Authorize me to fix the pre-existing typecheck issues in `convex/http.ts` + the `mutation` vs `internalMutation` split so codegen passes. That unblocks `npx convex dev` to refresh local types and would let CI run.

I will keep working on in-scope tasks that don't require a deploy until you respond.

# Backend Agent — Worklog

Owner: Backend (Convex data layer)
Scope: `convex/` (schema, queries, mutations, actions, http.ts, crons.ts, _generated), Convex prod deploy to `colorless-porcupine-926`, external API integrations (Nia / OpenAI / GitHub / Devin) called from Convex actions.

---

## Iteration 1 — `dashboard/everything` shape: add `docsIngestRuns` (additive, V1-safe)

**Goal:** Fix the V2 dashboard's silently-broken "Ingestion runs" panel and header "ingestion runs today" count.

**Root cause:** `convex/dashboard.ts` destructures the `docsIngestRuns` table query as `docsLeaves` and returns the field as `docsLeaves`. The V2 dashboard (`mock/v2.js`) reads `data.docsIngestRuns` → always undefined. The V1 dashboard (`mock/index.html`) reads `data.docsLeaves` and works.

**Plan:**
- Edit `convex/dashboard.ts` to return BOTH `docsIngestRuns` (V2 canonical, matches schema table name) AND `docsLeaves` (V1 alias, deprecated).
- Verify: `npx convex run dashboard:everything '{}'` and confirm `docsIngestRuns` is present.
- After deploy: `curl https://colorless-porcupine-926.convex.site/dashboard/everything | jq 'keys'` should include both names.
- Open v2.html in browser, confirm the Ingestion panel renders rows.

**CONTRACT CHANGE (for frontend agents):**
- ADDED field: `docsIngestRuns` (array of docsIngestRuns rows). Same data as `docsLeaves`.
- DEPRECATED field: `docsLeaves` — keeps working for backward compat with V1 mock dashboard. Will be removed once V1 is decommissioned or migrated to the canonical name. No removal date set.

**Outcome:** Code shipped to `main` at commit `4d0c6c0`. Convex prod deploy to `colorless-porcupine-926` is BLOCKED — see `NEEDS-NICOLAS.md` for the auth/deploy-path question. V2 dashboard will continue to render "No ingestion runs yet" until prod has my change.

**Verification status:**
- Pre-deploy: confirmed bug by curling `https://colorless-porcupine-926.convex.site/dashboard/everything` — returned keys did NOT include `docsIngestRuns`, only `docsLeaves`.
- Post-deploy: NOT YET RUN (blocked). Re-curl needed once deploy lands.

**Next iteration candidates (in priority):**
1. Audit `/dashboard/everything` for other contract drift the V2 dashboard expects but the backend doesn't return. Cross-reference every field read in `mock/v2.js` against `convex/dashboard.ts` return shape.
2. Verify `convex/crons.ts` exists and registers cron jobs for Guardian (60s) + GC (15min). If missing, that's why the always-on loop isn't firing — propose schedule.
3. Inventory external integrations: which Convex actions actually call OpenAI / Nia / GitHub / Devin? Are credentials present and the calls real? Audit for stub paths that silently return fake data.
4. Schema review: are there indexes missing for the hot reads in `dashboard.everything`?

---

## Iteration 2 — Unblock Convex deploys: internal mutation / query conversion

**Goal:** Make `npx convex deploy` succeed at all so iteration 1's change can ship.

**Root cause:** `convex/http.ts` calls `internal.notes.upsertNote`, `internal.injections.recordInjection`, `internal.hurdles.recordHurdle`, `internal.gc.recordAction`, `internal.sessions.upsertSession`, `internal.sessions.listWithNotes`, `internal.agentEvents.append`, `internal.agentEvents.markExtracted`, `internal.dashboard.everything`. All nine were exported as public `mutation`/`query` in their files — `internal.*` resolved to `{}` and typecheck failed before push (blocked codegen and deploy entirely). Bonus: those mutations were ALSO publicly callable, bypassing the `NM_SYNC_TOKEN` gate that `http.ts` wraps them with.

**Plan:** Convert the nine functions to `internalMutation`/`internalQuery`. Keep `listActive`, `listEdgesForPath`, etc. public (called by `agent/tools/nmClient.ts` via `api.notes.*`).

**Outcome:** Shipped at commit `7d597ea`. Convex deploy to dev (`acoustic-fish-389`) now succeeds. End-to-end smoke test: `POST /sync/agent-event` returned `{ok:true, result:{id:"m97c9ym5p72xe2cathrd7x248986gq5c"}}` — internal mutation chain works at runtime.

---

## Iteration 3 — `lastIngestedAt` projection on `docsIngestRuns`

**Goal:** Fix V2 dashboard's "Ingestion runs today" counter (always 0) and per-row age column (always `—`).

**Root cause:** V2 frontend reads `docsIngestRuns[i].lastIngestedAt`. Schema doesn't store this field on `docsIngestRuns` (one row per emitted leaf — immutable). Rows had `_creationTime` but not `lastIngestedAt`, so `ms(undefined)` returned 0 for all rows.

**Plan:** Project `lastIngestedAt = _creationTime` on every row in `dashboard.everything` (pure presentation alias, no schema migration, no writer changes).

**Outcome:** Shipped at commit `49b1389`. Verified on dev: all 8 rows now expose `lastIngestedAt` matching `_creationTime`.

---

## Iteration 4 — Close `seed:seedAll` public attack surface

**Goal:** Stop any client with the Convex URL from being able to wipe + reseed 16 tables.

**Root cause:** `seed.ts` exported `seedAll` as `mutation` (public). Found zero external callers (grepped agent/, scripts/, dashboard/, ui/, mock/, docs-ingest/).

**Plan:** Convert `seedAll` → `internalMutation`. Operators still invoke via `npx convex run seed:seedAll` because internal functions are CLI-callable.

**Outcome:** Shipped at commit `bb4b52d`. Re-deployed dev — schema validation + typecheck both pass.

---

## DEPLOY STATE (as of iteration 4):

- **Dev deployment `acoustic-fish-389`:** Up to date with `main`. Has my four fixes.
- **Prod deployment `colorless-porcupine-926`:** STILL ON OLD CODE. The V2 frontend (mock/v2.js) hardcodes this URL — so until prod is redeployed, none of my iterations 1-4 are user-visible.

**Blocker for prod deploy:** I have only a dev deploy key (`dev:acoustic-fish-389|...`). The same Convex project should have a prod-scoped key for `colorless-porcupine-926`. Logged in `NEEDS-NICOLAS.md`.

**Always-on agent state:** As of this iteration, dev has no cycles or gcActions in the last 29 hours. The agents in `agent/` (integration agent's scope) aren't being scheduled to fire against dev. Out of my scope to fix, but flagging because the dashboard will read stale data.


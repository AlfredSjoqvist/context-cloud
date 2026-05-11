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


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

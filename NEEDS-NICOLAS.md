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

---

## Backend — 2026-05-10 — UPDATE: dev deploy unblocked, prod still blocked

**Who:** Backend agent
**What:** You gave me `dev:acoustic-fish-389|<key>` and I used it to:
- Convert the nine HTTP-only mutations/queries to `internal*` (unblocked deploys)
- Ship the `docsIngestRuns` shape fix
- Ship the `lastIngestedAt` projection
- Lock down `seed:seedAll` from public callability

All four are live on **dev `acoustic-fish-389`** — verified by curl.

**The prod deployment `colorless-porcupine-926` still has the OLD code.** The V2 frontend (`mock/v2.js`) hardcodes `https://colorless-porcupine-926.convex.site` — so until that deployment is updated, none of these fixes are user-visible.

**What I need from you (pick one):**
- (A) Give me a `CONVEX_DEPLOY_KEY` scoped to `colorless-porcupine-926` so I can deploy to prod myself (same workflow, different key).
- (B) Tell the frontend agent to repoint `mock/v2.js` and the V1 `mock/index.html` from `colorless-porcupine-926.convex.site` to `acoustic-fish-389.convex.site`. Then dev becomes the single source of truth and I can keep iterating without a prod key.
- (C) You deploy to prod yourself (paste the prod key into a terminal locally, run `npx convex deploy --prod`).

I'll keep shipping to dev meanwhile.

---

## Backend — 2026-05-10 — Always-on agents idle on dev (FYI, out of my scope)

**Who:** Backend agent
**What:** Dev `acoustic-fish-389` has had zero new `cycles` or `gcActions` rows in the last ~29 hours. The Guardian + GC + NM agents in `agent/` aren't being scheduled to fire against dev. The dashboard will continue to show stale "Today's notes" and "Findings needing attention" panels until something fires those loops.

**Why I'm flagging, not fixing:** `agent/` and the Tensorlake schedules are integration agent's scope. I won't touch them. But the frontend reads what those agents write, and the V2 Overview is built around "today's activity" — empty data is empty UI.

**Possible paths (FYI for whoever picks this up):**
- Tensorlake cron pointed at dev convex deployment instead of (or in addition to) prod.
- A small Convex cron in `convex/crons.ts` that triggers a heartbeat / a stub cycle / a synthetic note so the dashboard has fresh data during testing. (I can write this if you say yes — it's in my scope.)
- Manually run `npx convex run seed:seedAll` against dev to refresh demo data once per session.

---

## Integration — 2026-05-10 — root `.mcp.json` still hardcoded for Windows

**Who:** Integration agent
**What:** `.mcp.json` references `C:\Users\Alfred\Desktop\nozomio\nm_server.py`. On macOS/Linux the `nm` MCP entry silently fails to spawn — same class of bug as the `.claude/settings.json` Windows-path issue I fixed in commit `a836fc8`. I didn't fix this one because CLAUDE.md explicitly lists `.mcp.json` in the "ask before touching" set.

**Suggested change:**
```json
{
  "mcpServers": {
    "nm": {
      "type": "stdio",
      "command": "python3",
      "args": ["nm_server.py"]
    },
    "hindsight": {
      "type": "stdio",
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": {
        "HINDSIGHT_CONVEX_URL": "https://colorless-porcupine-926.convex.cloud"
      }
    }
  }
}
```

Both relative — Claude Code spawns MCP servers with cwd=project root. Adding `hindsight` here would mean any Claude Code session opened in this repo gets the Hindsight tools for free.

If you'd rather I run the install CLI: `cd mcp-server && node dist/install.js --editor claude-code-project` handles the `hindsight` entry idempotently — but the broken `nm` entry has to be hand-edited regardless.

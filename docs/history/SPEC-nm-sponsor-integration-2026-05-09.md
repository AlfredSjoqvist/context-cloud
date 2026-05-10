# NM — Sponsor Integration Spec

**This file describes what the sponsor-integration agent built and how the platforms fit together. Paste it into a fresh agent and they should be able to act without reading the rest of the codebase first.**

Companion docs:
- [NM.md](NM.md) — product spec / architecture
- [SCHEMA.md](SCHEMA.md) — database schema reference
- [CLAUDE.md](CLAUDE.md) — operating notes for Claude Code in this repo

---

## TL;DR

Local-only NM (SQLite + inline hooks + manual `nm_extract.py` CLI) is now wired into four Tier-1 sponsor platforms:

| Platform | Role | Status |
|---|---|---|
| **Convex** | Authoritative store for the product graph (notes / edges / files / hurdles / injections / gc / sessions). Powers the live dashboard. | Code ready · `npx convex dev` to deploy |
| **Tensorlake** | Hosts Note Manager (webhook) and GC (cron `*/15 * * * *`) as background sandboxed agents. Wraps existing local code; CLI still works. | Code ready · `tensorlake deploy` to deploy |
| **Vercel** | Hosts the Next.js dashboard reading from Convex via reactive queries. Replaces `nm_dashboard.py` for the submission URL. | Code ready · `vercel deploy` |
| **Nia** | Semantic note retrieval + indexing. New MCP tool `find_notes_semantic`. Auto-falls-back to a local cosine ranker when `NIA_API_KEY` is unset, so the demo works either way. | Code ready · set `NIA_API_KEY` to switch to remote |

**Core principle:** SQLite stays the source of truth for capture-layer writes (latency-sensitive). Convex mirrors the product graph for cross-machine + dashboard reactivity. All sync calls are best-effort and fail-open — no integration outage can block the agent.

**Out of scope (intentionally):** Guardian agent — owned by another team member. Reserved path: `tensorlake/guardian.py`.

---

## What changed in the local files

| File | Touched | Why |
|---|---|---|
| `nm_capture.py` | yes | Mirrors session rows to Convex at end of `_ingest`. Trace tables (messages/content_blocks) stay local. |
| `nm_inject.py` | yes | Mirrors every injection event to Convex right after writing to local `injections`. |
| `nm_extract.py` | yes | Mirrors persisted note + edges + hurdle to Convex. Calls `nm_nia.index_note` for semantic surface. |
| `nm_server.py` | yes | Added `find_notes_semantic` MCP tool. Header notice points to SPEC.md. |
| `requirements.txt` | yes | Added `openai>=1.50.0` (already by another agent). |

Every touched file has a "INTEGRATIONS NOTICE" block at its top documenting what changed and pointing back to this file.

**Files NOT touched** (in case other agents are mid-edit):
- `nm_signals.py`, `nm_events.py`, `nm_db.py`, `nm_dashboard.py`, `mock/index.html`, `schema.sql`

---

## New files

```
convex/                          # Convex backend (TypeScript)
  schema.ts                      # mirror of v2 SQLite product/audit tables
  notes.ts                       # upsertNote, upsertEdge, upsertFile, invalidateNote, bumpInjectCount + queries
  injections.ts                  # recordInjection, recent, recentStats
  hurdles.ts                     # recordHurdle, recent
  gc.ts                          # recordAction, recent, recentStats
  sessions.ts                    # upsertSession, recent
  http.ts                        # POST /sync/{note,injection,hurdle,gc,session}; auth via X-NM-TOKEN
package.json                     # convex dep at project root for `npx convex dev`

dashboard/                       # Next.js app (Vercel-deployable)
  package.json
  tsconfig.json
  next.config.js
  .env.example
  app/layout.tsx
  app/page.tsx                   # reactive view: notes, injections, gc actions, sessions
  app/providers.tsx              # ConvexReactClient provider
  app/globals.css
  README.md                      # deploy steps

tensorlake/                      # Tensorlake function definitions
  __init__.py
  note_manager.py                # webhook-triggered: extract_session(payload.session_id)
  gc.py                          # cron-scheduled: nm_gc.run_once()
  README.md                      # deploy + local-equivalent commands

nm_convex.py                     # Python HTTP client for the convex/http.ts actions
nm_gc.py                         # standalone GC (decay → merge → prune); wrapped by tensorlake/gc.py
nm_nia.py                        # Nia REST wrapper + local-cosine fallback
SPEC.md                          # this file
```

---

## How the pieces actually wire together

```
   ┌────────────── Claude Code session ──────────────┐
   │   PreToolUse → nm_inject.py                     │
   │   PostToolUse / Stop → nm_capture.py            │
   └─────────────┬───────────────┬───────────────────┘
                 │               │
       writes (local)            POSTs (best-effort)
                 │               │
                 ▼               ▼
          ┌──────────┐     ┌──────────────┐    ┌─────────────────┐
          │  nm.db   │     │   Convex     │◀──▶│  Vercel/Next.js │
          │ (SQLite) │     │  (graph +    │    │   dashboard     │
          └────┬─────┘     │   audit)     │    │  (reactive)     │
               │           └────▲─────────┘    └─────────────────┘
               │                │
               │                │ POSTs
   ┌───────────┴───────┐        │
   │  nm_extract       │────────┤        ┌──────────────────────┐
   │  (Tensorlake fn   │        │        │  Tensorlake schedule │
   │   or local CLI)   │        │◀───────┤  nm-gc every 15 min  │
   └───────────────────┘        │        └──────────────────────┘
                                │
                                │  POST /sync/note (re-indexed)
                                ▼
                          ┌──────────┐
                          │   Nia    │   ← search via nm_server.find_notes_semantic
                          └──────────┘
```

---

## Per-platform details

### Convex (state-of-record + reactive UI)

**Schema** in `convex/schema.ts`. Mirrors v2 SQLite product tables: `sessions`, `notes`, `files`, `noteFiles`, `hurdles`, `injections`, `gcActions`. Trace tables (messages / content_blocks / tool_calls / file_touches) stay in SQLite — too high-volume for round-trip latency on every hook fire.

**Sync path:**
- Python writers (`nm_inject`, `nm_extract`, `nm_capture`, `nm_gc`) call `nm_convex.sync_*(...)` immediately after their local SQLite write. Calls are HTTP POSTs to the deployment's `.convex.site` host; they fail-open in <1.5s on any network error.
- Auth is shared-secret via `X-NM-TOKEN`; if `NM_SYNC_TOKEN` is unset on either side, no check is enforced (dev mode).

**Deploy:**
```bash
# from project root
npm install
npx convex dev          # one-time auth + deploy; gives you CONVEX_URL
export CONVEX_URL=https://<deployment>.convex.site
export NM_SYNC_TOKEN=<random-secret>
# put both into the Convex dashboard's "Environment Variables" panel too
```

After `npx convex dev` runs once, `convex/_generated/` exists and the Next.js dashboard's typed `api` import works.

### Tensorlake (background agents)

**Two agents.** Both wrap pure-Python entrypoints that also work as CLIs locally — Tensorlake is the deployment vehicle, not a fork.

| File | Trigger | Wraps | Local equivalent |
|---|---|---|---|
| `tensorlake/note_manager.py` | webhook | `nm_extract.extract_session` | `python nm_extract.py --session <id>` |
| `tensorlake/gc.py` | `*/15 * * * *` cron | `nm_gc.run_once` | `python nm_gc.py --loop --interval 900` |

**Note Manager.** POST `{"session_id": "..."}` triggers extraction. Returns the same dict shape `extract_session` returns. Wire Claude Code's `Stop` hook to fire this webhook on session end.

**GC.** Three passes per run:
1. **Decay** — exponential, half-life 7 days from `last_injected_at` (or `created_at`).
2. **Merge** — Jaccard ≥ 0.6 over file sets AND cosine ≥ 0.5 over correction text → keep higher-importance, invalidate the loser with `action='merge'`.
3. **Prune** — importance < 0.10 → invalidate with `action='prune'`.

Every action writes one row to local `gc_actions` AND mirrors to Convex → live dashboard updates. Knobs are constants at the top of `nm_gc.py`.

**Deploy:**
```bash
pip install tensorlake
export TENSORLAKE_API_KEY=...
export OPENAI_API_KEY=...                        # used by Note Manager
export CONVEX_URL=https://<deployment>.convex.site
export NM_SYNC_TOKEN=<shared secret>

tensorlake deploy tensorlake/note_manager.py --name nm-note-manager
tensorlake deploy tensorlake/gc.py --name nm-gc
```

The Tensorlake imports degrade gracefully when the SDK isn't installed locally (decorator becomes a no-op), so this code doesn't break local testing of the underlying functions.

### Vercel (dashboard)

**Dashboard at `dashboard/`.** Next.js 15, App Router, single page. Reads three Convex queries reactively (`useQuery`) with no polling:

- `api.notes.listActive` — note cards
- `api.injections.recent` + `api.injections.recentStats` — live activity feed + 15-min metric
- `api.gc.recent` + `api.gc.recentStats` — live GC ticker (the cron-tick demo proof)
- `api.sessions.recent` — session counter

**Deploy:**
```bash
cd dashboard
npm install
cp .env.example .env.local                       # set NEXT_PUBLIC_CONVEX_URL=https://<dep>.convex.cloud
npm run dev                                       # local check
npx vercel                                        # interactive deploy; pick "Next.js"
```

Important: dashboard reads from `*.convex.cloud` (the WebSocket-backed reactive endpoint). Python sync writes to `*.convex.site` (the HTTP-actions endpoint). Both URLs come from the same Convex deployment.

### Nia (semantic search)

**`nm_nia.py`** exposes two functions that work in two modes:

- `index_note(note_id, text, files)` — POSTs to Nia when configured; no-op locally.
- `semantic_lookup(query, limit)` — searches Nia when configured; **auto-falls-back to a local cosine ranker over `notes` when not**. The demo works without the API key being set, then upgrades transparently when it is.

`nm_extract.py` calls `index_note` immediately after persisting a note — so as soon as Nia is wired in, every new note is automatically searchable by semantics, not just by file path.

`nm_server.py` exposes a new MCP tool `find_notes_semantic(query, limit)` for the dashboard, the user's coding agent, or other agents to query notes by topic.

**Configure:**
```bash
export NIA_API_KEY=<your key>
export NIA_INDEX_ID=nm-notes                # or whatever index you create in Nia
# optional: export NIA_API_URL=...          # default https://api.nia.ai/v1
```

If your Nia API endpoints differ from `/index/document` and `/search`, edit `nm_nia.py` — single-file change.

---

## Environment variables — full list

| Var | Required for | Notes |
|---|---|---|
| `CONVEX_URL` | Convex sync | The `.convex.site` URL (HTTP actions). |
| `NM_SYNC_TOKEN` | Convex sync auth | Shared secret. Match between Python env + Convex env. Optional in dev. |
| `NM_SYNC_TIMEOUT` | Convex sync | Seconds. Default 1.5. |
| `NM_SYNC_DISABLE` | Convex sync | Set to `1` to disable all Convex calls (tests/CI). |
| `NEXT_PUBLIC_CONVEX_URL` | Dashboard | The `.convex.cloud` URL. |
| `OPENAI_API_KEY` | nm_extract | Used by Note Manager LLM call (gpt-4o-mini default). |
| `NM_EXTRACT_MODEL` | nm_extract | Default `gpt-4o-mini`. |
| `NM_EXTRACT_BASE_URL` | nm_extract | OpenAI-compatible endpoint override. |
| `NIA_API_KEY` | Nia remote | Without it, local-cosine fallback runs. |
| `NIA_API_URL` | Nia remote | Default `https://api.nia.ai/v1`. |
| `NIA_INDEX_ID` | Nia remote | Default `nm-notes`. |
| `NIA_TIMEOUT` | Nia remote | Seconds. Default 2.0. |
| `NM_NIA_DISABLE` | Nia | Set to `1` to force-disable remote. |
| `TENSORLAKE_API_KEY` | Tensorlake deploy | Only on the deploy machine. |

---

## File ownership (for other agents)

If you're an agent working on this repo and want to know who owns what:

| Concern | Files | Owner |
|---|---|---|
| Capture (transcript → SQLite) | `nm_capture.py` | shared (sponsor-integration agent added Convex mirror) |
| Inject hook | `nm_inject.py` | shared (sponsor-integration agent added Convex mirror) |
| MCP server / query surface | `nm_server.py` | shared |
| Note Manager extraction | `nm_extract.py` | extraction agent (sponsor agent added Convex+Nia hooks at write boundaries) |
| Hurdle signals | `nm_signals.py` | extraction agent — **untouched** |
| Event normalization | `nm_events.py` | extraction agent — **untouched** |
| DB connection / schema apply / canonical paths | `nm_db.py` | shared — **untouched** |
| SQLite schema | `schema.sql` + `SCHEMA.md` | shared (update SCHEMA.md when changing schema) |
| Local dashboard server | `nm_dashboard.py` + `mock/index.html` | dashboard agent — **untouched** (Vercel build is additive, doesn't replace yet) |
| GC | `nm_gc.py` + `tensorlake/gc.py` | sponsor-integration agent |
| Convex backend | `convex/*` + `package.json` | sponsor-integration agent |
| Vercel dashboard | `dashboard/*` | sponsor-integration agent |
| Nia integration | `nm_nia.py` | sponsor-integration agent |
| Guardian | `tensorlake/guardian.py` (does not exist yet) | **OTHER TEAMMATE — do not write this file** |

If you must edit a file owned by another concern, leave a one-line `# NOTE: <agent> touched this — see SPEC.md` at the top.

---

## What works without any sponsor deploys (the safety floor)

The user can demo the system end-to-end with zero sponsor accounts:

1. `python nm_capture.py` — already wired via Claude Code hooks.
2. `python nm_inject.py` — already wired via Claude Code hooks.
3. `python nm_extract.py --session <id>` — runs locally, persists notes to SQLite.
4. `python nm_gc.py --loop --interval 900` — runs locally, prunes/merges/decays.
5. `python nm_dashboard.py` — local dashboard at 127.0.0.1:8765.
6. `find_notes_semantic` MCP tool — falls back to local cosine.

The sponsor integrations *upgrade* this floor; they don't replace it. Each one can be added independently by setting the right env vars.

---

## What this agent did NOT do (be honest)

- Did not run `npx convex dev` (requires interactive auth).
- Did not run `vercel deploy` (no Vercel CLI installed; user can use `npx vercel` or git push).
- Did not run `tensorlake deploy` (SDK not installed).
- Did not test the live Convex round-trip (no deployment URL yet).
- Did not write Guardian — explicitly out of scope; another teammate owns it.
- Did not migrate `nm_dashboard.py` away (kept as the local fallback; Vercel one is additive).
- Did not change `nm_signals.py`, `nm_events.py`, `nm_db.py`, `mock/index.html`, or `schema.sql`.

Everything above is safe to deploy / enable in any order. The local pipeline keeps working unchanged at every step.

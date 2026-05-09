# NM — Agent Handoff Brief

**Paste this into a fresh agent (Codex / Claude / whoever). Self-contained context to take over.**

---

## What this project is

**Working name: NM** (placeholder — final name TBD; see "Naming" at the bottom).
GitHub repo: **https://github.com/AlfredSjoqvist/context-cloud** (private).
Working directory: `c:\Users\Alfred\Desktop\nozomio` (Windows, PowerShell).

**Pitch:** A shared brain for a team's coding agents — they learn from each other's mistakes, not just their own.

**Mechanic:** An MCP server tails Claude Code's JSONL transcripts. A Note Manager distills moments where the agent got stuck into 4-field notes (`symptom`, `root_cause`, `correction`, files attached). A PreToolUse hook injects matching notes into a different agent's context the moment it touches the same file. A GC keeps the graph clean. A Guardian (other teammate's slot) filters per-injection.

**Hackathon:** Nozomio, May 9 2026. Submissions 6:00pm. Track: **Always-On Agents** (Nia + Tensorlake). Rubric weights: **Background Execution 30%**, **Statefulness 25%**, **Agentic Depth 20%**, Demo 10%, Judge 10%. Top-6 finals are track-agnostic.

---

## Read these first, in this order

| File | Purpose |
|---|---|
| `NM.md` | Product spec, demo arc, rubric framing. **Source of truth for what we're building.** |
| `SPEC.md` | Sponsor-platform integration spec. Deploy commands. Env vars. File ownership. |
| `SCHEMA.md` | DB schema reference. v1 (legacy) + v2 (canonical) modules. |
| `CLAUDE.md` | Operating notes for Claude Code in this repo. |
| `architecture.pdf` | 5-page visual spec (white-bg academic style). |

---

## Repo state

```
.claude/settings.json    — hooks: capture (4 events) + inject (PreToolUse Read|Edit|Write|MultiEdit)
.mcp.json                — registers nm_server.py as MCP server "nm"
schema.sql               — v2 schema (additive over v1)
nm_db.py                 — connect, init_db (creates v1 + applies v2), canonical_path
nm_capture.py            — hook: tails JSONL → messages/content_blocks/tool_calls/file_touches
nm_inject.py             — hook: PreToolUse → notes lookup → additionalContext + injections audit
nm_server.py             — MCP tools: get_relevant_notes, list_sessions, get_messages,
                            get_tool_calls, get_file_touches, list_recent_injections,
                            list_notes, find_notes_semantic
nm_events.py             — normalize messages → Event stream (v1 fallback to transcript_entries)
nm_signals.py            — 7 hurdle detectors (action_bigram_loop, retry_loop, interrupt,
                            reverted_edit, correction_phrase, prompt_reask, feedback)
nm_extract.py            — Note Manager: signals → windows → LLM → notes (gpt-4o-mini default).
                            Mirrors notes/edges/hurdles to Convex; indexes to Nia.
                            Recently hardened by another agent: stricter LLM prompt that
                            preserves user-stated reasons verbatim.
nm_gc.py                 — standalone GC: decay (7d half-life) → merge (Jaccard 0.6 +
                            cosine 0.5) → prune (importance < 0.10). Audit + Convex mirror.
nm_convex.py             — Python HTTP client for convex/http.ts. Best-effort, fail-open.
nm_nia.py                — Nia wrapper + local cosine fallback (works without NIA_API_KEY).

convex/                  — Convex backend
  schema.ts              — extended by dashboard agent with users, agents, prunedEdges,
                            gcRuns + extra optional fields on notes/injections/gcActions
  notes.ts, injections.ts, hurdles.ts, gc.ts, sessions.ts
  http.ts                — POST /sync/{note,injection,hurdle,gc,session}; X-NM-TOKEN auth
package.json             — convex dep at root for `npx convex dev`

dashboard/               — Next.js 15 app for Vercel
  app/page.tsx           — live-reactive: notes, injections, gc actions, sessions
  app/providers.tsx      — ConvexProvider with NEXT_PUBLIC_CONVEX_URL
  README.md              — deploy steps

tensorlake/              — Tensorlake function definitions
  note_manager.py        — webhook fn wrapping nm_extract.extract_session
  gc.py                  — cron `*/15 * * * *` fn wrapping nm_gc.run_once
  README.md              — deploy + local-equivalent commands
  guardian.py            — DOES NOT EXIST. Reserved slot for another teammate.

mock/index.html          — Original 223KB hand-rolled dashboard. Served by nm_dashboard.py
                            (local stdlib HTTP). Kept as fallback; Vercel/Next.js is
                            additive.
nm_dashboard.py          — Local stdlib HTTP server for mock/index.html. Localhost only.

mock_org/                — UNEXPLORED. Another agent has been building here. Check
                            mock_org/agent-gateway/.claude/settings.json for what's running.
mock_traces.py           — UNEXPLORED. Created by another agent.

nm.db                    — Local SQLite (25MB+, in repo). Source of truth for trace.
                            v1 + v2 tables coexist. Already populated from 13 transcripts.

architecture.pdf         — 5-page system spec, white-bg academic style.
make_architecture_pdf.py — regenerator (matplotlib).

NM.md / SPEC.md / SCHEMA.md / CLAUDE.md / HANDOFF.md (this file)
```

---

## Critical schema facts

- **Two layers, additive.** v1 in `nm_db.py` (events, transcript_entries, notes, files, file_note_edges, hurdles, extract_state). v2 in `schema.sql` (sessions, messages, content_blocks, tool_calls, file_touches, hurdle_signals, injections, note_feedback, gc_actions, nm_meta). v1 product tables (notes, files, file_note_edges, hurdles) are **authoritative** — v2 doesn't redefine them.
- **The notes "soft delete" column is `t_invalid`** (legacy name, NOT `invalidated_at`). Always query `WHERE t_invalid IS NULL` for active notes. Bit me twice; fixed in nm_gc and nm_nia.
- **Convex schema (`convex/schema.ts`) was extended by the dashboard agent** with `users`, `agents`, `prunedEdges`, `gcRuns` + extra optional fields. Python sync ignores those extras (they're optional).
- **Path canonicalization:** every path in v2 tables (file_touches, injections) goes through `nm_db.canonical_path`: forward slashes, lowercase drive letter, project-relative under `CLAUDE_PROJECT_DIR`. Result: `TEST.md`, `c:\…\TEST.md`, `C:/…/TEST.md` collapse to one row.
- **`.claude/settings.json` hook paths use FORWARD slashes** in the absolute path. Backslashes get mangled by bash on Windows.

---

## What's done vs. open

### DONE
- [x] MCP server + capture/inject hooks wired into Claude Code, fully working
- [x] v2 schema designed, applied additively, all 13 existing transcripts re-ingested
- [x] Hurdle detection (7 signals) + window expansion + LLM extraction (Note Manager)
- [x] GC with decay/merge/prune + audit log
- [x] Convex backend (schema, mutations, queries, HTTP actions for Python sync)
- [x] Vercel/Next.js dashboard scaffold with live `useQuery` hooks
- [x] Tensorlake function wrappers (note_manager, gc) — code ready
- [x] Nia integration with local cosine fallback (demo works without API key)
- [x] All write paths mirror to Convex best-effort fail-open
- [x] SPEC.md, SCHEMA.md, NM.md, architecture.pdf
- [x] Repo pushed (private): https://github.com/AlfredSjoqvist/context-cloud

### CRITICAL for demo (not done)
- [ ] **Deploy Convex** — `npm install && npx convex dev` from project root. Sets up the Convex deployment, generates `convex/_generated/`, gives a deployment URL. Set `CONVEX_URL` (.convex.site) and `NM_SYNC_TOKEN` env vars on the local machine; mirror values into the Convex dashboard's env panel.
- [ ] **Deploy Vercel dashboard** — `cd dashboard && npm install && npx vercel`. Set `NEXT_PUBLIC_CONVEX_URL` (.convex.cloud) in Vercel project. **Submission requires a public URL — localhost is invalid.**
- [ ] **Live cron tick** — either `tensorlake deploy tensorlake/gc.py` OR run `python nm_gc.py --loop --interval 900` in a foreground terminal during the demo. The activity feed seeing GC fire is the on-stage proof for Background Execution.
- [ ] **Pre-test the demo prompt** — pick one prompt that reliably trips a project-specific hurdle in agent A, gets corrected, and lands in nm.db as a note. Then a different prompt that triggers a Read on the same file in agent B and verifies the injected note shows up. Test 20+ times so it's deterministic.

### Nice-to-have
- [ ] Deploy Tensorlake Note Manager webhook (locally `python nm_extract.py --session <id>` works)
- [ ] Set `NIA_API_KEY` for real semantic search (local cosine fallback in place)
- [ ] Pick the final name (10 candidates given; Memex / Cairn recommended)
- [ ] Explore `mock_org/` and `mock_traces.py` — built by other agents, unexplored by me

### NOT MY JOB
- Guardian agent — owned by another teammate. Reserved path: `tensorlake/guardian.py`. Do not write.

---

## File ownership table (so you don't step on other agents)

| File | Owner | Notes |
|---|---|---|
| `nm_capture.py`, `nm_inject.py`, `nm_server.py` | shared | sponsor-integration agent (me) added Convex hooks |
| `nm_extract.py` | extraction agent | I added Convex+Nia mirroring; another agent recently hardened the LLM prompt |
| `nm_signals.py`, `nm_events.py` | extraction agent | UNTOUCHED |
| `nm_db.py` | shared | I added canonical_path + schema.sql apply |
| `schema.sql` + `SCHEMA.md` | shared | update SCHEMA.md whenever you change the schema (memory rule) |
| `nm_dashboard.py`, `mock/index.html` | dashboard agent | UNTOUCHED |
| `convex/*` | sponsor-integration agent (me) | dashboard agent extended schema.ts with users/agents/prunedEdges/gcRuns |
| `dashboard/*` | sponsor-integration agent (me) | hasn't been deployed |
| `tensorlake/*` | sponsor-integration agent (me) | not deployed |
| `nm_nia.py`, `nm_gc.py`, `nm_convex.py`, `make_architecture_pdf.py` | sponsor-integration agent (me) | mine |
| `mock_org/`, `mock_traces.py` | unknown agent | unexplored |
| `tensorlake/guardian.py` | other teammate | DO NOT WRITE |

---

## Environment

- Windows 11, PowerShell + Bash (Git Bash via Bash tool)
- Python 3.12.4 (`mcp` 1.26, `openai` ≥ 1.50, `matplotlib` 3.10)
- Node 22 / npm 10
- gh CLI authenticated as `AlfredSjoqvist` with repo + admin:public_key + read:org + gist scopes
- No `vercel` CLI (use `npx vercel`)
- No `tensorlake` SDK installed (`pip install tensorlake` on deploy machine)

## Env vars (none set in this session — set as you deploy)

```
CONVEX_URL=https://<deployment>.convex.site         # Python sync target
NM_SYNC_TOKEN=<shared secret>                        # X-NM-TOKEN; optional in dev
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud   # dashboard target
OPENAI_API_KEY=...                                   # Note Manager LLM
NIA_API_KEY=...                                      # else local cosine fallback
NIA_INDEX_ID=nm-notes
TENSORLAKE_API_KEY=...                               # only on deploy machine
```

## Sanity-check commands

```bash
# Imports + canary inject
python -c "import nm_db, nm_capture, nm_inject, nm_server, nm_extract, nm_gc, nm_nia, nm_convex; print('ok')"
echo '{"session_id":"t","tool_name":"Read","tool_input":{"file_path":"TEST.md"}}' | python nm_inject.py
# Expect: JSON additionalContext with "AAAAAAA"

# GC dry-run
python nm_gc.py --dry-run

# Extract dry-run, every captured session, no LLM
python nm_extract.py --all --no-llm --dry-run

# DB inspection
python -c "import sqlite3; c=sqlite3.connect('nm.db'); print(c.execute('SELECT type,role,COUNT(*) FROM messages GROUP BY type,role').fetchall())"

# Regenerate the spec PDF
python make_architecture_pdf.py
```

## Recent commits to know

```
32f7c46  Refactor architecture.pdf: white background, academic style, platform attribution
f38d452  Add architecture.pdf — 5-page system diagram
346dd6d  Add Tier-1 sponsor integrations: Convex, Tensorlake, Vercel, Nia
231c0a9  Initial commit: NM shared memory for coding agents
```

---

## Naming (open decision)

Working name `NM` is a placeholder. Repo name `context-cloud` is leftover from an earlier idea (registry of context packs) — does not reflect the current product. 10 candidates given to user, ranked best to weakest:

1. **Memex** — V. Bush 1945 "memory extender" (recommended — historical resonance + AI-recognition)
2. **Cairn** — trail markers for those who follow (recommended — perfect metaphor, monosyllabic)
3. **Marginalia** — distinctive
4. **Lore** — warm, plain English
5. **Errata** — accurate (negative-memory framing)
6. **Hindsight** — on-the-nose
7. **Caveat** — heads-up
8. **Whetstone** — sharpens the next agent
9. **Maxim** — pithy rule
10. **Sentinel** — protective

User hasn't picked. Don't rename files or the repo until they do.

---

## Highest-leverage next move (if you only have 30 min)

Pick **one** of:
1. `npx convex dev` → set `CONVEX_URL` → smoke-test that injection rows land in Convex via the dashboard (`useQuery(api.injections.recent)`).
2. `cd dashboard && npx vercel` → set `NEXT_PUBLIC_CONVEX_URL` → get the public URL into the submission.
3. Run `python nm_gc.py --loop --interval 60` for the demo's live cron tick. Faster cadence than `*/15` so judges actually see it fire on a 3-min stage.

Do them in this order: **1 → 2 → 3**. Each unblocks the next.

The local pipeline already works end-to-end without any of these — the demo's safety floor.
<!-- End handoff. -->

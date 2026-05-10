# Context Cloud — PRD

A shared-memory + drift-detection platform for AI coding agents, built at the **Nozomio Hackathon** (May 9, 2026) on Nia, Tensorlake, Convex, and Vercel. Submitted to the **Always-On Agents** track.

> **Historical note.** The original PRD described a different product (a GitHub-shaped registry of context packs with Brain / Merge agents) that was never built. The original is preserved at [docs/history/PRD-context-cloud-aspirational-2026-05-09.md](docs/history/PRD-context-cloud-aspirational-2026-05-09.md). The original NM-half product spec is at [docs/history/NM-original-prd-2026-05-09.md](docs/history/NM-original-prd-2026-05-09.md). What shipped is the union described below.

---

## TL;DR

Three independent halves merged into one app:

- **NM** (`nm_*.py`, `tensorlake/note_manager.py`, `tensorlake/gc.py`, `dashboard/`) — watches every Claude Code session via hooks, distills hurdles into compact notes attached to the files involved, and injects relevant notes back when a future session touches those files.
- **Guardian** (`agent/`, `tensorlake/guardian_cycle.py`, `ui/`) — runs continuously over a target codebase, detects intent drift / security vulns / bugs against a structured `.md` context map, files real GitHub issues with line-precise citations, and (Plan 3) hands findings to Devin for autonomous fixing with sharpen-iteration up to 2x.
- **docs-ingest** (`docs-ingest/`) — ingests external documentation (markdown / HTML / OpenAPI / live URL) into per-line `.md` constraints under the target repo's `.context-map/library/<lib>/`, consumed by Guardian via Nia. Streams emit events to Convex for the live UI.

Plus:

- **mock_org/** — a synthetic ACME organization with five sub-products (`agent-gateway`, `connectors`, `control-plane`, `memory-graph`, `runtime-orchestrator`) and a `.nm/briefs/` corpus. Powers the Hindsight demo replay.
- **mock/** — static demo-mode HTML served by Vercel for the offline demo path.

All three share one Convex deployment (`acoustic-fish-389`) but write to disjoint table sets. Either half can run alone.

---

## Track + rubric

Submitting to **Always-On Agents** (Nia + Tensorlake). Cross-track strength on **Company Brain** (Hyperspell) was a hedge but is not on the demo path.

Rubric weights: Background Execution (30%), Statefulness (25%), Agentic Depth (20%), Demo & Presentation (10%), Judge's Personal Rating (10%).

How the architecture earns each:

| Rubric | How |
|---|---|
| Background execution | Three Tensorlake-deployed functions on different trigger types: `guardian_cycle.py` (cron every minute), `note_manager.py` (webhook from Claude Code Stop hook), `gc.py` (cron `*/15 * * * *`). Each one is observable in the live UI as it fires. |
| Statefulness | Convex is the state of record. NM also keeps SQLite locally. The Guardian's findings table dedups by fingerprint across cycles. NM's `.gc/`-style learned rejections survive restarts. Remove either store and the demo collapses on contact. |
| Agentic depth | Guardian's WAKE → PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → RECONCILE loop demonstrates plan / execute / reflect / recover. The sharpen-iteration path (re-spawn Devin with a tightened prompt up to 2x) is the visible recovery moment. |
| Demo / judge's rating | Hindsight UI: one app with Activity / Guardian / Sessions / Sources / Replay tabs, all hydrating live from Convex. Both halves' state streams in parallel without human input. |

---

## The three agents

### 1. NM Note Manager — *learn from your team's mistakes*

**Pain point.** Agent A in session 1 gets stuck on something specific to the codebase (wrong env var, deprecated internal API, project convention). User corrects it. Agent B in session 2 hits the same wall. Existing memory products (Mem0, Letta, Cursor rules, Claude memory) are per-user, per-session, or hand-authored — none capture institutional learnings across an org's agent fleet.

**What it does.**
- **Capture** — `nm_capture.py` tails Claude Code's `*.jsonl` transcripts via `UserPromptSubmit` / `PostToolUse` / `Stop` / `SubagentStop` hooks. Writes verbatim to SQLite `messages` + `content_blocks`; projects to `tool_calls` + `file_touches`.
- **Inject** — `nm_inject.py` runs on `PreToolUse` for `Read` / `Edit` / `Write` / `MultiEdit`. Looks up notes attached to the canonicalized file path; surfaces them inline.
- **Extract** — `nm_extract.py` runs the signal-scored hurdle detector ([docs/HURDLE_DETECTION_SPEC.md](docs/HURDLE_DETECTION_SPEC.md)) over a session and writes one note per hurdle. See [SCHEMA.md](SCHEMA.md) for the note + edge model.
- **Sync** — every write mirrors to Convex best-effort (≤1.5s timeout, fail-open). Convex powers the Hindsight UI in `ui/` and the legacy NM dashboard in `dashboard/`.
- **Semantic surface** — `nm_nia.py` indexes each new note in Nia and exposes `find_notes_semantic(query, limit)` as an MCP tool. Local cosine fallback if `NIA_API_KEY` is unset.

Detection is intentionally deterministic. The LLM is not asked whether the agent was stuck — only to distill an already-detected window into a note. Full algorithm in [docs/HURDLE_DETECTION_SPEC.md](docs/HURDLE_DETECTION_SPEC.md).

### 2. Guardian — *24/7 autonomous engineer that knows what your code is supposed to do*

**Pain point.** Code drifts away from documented intent. Security advisories land. Constraints in `.md` files get violated quietly. Reviews catch some; most slip.

**What it does.** Runs a cycle every minute (Tensorlake cron):

```
WAKE → PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → RECONCILE → SLEEP
```

- **PLAN** — `priorityPicks(cycleNumber, candidates, history, budget=3)` returns up to 3 file paths. Never-scanned files have `+∞` priority, then most-stale, with a `cleanScanStreak * 0.5` penalty. Plus `judgmentBudget=1` LLM-driven judgment-call pick.
- **SCAN** — `nia.readFile(path)` for each pick. Real Nia transport at `apigcp.trynia.ai/mcp` (`nia_read` / `search` / `nia_explore`); filesystem fallback on transport error or `SKIP_NIA=1`.
- **ANALYZE** — `package.json` runs `npm audit --json` and converts each advisory into a Finding. `*.ts` files go through a structured-output GPT-5 analyzer (or `mockAnalyzeFile` planted findings under `USE_MOCK_LLM=1`).
- **CRITIQUE** — programmatic citation check verifies the cited code line + the cited `.md` constraint text actually exist verbatim. An optional cheaper LLM (`gpt-5-mini`) judges confidence; below 80% confidence is dropped.
- **HANDOFF** — fingerprints the finding (`sha256([path, mdFile, mdLine, codeLine])`), dedups in Convex, files a real GitHub issue via Octokit, optionally spawns a Devin run.
- **RECONCILE** — every cycle, walks findings in `devin_running` / `pr_open` / `verifying` and transitions them based on PR/commit events. If a re-scan finds the constraint still violated after a Devin PR merged, builds a sharpened prompt referencing the previous attempt's diff + verbatim constraint citation, spawns a second Devin run. Hard cap at 2 iterations.

Original design at [docs/superpowers/specs/2026-05-09-guardian-agent-design.md](docs/superpowers/specs/2026-05-09-guardian-agent-design.md).

### 3. GC — *long-term hygiene*

Runs on Tensorlake cron `*/15 * * * *`. Three passes per run:

1. **Decay** — exponential, half-life 7 days from `last_injected_at` (or `created_at`).
2. **Merge** — Jaccard ≥ 0.6 over file sets AND cosine ≥ 0.5 over correction text → keep higher-importance, invalidate the loser with `action='merge'`.
3. **Prune** — importance < 0.10 → invalidate with `action='prune'`.

Every action writes one row to local `gc_actions` AND mirrors to Convex → live UI updates. Knobs are constants at the top of `nm_gc.py`.

---

## docs-ingest (offline)

Pipeline at `docs-ingest/`. See [docs-ingest/README.md](docs-ingest/README.md) for the full reference.

**Inputs verified end-to-end:**

| Format | Source kind | Example fixture | Chunks | Rules | Linked files |
|---|---|---|---|---|---|
| Markdown | `markdown_dir` | `fixtures/lodash/security-advisories.md` (lodash GHSA) | 4 | 7 | `src/lib/db.ts` |
| HTML | `html_url` (`file://` or HTTP) | `fixtures/express/security-best-practices.html` | 6 | 13 | 6 demo-target files |
| OpenAPI | `openapi_spec` (YAML/JSON) | `fixtures/openapi/payments.yaml` | 3 | 22 | 6 demo-target files |
| Live URL | `--from-url` ad hoc | any GHSA / markdown / HTML URL | — | — | scoped via `applies_to` |

Each emitted leaf has a numbered body where every line stands alone as a complete imperative — Guardian's `verifyConstraintCite(mdFile, line, text)` accepts byte-identical citations.

When `CONVEX_URL` is set, every emit streams a row to the `docsIngestRuns` table; the UI subscribes and updates live.

---

## Sponsor stack

| Sponsor | Role |
|---|---|
| **Nia** | Indexing + semantic search MCP. Every retrievable source goes through Nia (`nia_read`, `search`, `nia_explore`). Filesystem fallback for offline demo. |
| **Tensorlake** | Hosts `guardian_cycle.py` (cron), `note_manager.py` (webhook), `gc.py` (cron). Three trigger types is a deliberate rubric play. |
| **Convex** | State of record (Guardian: `cycles / findings / devinRuns / events / docsIngestRuns / fileScanHistory`; NM: `sessions / notes / files / noteFiles / hurdles / injections / gcActions`; UI: `agentEvents / dashboard / libraries / seed / users`). Reactive subscriptions power the UI. |
| **Vercel** | Hosts `ui/` (Hindsight) and `dashboard/` (legacy NM dashboard). The static `mock/` is the offline demo fallback. Submission requires a deployed URL — localhost is not valid. |
| **Codex / OpenAI** | NM extractor (`nm_extract.py`) and Guardian analyzer (GPT-5) + critique (`gpt-5-mini`). |

Not used / cut for scope: **Hyperspell**, **InsForge**, **Aside**, **Reacher**.

---

## Demo arc (3 minutes)

A split-screen of NM and Guardian running live, narrated as Hindsight.

| Time | What's on screen |
|---|---|
| 0:00–0:30 | Setup: "Coding agents in your team keep making the same mistake. Plus their codebase keeps drifting from intent. Hindsight covers both." Open the Hindsight UI on the ACME mock_org. |
| 0:30–1:15 | Open Sessions tab. A captured session shows the hurdle → note pipeline live. Replay tab scrubs through the events that produced the note. |
| 1:15–2:00 | Switch to Guardian tab. Cycle ticks (cron). PLAN picks a file. SCAN via Nia. ANALYZE flags a violation. CRITIQUE passes. HANDOFF files a GitHub issue with citation. Devin spawned. |
| 2:00–2:45 | GC tick fires. Activity feed shows decay → merge → prune stats. Devin PR opens. RECONCILE catches it. Re-scan confirms resolution. |
| 2:45–3:00 | Pitch: *"Three always-on agents on Tensorlake. NM learns from your team's mistakes. Guardian keeps your code aligned with its intent. GC keeps the graph clean. Built on Nia. Your coding agents finally remember."* |

---

## Real risks

- **LLM non-determinism breaks the demo arc.** The NM "without us" failure must reproduce. Pre-test exact prompts 50+ times. Lock the prompt that works in both directions.
- **Background execution must be visible.** Don't just describe schedules — schedule a real cycle/cron during the demo and let judges see it fire. A live cron tick with a visible activity-feed entry beats any slide.
- **Statefulness has to be load-bearing.** The rubric explicitly tests whether removing memory breaks the demo. Demonstrable: reject a GC suggestion, run GC again, watch it skip; restart the agent, see findings still dedup.
- **Agentic depth means recovery, not just multi-step.** The Guardian sharpen-iteration is the visible recovery; show it.
- **Operators look like decoration without metrics.** Each agent needs one on-stage stat with a real number behind it. NM: "47 injections in last 15 min." GC: "23 notes pruned, 47 retained, average injection 280B." Guardian: cycle count + open findings.
- **Dual-stack fragility.** Two languages, two dashboards, one Convex. Pre-warm everything before the demo. Either half can run alone, but the split-screen narrative needs both up.
- **Privacy from judges.** Org-scoped, runs in their own MCP server / Tensorlake account, nothing leaves the boundary.

---

## What did not ship

- Notes-to-notes edges (clusters / supersedes / references) in NM — bipartite-only for v1.
- Multi-org NM — single-org demo (the synthetic ACME org).
- Auth / SSO on the dashboards — public read-only for v1.
- Hyperspell integration — cut for time.
- Symbol-level file keying for notes — v1 uses canonical file paths only.
- Public registry of notes / packs — the "Context Cloud registry" framing in the original PRD was never built.
- Guardian against multi-repo targets — single demo target (`NewCoder3294/demo-target`).
- GitHub App / OAuth for Guardian (uses a PAT with a swap path).

# NM — Shared Memory for Coding Agents in an Org

> Working name. Rename later. This doc is the single source of truth for the project; paste it into a fresh agent and it should be enough to act.

## TL;DR

Coding agents repeat the same mistake across sessions because they have no shared memory. NM is an MCP server that watches every coding session in an org, distills the moments the agent got stuck into compact **notes**, attaches each note to the **files involved**, and injects the relevant notes back into any future agent session that touches those files. Three always-on agents maintain the system: a Note Manager that produces and serves notes, a GC that prunes the graph, and a Guardian that filters what gets injected so context stays clean.

One-liner: **a shared brain for your team's coding agents — they learn from each other's mistakes, not just their own.**

---

## Track and rubric

Submitting to **Always-On Agents** (Nia + Tensorlake) at the Nozomio hackathon (May 9, 2026). Submissions close 6:00pm.

Rubric weights: Background Execution (30%), Statefulness (25%), Agentic Depth (20%), Demo & Presentation (10%), Judge's Personal Rating (10%).

Why this idea fits:
- **Statefulness is load-bearing by construction.** The note graph *is* the product. Remove it and there is literally nothing to inject — the demo dies. The rubric explicitly tests this.
- **Three different background-execution triggers.** Note Manager runs on stream events, GC runs on a schedule, Guardian runs on injection events. Judges score "background execution" higher when triggers are varied, not all-cron.
- **Agentic depth via visible recovery.** Guardian rejecting a noisy injection mid-session, GC pruning a stale cluster, Note Manager retrying when extraction fails — all on-stage proof of plan/execute/reflect/recover.

Cross-track strength on **Company Brain** (Hyperspell): the system synthesizes across an org's coding sessions. The top-6 finals are track-agnostic so this is a hedge worth having.

---

## The pain point

Every engineering team that uses coding agents has the same observed failure mode: agent A in session 1 gets stuck on something specific to the codebase (wrong env var, deprecated internal API, project convention the agent doesn't know). The user corrects it. **Agent B in session 2 hits the same wall.** Existing memory products (Mem0, Letta, Cursor's `.cursorrules`, Claude Code memory) are per-user, per-session, or hand-authored — none capture institutional learnings across an org's agent fleet.

Adjacent products solve different problems:
- Glean / Hyperspell / Dust / Notion AI synthesize *static* company data into chat answers. They don't watch live coding sessions.
- Mem0 / Letta store *positive* memory primitives ("the user prefers X"). They don't capture *negative* memory ("don't do Y here, here's why").
- Cursor rules and Anthropic Skills are hand-authored capabilities. They don't *learn* from sessions.
- A2A protocol handles task handoff between agents, not knowledge sharing.

NM sits in this gap: live-session-derived, file-keyed, cross-agent, cross-session, org-scoped negative memory.

---

## Architecture

```
                       ┌──────────────────┐
                       │   Note Graph     │
                       │ (bipartite:      │
                       │  files ↔ notes)  │
                       │                  │
                       │   ┌────┐         │
                       │   │ GC │         │
                       │   └────┘         │
                       └────┬─────────────┘
                  read/write│       ▲
                            │       │ filtered
                            ▼       │ injection
                       ┌────────────┴─────┐         ┌──────────────┐
                       │  Note Manager    │────────▶│   Guardian   │
                       │                  │         │    Agent     │
                       │ • analyzes chat  │         │              │
                       │   to find notes  │         │ pre-injection│
                       │ • attaches notes │         │ quality gate │
                       │   to files       │         └──────────────┘
                       │ • serves         │
                       │   injections     │
                       └─┬─────────────▲──┘
            full context │             │ relevant notes
                streamed │             │ injected into context
                         ▼             │
                       ┌──────────────────┐
                       │   MCP Server     │
                       └─┬─────────────▲──┘
                         │             │
                         ▼             │
                    ┌──────────────────────┐
                    │  Coding Agent / User │
                    │  (Cursor / Claude    │
                    │   Code / Codex /…)   │
                    └──────────────────────┘
```

Layers, top-down:
1. **Note Graph** — bipartite store of files ↔ notes with importance scores. Persistent. The state of record.
2. **GC Agent** — runs on a schedule over the graph. Prunes stale notes, merges duplicates, decays importance. Long-term hygiene.
3. **Note Manager** — the synchronous core. Reads chat stream, extracts notes, attaches to files, serves notes back when files are touched.
4. **Guardian Agent** — runs on each injection event. Filters which notes are worth injecting *right now* given the current session. Per-call relevance + conflict + budget. Short-term hygiene.
5. **MCP Server** — the only contact surface with the user's coding agent. One integration point covers Cursor, Claude Code, Codex, and any other MCP-speaking agent.
6. **Coding Agent / User** — the consumer. The agent the user is actually working with.

---

## Components in detail

### Note Manager (synchronous core)

Triggered by: every event from the MCP stream.

Three jobs:

1. **Ingest.** Receive streamed chat events from the MCP server, append to a per-session log.
2. **Extract.** When a session ends or hits a "stuck" signal (see below), analyze the log to find hurdles and write notes. Each hurdle becomes one note attached to the files involved.
3. **Serve.** When a coding agent calls `get_relevant_notes(file_paths)` via MCP, look up notes attached to those files, hand them to Guardian for filtering, return the survivors.

State: latest extraction job per session, per-session chat log, in-flight injection requests.

### GC Agent (long-term hygiene)

Triggered by: schedule (e.g., every 15 min during demo) + on-publish events.

Jobs:
- Decay importance scores over time. Notes that haven't been injected or referenced lose weight.
- Merge duplicates (notes with overlapping file sets and similar content).
- Prune notes below threshold importance.
- Maintain a per-org budget on graph size.
- Log every prune/merge to the activity feed for on-stage proof.

State: GC run history, last-pruned timestamps per note, learned rejection rules (`.gc/rules.md`-style — see **Statefulness as a feature** below).

### Guardian Agent (short-term hygiene)

Triggered by: every `get_relevant_notes` call from the MCP server.

Jobs:
- Score each candidate note's relevance to the *current* session's recent context (not just the file path match).
- Resolve conflicts when two notes contradict each other (pick by recency + importance + Guardian-learned preference).
- Enforce a per-injection token budget — top-K by composite score.
- Reject notes flagged as session-irrelevant even if file matches.
- Log every accept/reject decision to the activity feed.

State: per-session injection log, learned filtering rules.

### Note Graph

Bipartite: **files** on one side, **notes** on the other, edges between them with weights.

Schema (notes):
```yaml
id: <uuid>
files: ["<path>", ...]
symptom: "What the agent did wrong, in one sentence."
root_cause: "The project-specific reason it was wrong."
correction: "What the agent should do instead."
created_at: <ts>
created_from_session: <session_id>
importance: <float 0..1>
last_injected_at: <ts | null>
inject_count: <int>
```

Edges (file ↔ note) carry a relevance weight per file (a note may attach to 3 files but matter most to 1).

**Notes-to-notes edges are out of scope for v1.** The "graph" framing is honest — it's a bipartite graph today. Notes-to-notes (clusters, supersedes, references) is v2. Don't build it now.

### MCP Server (the contact surface)

Exposes to the coding agent:
- `record_event(event)` — the agent reports chat turns, tool calls, tool errors, edits-to-agent-output. Streamed to Note Manager.
- `get_relevant_notes(file_paths)` — called by the agent before reading or writing a file. Returns Guardian-filtered notes for those paths.
- `feedback(note_id, useful: bool, reason?)` — the agent (or user via the agent) reports whether an injected note was useful. Feeds GC and Guardian learning.

System-prompt addendum (delivered via MCP server prompt) instructs the agent to:
- Call `record_event` on each turn.
- Call `get_relevant_notes` before any `read_file` / `edit_file` operation.
- Surface injected notes visibly to the user.

For the demo today, also expose:
- `__inject_test(file_path, message)` — debug-only path used in the first end-to-end smoke test (e.g. injecting "AAAAAAA" when `TEST.md` is touched). Remove or gate before submission.

---

## What gets streamed

Not "the entire chat" raw. Specifically:
- **User messages** (full text)
- **Agent messages** (full text)
- **Tool calls** the agent made (name + args + abbreviated result)
- **Tool errors** (full text — high signal)
- **User edits of agent output** (full diff — highest signal of "the agent was wrong")
- **Explicit corrections** (user messages matching "no", "wrong", "actually", "instead", regex-classified)

Stored locally for now (file or SQLite). Later: org-scoped Convex deployment.

Privacy note for the pitch: org owns the data, runs in their MCP server, nothing leaves their boundary. One slide bullet, pre-empts the question.

---

## Hurdle detection — concrete signals, not vibes

The Note Manager decides "this is a hurdle worth a note" using a scored combination of:

1. **User reverted the agent's diff** within N turns of it being applied.
2. **Tool error → retry loop** — the same tool call fails ≥2 times in a row.
3. **User correction phrase match** — "no", "that's wrong", "actually", "instead, do X", "stop", "not quite", classified by a small LLM call.
4. **User re-asked a similar prompt** — semantic similarity > threshold to a recent prompt.
5. **Agent's last message was heavily edited before commit** — diff size > threshold.
6. **Explicit `feedback(useful=false)`** call.

A hurdle fires when a weighted sum of these crosses a threshold. **Do not** ask an LLM "was the user stuck?" — too non-deterministic for the demo and impossible to debug.

---

## Lifecycle

1. Developer connects their coding agent (Claude Code / Cursor / Codex) to the org's NM MCP server. One config line.
2. Developer starts working. Every chat event streams to the Note Manager.
3. At some point Agent A gets stuck — say, hardcodes a fake API URL because it didn't know the project's env-var convention. User corrects it: "no, we use `INTERNAL_API_BASE`, never hardcode." Diff reverted.
4. Hurdle signals fire (reverted diff + correction phrase + tool error during the failed run). Note Manager extracts a note: `{ files: ["api/client.ts", ".env.example"], symptom: "hardcoded API URL", root_cause: "all backend URLs use INTERNAL_API_BASE env var", correction: "read from process.env.INTERNAL_API_BASE" }`.
5. Note attached to the graph. Importance seeded by hurdle severity (number of signals fired, time spent stuck).
6. Hours later Agent B (different developer, possibly different agent vendor) opens `api/client.ts`. Agent B's `read_file` tool call goes through the MCP server. NM resolves: file matches → fetch candidate notes → Guardian filters → returns the note inline with the read result.
7. Agent B sees the note in its context, does the right thing on the first try, never hardcodes the URL.
8. GC runs on schedule. The note's `last_injected_at` updates, importance bumps. Stale unrelated notes from weeks ago decay below threshold and get pruned. Activity feed shows: "GC pruned 23 notes, retained 47, average per-file injection budget 280B."

This loop is the demo.

---

## Demo arc (3 minutes)

**0:00–0:30** — Setup. "Coding agents in a team keep making the same mistake. Here's a shared memory layer that fixes that." Show the architecture diagram (this doc's ASCII version is fine).

**0:30–1:30** — Live capture. Open Coding Agent A connected to NM. Run a prompt that reliably trips a project-specific gotcha (pre-tested). Watch the agent fail, the user correct it. Activity feed shows hurdle detected → note created → graph updated. Open the note panel — show the 4-field note that was just written.

**1:30–2:15** — Live retrieval. Open Coding Agent B (different vendor, different session, same NM org). Run a prompt that touches the same file. The injection visualizer pops the note as Agent B's `read_file` resolves. Agent B nails the answer on the first try. **The "without us" comparison must also be on screen** — same prompt, NM disconnected, agent fails the same way Agent A did. The contrast is the proof.

**2:15–2:45** — Background execution and statefulness payoff. GC fires on cron, prunes a note cluster live. Show the activity feed updating. Show the importance scores changing. Show the per-injection budget metric. ("47 notes retained, 23 pruned in the last 15 minutes, average injection 280B.")

**2:45–3:00** — Pitch line. *"Three always-on agents. Note Manager learns from your team's mistakes. GC keeps the graph clean. Guardian keeps every injection sharp. Built on Nia and Tensorlake. Your coding agents finally remember."*

---

## Statefulness as a feature

The rubric explicitly tests whether the system has memory that survives. Three places where state is load-bearing:

1. **The note graph itself.** Without it, no injection. Demo dies.
2. **`.gc/rules.md`-style learned GC preferences.** When a maintainer rejects a GC prune (via `feedback`), GC writes the rule and skips that pattern next time. Demoable: reject once, run GC again, watch it skip. This is what "statefulness as load-bearing" looks like in practice.
3. **Guardian's per-session injection log.** Used to avoid re-injecting the same note repeatedly in a session, and to learn which notes are useful for which session shapes.

---

## Sponsor stack

- **Nia** — semantic search over notes when file-key match alone isn't enough (e.g., "user is asking about X but no file matches; do any notes match X semantically?"). Every retrieval that isn't direct file-key goes through Nia.
- **Tensorlake** — runs Note Manager, GC, and Guardian as background sandboxed processes. Triggered by stream events (Note Manager), schedule (GC), and injection events (Guardian) — three different trigger types is a deliberate rubric play.
- **Convex** — the note graph state, the activity feed, the live UI updates. Real-time reactivity is what makes the on-stage activity feed update live during the demo.
- **Vercel** — dashboard hosting (note graph viewer, activity feed, injection visualizer). Submission requires a deployed URL — localhost is not valid.
- **Codex** — one of the demo agents. The other should be Claude Code or Cursor for vendor diversity.
- **Hyperspell** — used optionally to enrich notes with broader org context (Slack discussions about the file, related tickets). Cross-track hedge for Company Brain. Cut for time if it's not on the critical path.

InsForge: not used (overlaps with Convex). Reacher / Devin / Aside: not used.

---

## Today's build scope (in order)

This is what we're shipping today. Anything not on this list is v2.

1. **Local MCP server** that:
   - Streams chat events from a connected agent to a local file/SQLite.
   - Exposes `get_relevant_notes(file_paths)`.
   - For the smoke test: injects the literal string `AAAAAAA` when the agent touches `TEST.md`.
2. **Real Note Manager extraction.** Replace the smoke-test injection with hurdle-detection + note creation from the streamed chat. Hard-coded signals first, LLM-based extraction second.
3. **Note Graph storage.** Convex schema for files, notes, edges. Persistent across runs.
4. **Guardian filter.** Per-injection scoring + budget. Start with cosine relevance + recency, then add conflict resolution if time.
5. **GC scheduled job.** Run every N minutes on Tensorlake. Prune by decayed importance. Log to activity feed.
6. **Dashboard.** Vercel-deployed Convex UI with: note graph view, activity feed, injection visualizer, per-agent live note panel.
7. **Two demo agents wired up.** Codex + Claude Code (or two Claude Code instances). Pre-tested prompts for the failure → correction → injection loop.

Out of scope today:
- Notes-to-notes edges in the graph
- Multi-org support
- Auth / SSO
- Public registry of notes (we're scoping to a single org for the demo)
- Hyperspell integration unless time allows after step 7

---

## Known risks

- **MCP doesn't stream chat natively.** The agent has to actively call `record_event`. The MCP server's prompt must instruct the agent to do so. This may be unreliable depending on the agent's compliance. Mitigation: also intercept tool calls (Read/Write/Edit) — those alone give us most of the signal.
- **Hurdle detection may over- or under-fire.** Tune thresholds with one or two real prompts before the demo. Keep the signals simple and inspectable.
- **Injection volume can pollute context.** Guardian's per-call budget is the answer; demonstrate the without-Guardian failure mode briefly to make Guardian look load-bearing.
- **The "without NM" failure side has to be reproducible.** Pre-test the exact prompt 20+ times. If it doesn't reliably fail without NM, the demo's contrast collapses.
- **Two-agent setup is fragile live.** Have the second agent's session pre-warmed and visible before the demo starts. Don't authenticate live.
- **Privacy concern from judges.** "You're streaming all our chat?" Have the slide answer ready: org-scoped, local, never leaves boundary.

---

## Pitch line

> Coding agents in your org keep making the same mistake. NM gives them institutional memory — three always-on agents that watch every session, distill the hurdles into compact notes, and inject them right back into the next agent that opens the same file.

---

## Where to look

- [CLAUDE.md](CLAUDE.md) — operating guidance for Claude Code in this repo. Still applies.
- [Nozomio Hackathon Guide.md](Nozomio%20Hackathon%20Guide.md) — event details, sponsors, judging.

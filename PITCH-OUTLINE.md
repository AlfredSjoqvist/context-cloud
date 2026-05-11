# PITCH-OUTLINE.md — talking points for the Hindsight pitch

Three durations, one product. Use [DEMO.md](DEMO.md) for the live runbook.

The three pitches share a common thesis:

> **AI coding agents are productive but blind to two things: invariants
> they should be enforcing, and moments they're getting stuck. Hindsight
> ships shared, line-cited memory + drift detection on top of one Convex
> deployment so a team's agents stop relearning the same lesson.**

---

## 90-second pitch (judges' table, hallway, demo bay)

**0–15s — open with the pain.**
"Every coding agent on every team is making the same five mistakes this
week that the same agents made last week. Nobody is closing the loop."

**15–35s — what we built.**
"Hindsight is a shared memory + drift-detection layer for AI coding
agents. It does two things. One: every agent on the team gets the note
the previous agent wrote when it touched this file. Two: a Guardian
agent watches the codebase against line-cited constraints — not vibes,
not guesses — and files real GitHub issues when the code drifts."

**35–55s — proof point.**
[Open Hindsight UI on Guardian tab.] "This is a real cycle. PLAN, SCAN,
ANALYZE, CRITIQUE, HANDOFF. Click the finding. The constraint citation
points at a specific line in a specific markdown file in our context
library. Open the line. The rule is real."

**55–75s — close with the moat.**
"This isn't a wrapper around the model. It's the institutional memory
layer between the model and the codebase. It compounds: every session
the team runs makes every future session better."

**75–90s — ask.**
"We need: design partners with five+ engineers running coding agents
daily. We have one Convex deployment, two halves wired, and a working
demo right now."

---

## 5-minute pitch (sponsor meeting, sit-down judging round)

### Opening (45s) — the problem is institutional amnesia
- Coding agents are accelerating individual engineers but degrading
  team-level learning.
- A single agent never benefits from what last week's agent learned.
- This is not a model problem. Better models keep making the same
  five mistakes per week per repo.
- Two failure modes: **drift** (agent ships code that violates a
  constraint nobody told it about) and **stuckness** (agent thrashes
  on a problem someone already solved).

### What we built (90s) — two halves, one memory layer
- **Guardian** (TypeScript, agent/, convex/, ui/) — periodic cycle:
  PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → RECONCILE. Findings
  carry line-precise constraint citations, are dedup-fingerprinted,
  and file real GitHub issues that hand off to Devin (or similar).
- **NM** (Python, nm_*.py) — captures every Claude Code session,
  detects "hurdles" (signal-scored windows where the agent got stuck),
  distills 4-field notes, and injects the most relevant note when a
  future agent touches the same file.
- One Convex deployment, disjoint write tables, both halves visible
  in one Hindsight UI.
- The Guardian and NM halves were built in parallel and merged on the
  hackathon weekend. Either side runs alone.

### Live demo (2 min) — see [DEMO.md](DEMO.md)
- Trigger one Guardian cycle against `mock_org/agent-gateway`.
- Click a finding. Show the line-cited rule.
- Touch a file. Show the inject feed deliver a relevant prior-session note.
- Show the GC pane. Memory you never forget becomes memory you can't trust.

### Why this wins (60s) — compounding
- Better models keep being released; the value of *what your team has
  already learned about this codebase* grows monotonically with usage.
- Agents that share memory become smarter together than the smartest
  individual agent. Agents without shared memory have a flat ceiling.
- The Guardian's constraint library + NM's hurdle archive together
  form a moat that is *not in the model weights*.

### Ask (30s) — design partners
- Five+ engineers running coding agents daily.
- We help wire Hindsight to your repos and your stack in <1 day.
- Three months of data → a measurable reduction in the same-bug-twice
  rate. We bring the analytics; you bring the repos.

---

## Q&A — preempted answers

### "Isn't this just a glorified linter?"
> A linter checks syntax and known patterns hard-coded in a binary.
> Hindsight's constraints are markdown files written by your team,
> ingested from your real documentation (Stripe webhook security
> guide, your internal RFCs, Express security best practices), and
> updated as your team's understanding evolves. A linter doesn't
> handoff to Devin to fix what it found. Hindsight does.

### "How do you avoid Guardian flooding us with low-signal findings?"
> Three layers: per-finding **fingerprint dedup** (sha256 of path + cited
> line + cited rule); a **CRITIQUE step** that drops findings the LLM
> can't defend; and **citation verification** that rejects any finding
> whose cited rule text doesn't match the actual `.md` file byte-for-byte.
> The eval suite (`bash evals/run_all.sh`) blocks anyone from shipping
> a constraint that breaks citation precision.

### "How is NM different from a vector DB of past prompts?"
> NM doesn't index prompts. It detects *hurdles* — moments scored from
> seven independent signals (action-bigram loops, retry storms,
> reverted edits, correction phrases, prompt re-asks, feedback,
> interrupts) — and the LLM only ever sees the windows around those
> hurdles. The output is a 4-field note keyed by file path. When a
> future agent touches that file, it gets the note. We're not asking
> the model to grep history.

### "Won't notes go stale?"
> Yes — that's why GC exists. Notes have a `seed_importance` score
> that decays unless the note is re-injected (i.e. the agent finds it
> useful again). Decay → merge (similar notes collapse) → prune (low
> importance + not re-injected = gone). The GC tab shows actions live.

### "What about privacy / secrets in captured sessions?"
> NM redacts at capture time (per `nm_signals.py` + `nm_extract.py`)
> and the secrets/redaction-completeness rule in our own constraint
> library forces the same discipline on any service that persists
> tool events. Anything that slips through is a Guardian finding the
> next cycle catches.

### "Can we use this without the LLM costs?"
> Yes — Guardian has a `USE_MOCK_LLM=1` flag that exercises every
> phase of the cycle on planted findings, sufficient for end-to-end
> integration testing and demos. NM has a SQLite-only fallback path
> that doesn't touch the LLM. Both halves degrade gracefully.

### "What's the ask vs. what's already shipped?"
> Shipped: the merged tree on `main`, one Convex deployment, both
> dashboards, the Guardian cycle running real findings against
> `mock_org/`, the NM hooks running on Claude Code, an eval suite
> that pins the citation contract, and DEMO.md + SETUP.md. Ask:
> design partners. Not money, not engineers, not dev hours — repos
> with real engineers using real coding agents.

---

## Don't say

- "We do RAG over your codebase." (We don't, and the conflation is
  damaging.)
- "Powered by GPT-5." (The model is replaceable; the data layer is
  the moat.)
- "100% reliable." (Citation precision is bytewise verified; nothing
  else is.)
- "Better than Cursor." (We're orthogonal; Cursor would benefit from
  Hindsight.)

# Agent 4 (Demo + Content + Evals) — Worklog

Owner: Agent 4 (Claude Opus 4.7, ralph loop)
Scope (touch only): `.context-map/library/`, `README.md`, `SETUP.md`, `DEMO.md`,
demo runbook, `evals/`, pitch deck markdown.
Do NOT touch: `convex/`, `agent/`, `mcp-server/`, hook scripts, install CLI,
`mock/`, `dashboard/`, `ui/`, `PRODUCT.md`, `DESIGN.md`.

---

## Iteration 1 (current) — bootstrap evals + worklog

**Goal**: first real, run-on-CI eval that proves NM hurdle scoring works.
Specifically, the threshold rule from `nm_signals.py` (`HURDLE_THRESHOLD = 3.0`)
and the cluster-gap rule from `nm_extract.py` (`SIGNAL_CLUSTER_GAP = 12`).

**Plan**:
1. `evals/README.md` — what evals exist, how to run, what each one proves.
2. `evals/run_all.sh` — orchestrator. Returns 0 iff every eval passes.
3. `evals/test_hurdle_threshold.py` — `unittest` suite. Pure-Python; no
   pytest dep. Imports `nm_extract.expand_windows` and `nm_signals.Signal`,
   feeds synthetic event/signal pairs, asserts behaviour at boundaries.
4. Verify by mutating `HURDLE_THRESHOLD` locally → eval must fail.
   Restore. Commit.

**Why this first**: The whole NM pitch ("we know when an agent gets stuck")
collapses if hurdle scoring is wrong. A regression here is the worst possible
silent failure. No eval here = no proof.

---

## Log

### 2026-05-10 — Iteration 1

- **5d91938** `test(evals): bootstrap eval harness with NM hurdle threshold suite`
  - `evals/README.md`, `evals/run_all.sh`, `evals/test_hurdle_threshold.py`,
    `WORKLOG-content.md`.
  - 11 tests, all pass. Self-test confirmed: dropping
    `HURDLE_THRESHOLD` to 0.5 → 3 failures; flipping `<= SIGNAL_CLUSTER_GAP`
    to `<` → 4 failures. The eval has bite.
  - Surprise: stale `__pycache__` survived a `sed -i ''` rewrite during one
    self-test run. `run_all.sh` now nukes `__pycache__` before every run.

**Left to do (next iterations, in priority):**
1. First real `.context-map/library/` constraint set covering `mock_org/agent-gateway/src/api/auth.ts` (auth bearer-token validation
   missing in stub) and `mock_org/agent-gateway/src/api/rateLimit.ts`
   (in-memory bucket — won't survive multi-instance deploy).
2. Second eval: Guardian citation precision — bytewise verify
   `mdFile:line:text` matches the actual file. Lives in `evals/`, exercises
   real `.context-map/library/` content from step 1.
3. Third eval: NM GC pruning — pruned notes are removed from injection
   surface; `gcActions` records the right operation.
4. `DEMO.md` 3-minute runbook + `SETUP.md` clean-clone path.
5. Pitch deck outline (`docs/PITCH.md` is out of scope; root-level
   `PITCH-OUTLINE.md` is in scope).

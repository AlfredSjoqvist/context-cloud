# Agent 4 (Demo + Content + Evals) — Worklog

Owner: Agent 4 (Claude Opus 4.7, ralph loop)
Scope (touch only): `.context-map/library/`, `README.md`, `SETUP.md`, `DEMO.md`,
demo runbook, `evals/`, pitch deck markdown.
Do NOT touch: `convex/`, `agent/`, `mcp-server/`, hook scripts, install CLI,
`mock/`, `dashboard/`, `ui/`, `PRODUCT.md`, `DESIGN.md`.

---

## Iteration 2 (current) — first real constraint files + citation eval

**Goal**: Make the Guardian half of the demo *real*. Two constraint files
(`auth/credentials-required.md`, `secrets/redaction-completeness.md`) plus
a Python eval (`evals/test_citation_precision.py`) that enforces the
line-precise-citation contract from `agent/tools/niaClient.ts`.

**Plan**:
1. `.context-map/library/auth/credentials-required.md` — 5 numbered rules.
   Targets `mock_org/agent-gateway/src/api/auth.ts` which currently returns
   `{ ok: true }` with no credential check.
2. `.context-map/library/secrets/redaction-completeness.md` — 4 rules.
   Targets `mock_org/agent-gateway/src/lib/redaction.ts` which only redacts
   by KEY pattern, not by VALUE pattern; bearer tokens leak when they ride
   in a non-secret-named field (e.g. `command: "curl -H ..."`).
3. `evals/test_citation_precision.py` — for every numbered rule line under
   `.context-map/library/`, assert: (a) it's a single line, (b)
   `verifyConstraintCite`-equivalent byte-equality holds (file:line.trim()
   == rule_text.trim()), (c) frontmatter `applies_to` globs are non-empty
   strings, (d) no rule contains a soft-wrap (no trailing whitespace +
   continuation).
4. Verify with self-test: hard-wrap a rule across two lines → eval fails.

**Why this**: Guardian's whole pitch — "every finding cites a specific
line in a specific .md, and a third party can verify it" — collapses if
constraints don't actually pass `verifyConstraintCite`. Today there are
zero `.context-map/library/` files in the canonical seed. The eval pins
the contract from now on so future authors can't accidentally write a
constraint that breaks Guardian.

---

## Iteration 1 — bootstrap evals + worklog

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

### 2026-05-10 — Iteration 2

- **e6764a9** `feat(context-map): seed auth + secrets library leaves`
  - `.context-map/library/auth/credentials-required.md` (5 rules)
  - `.context-map/library/secrets/redaction-completeness.md` (4 rules)
  - Each rule single-line and citable byte-for-byte. Verified by hand
    against `mock_org/agent-gateway/src/api/auth.ts` and
    `src/lib/redaction.ts` — both leaves contain rules currently
    violated by the demo target, so Guardian will produce real findings
    next time it scans.
- **32bc28d** `test(evals): add citation precision eval enforcing verifyConstraintCite contract`
  - `evals/test_citation_precision.py` — 6 tests. Self-test verified
    on trailing-whitespace and soft-wrap mutations (both turn red).
  - Total eval suite is now 17 tests across 2 files; both pass.

**Left to do (next iterations, in priority):**
1. Rate-limit constraint covering `mock_org/agent-gateway/src/api/rateLimit.ts`
   (in-memory `Map`, no decay, no eviction). Plus DB constraint family
   (transactions, idempotency keys, prepared statements) and observability
   (structured logs, no `console.log` in handlers).
2. NM GC pruning eval — pruned notes are removed from injection surface;
   `gcActions` records the right operation. Will need synthetic SQLite
   fixture; can run with stdlib `sqlite3` module.
3. `DEMO.md` 3-minute runbook + `SETUP.md` clean-clone path.
4. Pitch deck outline (root-level `PITCH-OUTLINE.md`).
5. Property test: every numbered rule in every leaf maps cleanly to
   `verifyConstraintCite` (already partially covered, but add quickcheck
   over generated rule strings).

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

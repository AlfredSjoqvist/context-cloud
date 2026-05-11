# Agent 4 (Demo + Content + Evals) — Worklog

Owner: Agent 4 (Claude Opus 4.7, ralph loop)
Scope (touch only): `.context-map/library/`, `README.md`, `SETUP.md`, `DEMO.md`,
demo runbook, `evals/`, pitch deck markdown.
Do NOT touch: `convex/`, `agent/`, `mcp-server/`, hook scripts, install CLI,
`mock/`, `dashboard/`, `ui/`, `PRODUCT.md`, `DESIGN.md`.

---

## Iteration 4 (current) — SETUP.md + db library leaf

**Goal**: Make first contact succeed (SETUP.md is a single linear path
from `git clone` to `agent:once` working) and broaden Guardian's
constraint coverage with the db family.

**Plan**:
1. `SETUP.md` — 6 numbered steps. Stops at the first thing that proves
   value (a Guardian cycle producing findings). Routes to DEMO.md.
2. `.context-map/library/db/transactions-and-migrations.md` — 6 rules
   (param binding, atomicity, no long-ops in tx, idempotency keys,
   two-deploy drops, safe NOT NULL adds). Universally applicable to
   every db/*.ts file.
3. Verify evals still green, then commit each topic separately.

---

## Iteration 3 — rate-limit constraint + 3-minute demo runbook

**Goal**: Land the rate-limit library leaf (`mock_org/agent-gateway/src/api/rateLimit.ts`
violates 3 of 5 rules) and ship `DEMO.md` so the 3-minute pitch is
reproducible from a clean clone with zero context.

**Plan**:
1. `.context-map/library/rate-limit/persistent-decay.md` — 5 rules
   (decay, no-process-local-state, eviction, 429+Retry-After,
   principal-aware key).
2. `DEMO.md` — 7 timed beats from cold start through wrap, two paths
   (live and offline), commands verbatim, "things that go wrong" table.
3. Verify: rerun `bash evals/run_all.sh` — citation eval must still
   pass on the new leaf. Walk the runbook from a fresh terminal in head.

**Why this**: Without DEMO.md, judges literally cannot reproduce the
pitch. Without the rate-limit leaf, Guardian has 2 demo files and
judges will ask "is that all you've got?". Both gaps are blocking.

---

## Iteration 2 — first real constraint files + citation eval

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

### 2026-05-10 — Iteration 4

- **7703637** `docs(setup): add 5-minute clean-clone path landing on first Guardian cycle`
  - SETUP.md, 6 numbered steps. NM is optional (step 6) so first
    contact succeeds on the Guardian half alone.
- **36a1139** `feat(context-map): add db/transactions-and-migrations leaf`
  - 6 rules. Targets `src/db/*.ts` family. Currently a stub in
    mock_org but the rules are universal — they apply the moment
    Guardian's planner promotes a real db file.

**Left to do (next iterations, in priority):**
1. observability leaf — structured logs, no `console.log` in handlers,
   correlation id propagation, metric naming convention.
2. errors / retries leaf — exponential backoff with jitter, no infinite
   retry, dead-letter discipline, no swallowed exceptions.
3. NM GC pruning eval (stdlib `sqlite3`, in-memory schema).
4. PITCH-OUTLINE.md — 90s / 5min / Q&A variants.
5. Re-walk DEMO.md with fresh eyes; tighten any beat that rereads as
   "you have to know X to follow this."
6. Verify the rules in each leaf scope correctly: write an eval that
   does `import-grep` over `mock_org/` and confirms `applies_to` globs
   match real importer files (catches stale globs).

### 2026-05-10 — Iteration 3

- **b11cd61** `feat(context-map): add rate-limit/persistent-decay leaf`
  - 5 rules. Targets `mock_org/agent-gateway/src/api/rateLimit.ts` —
    rules 1 (decay), 2 (process-local Map), 3 (eviction) all currently
    fire. Rules 4 and 5 apply at the call-site / response layer.
- **e8e59a8** `docs(demo): add 3-minute pitch runbook with timed beats + offline fallback`
  - DEMO.md, 7 timed beats. Verified the commands match `package.json`
    (`agent:once`), `vercel.json` (`outputDirectory: mock`), and
    `.env.example` env keys.

**Left to do (next iterations, in priority):**
1. SETUP.md — clean-clone path that gets you to "agent:once works"
   in <5 min. Currently the README's quickstart is split across NM and
   Guardian sections; SETUP.md should be a single linear sequence.
2. NM GC pruning eval. Use stdlib `sqlite3`; build a minimal in-memory
   schema mirroring `nm_gc.py`'s expectations and verify decay → merge →
   prune transitions on synthetic notes.
3. db / transactions library leaf — `src/db/schema.ts` is a stub;
   constraints around prepared statements, transaction boundaries,
   and migration safety are universally violated.
4. observability leaf — `console.log` in handlers, no structured fields,
   no correlation id propagation.
5. Pitch deck outline (root-level `PITCH-OUTLINE.md`).
6. Verify the DEMO.md runbook actually runs end-to-end (needs Convex
   keys; might require `NEEDS-NICOLAS.md` ask if env not available).

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

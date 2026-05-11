# Agent 4 (Demo + Content + Evals) — Worklog

Owner: Agent 4 (Claude Opus 4.7, ralph loop)
Scope (touch only): `.context-map/library/`, `README.md`, `SETUP.md`, `DEMO.md`,
demo runbook, `evals/`, pitch deck markdown.
Do NOT touch: `convex/`, `agent/`, `mcp-server/`, hook scripts, install CLI,
`mock/`, `dashboard/`, `ui/`, `PRODUCT.md`, `DESIGN.md`.

---

## Iteration 10 (current) — validation leaf + DEMO stranger-readability pass

**Goal**: One more category leaf (validation — `mock_org/agent-gateway`
has zod as a dep but never uses it) and tighten DEMO.md so a stranger
can run the demo without inferring prereqs.

**Plan**:
1. `.context-map/library/validation/schema-at-trust-boundaries.md` —
   6 rules. Rule 2 fires immediately on every `Record<string, unknown>`
   handler in mock_org/agent-gateway/.
2. DEMO.md — hoist the NM-MCP prereq for T+2:00 to the top prereqs
   list; add a "Pre-flight" sub-section that runs `bash evals/run_all.sh`
   ~1 min before going live.

---

## Iteration 9 — README evals section + metadata-consistency eval

**Goal**: Surface evals to anyone who lands on the repo (README link),
and add a structural-integrity eval that catches the most common
hand-authoring mistakes in `.context-map/library/` (copy-paste library,
mismatched rule counts, stale chunk_id).

**Plan**:
1. README.md — add SETUP/DEMO/PITCH-OUTLINE links to "Where to look"
   table; add an "Evals" section between "Tests" and "Branches".
2. `evals/test_leaf_metadata_consistency.py` — 4 structural checks:
   library matches parent dir, chunk_id format + segments, rule count
   match, source_uri contains library+topic.
3. Verify suite stays green; self-test with library mismatch.

---

## Iteration 8 — webhooks + sandbox leaves (broaden coverage)

**Goal**: Cover `mock_org/connectors/` and `mock_org/runtime-orchestrator/`
so Guardian doesn't only fire on `agent-gateway`. Both target real bugs
in real code.

**Plan**:
1. `.context-map/library/webhooks/signature-verification.md` — 6 rules.
   `connectors/src/github/webhooks.ts` calls `crypto.timingSafeEqual`
   without an equal-length check (rule 1 fires), has no replay
   timestamp window (rule 3), parses JSON without try/catch (rule 4),
   no event-id dedup (rule 5).
2. `.context-map/library/sandbox/job-resource-budgets.md` — 6 rules.
   `runtime-orchestrator/src/runtime/job_runner.py` validates upper
   memory bound but not lower (rule 1 fires).
3. Verify evals stay green.

---

## Iteration 7 — NM GC pruning eval

**Goal**: The third agent (GC) is the least visible at demo time but
the most load-bearing for the long-term pitch ("memory you never
forget becomes memory you can't trust"). Pin its decay → merge →
prune behaviour with an eval that runs in CI.

**Plan**:
1. `evals/test_gc_pruning.py` — controls `NM_DB` env var to write to
   a temp SQLite, inserts synthetic notes with backdated timestamps,
   exercises `nm_gc.{decay,merge,prune,run_once}`.
2. Self-test: set `PRUNE_THRESHOLD = 0.0` in nm_gc.py → eval fails.
3. Verify full suite stays green.

---

## Iteration 6 — globs reachability eval + pitch outline

**Goal**: Close two of the largest remaining gaps in priority order:
(a) the eval that catches stale `applies_to` globs (Guardian silently
skips dead leaves; this is the only way it surfaces), and (b) the
pitch outline so Nicolas can run the demo to a sponsor on no notice.

**Plan**:
1. `evals/test_applies_to_globs_resolve.py` — for each leaf, parse
   `applies_to`, glob each entry against `mock_org/<sub-org>/`, fail
   if zero hits across all globs. Aggregated semantics tolerate
   forward-looking globs.
2. `PITCH-OUTLINE.md` — 90s + 5min + Q&A. Shares one thesis. Includes
   a "don't say" list.
3. Self-test the eval; rerun full suite. Commit each artefact separately.

---

## Iteration 5 — observability + errors leaves

**Goal**: Two more high-impact constraint leaves so Guardian has at
least one citable invariant for every category that comes up in code
review of a service repo.

**Plan**:
1. `.context-map/library/observability/structured-logs-and-correlation.md`
   — 6 rules (no console.log, correlation ids, stable field names,
   redaction at emission, metric naming, preserve cause chain).
2. `.context-map/library/errors/retries-and-backoff.md` — 6 rules
   (full-jitter exp backoff, attempt+wall-clock ceilings, no-retry on
   caller-error 4xx, no swallowed errors, explicit timeouts, DLQ).
3. Verify evals stay green; commit each leaf separately.

---

## Iteration 4 — SETUP.md + db library leaf

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

### 2026-05-10 — Iteration 10

- **948ef66** `feat(context-map): add validation/schema-at-trust-boundaries leaf`
  - 6 rules. Multiple fires on agent-gateway `Record<string, unknown>` handlers.
- **9392ee0** `docs(demo): hoist NM-MCP prereq + add evals pre-flight check`
- Library now: 9 leaves, 47 rules. Eval suite: 5 evals, 30 tests.

**Left to do (next iterations, in priority):**
1. Cover `memory-graph/` and `control-plane/` sub-orgs.
2. Code-shape eval — for each leaf, grep at least one keyword from
   each rule body against the resolved applies_to files.
3. SETUP.md re-walk — does step 4's "expected output" actually
   match what `agent:once` prints? (Cannot verify without sponsor
   keys; flag in NEEDS-NICOLAS.md.)
4. Add a "deps" / "supply chain" leaf — pinning, lockfile commit,
   no `npm i -g` in CI, no curl-pipe-bash bootstrap scripts.

### 2026-05-10 — Iteration 9

- **b19c307** `docs(readme): link DEMO/SETUP/PITCH-OUTLINE and add Evals section`
- **45bbe68** `test(evals): add metadata-consistency eval for library leaves`
  - 4 tests; self-test verified (library mismatch → 3 of 4 fail).
- Eval suite: 5 evals, 30 tests. README now points reviewers at both
  the unit tests AND the eval suite from the front page.

**Surprise**: a single library typo trips three independent tests
(library, chunk_id segment, source_uri); that's the "defense in
depth" pattern working — multiple checks of the same invariant
catch each other's blind spots.

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV: tighten any beat that
   reads as "you have to know X" (e.g. T+2:00 still assumes the
   IDE is wired to NM MCP — call out the prereq earlier).
2. Cover `memory-graph/` and `control-plane/` sub-orgs with at
   least one constraint each.
3. Code-shape eval — for each leaf, grep at least one keyword from
   each rule body against the resolved applies_to files. Catches a
   leaf whose globs resolve but whose rules describe code shapes
   that don't exist there.
4. Add a leaf for `validation` (Zod / Pydantic schema-validation
   patterns); mock_org/agent-gateway has zod as a dep but doesn't use it.

### 2026-05-10 — Iteration 8

- **74fc508** `feat(context-map): add webhooks/signature-verification leaf`
  - 6 rules. Targets connectors. Currently 4 of 6 fire on
    mock_org/connectors/src/github/webhooks.ts.
- **74f3e61** `feat(context-map): add sandbox/job-resource-budgets leaf`
  - 6 rules. Targets runtime-orchestrator. Rule 1 fires on
    mock_org/runtime-orchestrator/src/runtime/job_runner.py.
- Library now: 8 leaves across auth, secrets, rate-limit, db,
  observability, errors, webhooks, sandbox. 41 total rules.

**Left to do (next iterations, in priority):**
1. README — add an "Evals" section pointing at `bash evals/run_all.sh`
   so reviewers see green-on-clone. Also link DEMO.md, SETUP.md,
   PITCH-OUTLINE.md from the top.
2. Re-walk DEMO.md from a stranger's POV; tighten any beat that
   reads as "you have to know X."
3. Code-cite eval — for each leaf, run a small grep against `applies_to`
   files for at least one keyword from the rule body (catches a leaf
   whose globs resolve but whose rules describe code shapes that don't
   exist there).
4. Cover `memory-graph/` and `control-plane/` sub-orgs.

### 2026-05-10 — Iteration 7

- **1fc7697** `test(evals): add NM GC pruning eval covering decay/merge/prune cycle`
  - 7 tests on synthetic SQLite (NM_DB env var). Self-test verified.
- Eval suite now: 4 evals, 26 tests. All three agents covered:
  Guardian (citation), NM hurdle scoring, NM GC, plus library
  reachability.

**Surprise**: `run_once` ran decay then prune in one cycle, so a 1.0
importance + 30d-idle note decays to ~0.052 and prunes in the same
call. Test now asserts the cascade explicitly (2 prunes, not 1).

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV; tighten any beat that reads
   as "you have to know X."
2. Add constraints for `mock_org/connectors/`, `mock_org/runtime-orchestrator/`,
   `mock_org/control-plane/`, `mock_org/memory-graph/` so coverage isn't
   100% inside agent-gateway.
3. Code-cite eval mirror — verify the hand-authored constraints' rules
   actually reference real code shapes in mock_org (not just file paths).
4. README badges + an "evals" section linking `bash evals/run_all.sh`
   so reviewers see green-on-clone.

### 2026-05-10 — Iteration 6

- **042d351** `test(evals): add applies_to-globs reachability eval`
  - 2 tests. Aggregated check: a leaf passes if at least one of its
    globs resolves under `mock_org/`. Self-test verified by pointing
    applies_to at non-existent paths.
- **69fe1e5** `docs(pitch): add pitch outline with 90s/5min variants and preempted Q&A`
  - 90s, 5min, and 7-question Q&A section + a "don't say" list of common
    mis-framings.
- Eval suite now: 3 evals, 19 tests, all green.

**Left to do (next iterations, in priority):**
1. NM GC pruning eval — synthetic SQLite via stdlib, mirror minimum
   schema from `nm_db.py`, run `nm_gc` decay→merge→prune on planted
   notes, assert pruned notes are removed and `gcActions` records
   the right ops.
2. Re-walk DEMO.md from a stranger's POV; tighten any beat that reads
   as "you have to know X" (e.g. step T+2:00 assumes IDE wired to NM
   MCP — call out the prereq earlier).
3. Re-audit recent leaves: do `mock_org/connectors/`, `mock_org/control-plane/`,
   `mock_org/runtime-orchestrator/` files have constraint coverage too?
   The aggregated `mock_org/**` glob check passes, but only because of
   `agent-gateway`. Adding constraints that target the other sub-orgs
   demonstrates breadth.
4. Code-cite eval mirror — verify the synthetic Finding fixtures the
   citation tests use also satisfy `verifyCitation` end-to-end against
   real mock_org files.

### 2026-05-10 — Iteration 5

- **a6fae85** `feat(context-map): add observability/structured-logs-and-correlation leaf`
- **9800bb7** `feat(context-map): add errors/retries-and-backoff leaf`
- 12 new rules total. Library now has 5 leaves: auth, secrets,
  rate-limit, db, observability, errors. Citation eval still green.

**Left to do (next iterations, in priority):**
1. New eval — `test_applies_to_globs_resolve.py` — verifies every
   glob in `applies_to:` matches at least one file under `mock_org/`.
   Catches stale globs as the demo target evolves.
2. NM GC pruning eval (stdlib sqlite3, in-memory schema).
3. PITCH-OUTLINE.md (90s / 5min / Q&A variants).
4. Re-walk DEMO.md from a stranger's POV; tighten any beat that
   reads as `you have to know X`.

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

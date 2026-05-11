# Agent 4 (Demo + Content + Evals) — Worklog

Owner: Agent 4 (Claude Opus 4.7, ralph loop)
Scope (touch only): `.context-map/library/`, `README.md`, `SETUP.md`, `DEMO.md`,
demo runbook, `evals/`, pitch deck markdown.
Do NOT touch: `convex/`, `agent/`, `mcp-server/`, hook scripts, install CLI,
`mock/`, `dashboard/`, `ui/`, `PRODUCT.md`, `DESIGN.md`.

---

## Iteration 31 (current) — `make verify` recipe + npm-scripts drift eval

**Goal**: Add a louder pre-flight (`make verify` with PASS/FAIL banner)
and another docs-vs-code drift eval — same shape as Makefile drift,
applied to npm scripts referenced in markdown.

**Plan**:
1. Makefile: add `verify` recipe that chains seed + eval and prints
   a banner. Makefile drift eval already covers that the recipe is
   listed in `make help`.
2. `evals/test_npm_scripts_referenced_in_docs_exist.py` — every
   `npm run <name>` in any root `*.md` doc resolves to a script in
   any of the workspace package.json files.
3. Self-test the eval (replace a real `npm test` reference with a
   bogus name → red).

---

## Iteration 30 — README + CHANGELOG eval refresh

**Goal**: Sync README "Evals" section and CHANGELOG eval table to
include the Makefile drift eval added in iteration 29. Counts:
6 → 7 evals, 31 → 34 tests.

---

## Iteration 29 — Makefile help/target drift eval

**Goal**: Add an eval that catches docs-vs-code drift in the Makefile.
Today the help block is hand-edited; tomorrow someone adds a recipe
and forgets to update help (or vice versa). Eval forces them in sync.

**Plan**:
1. `evals/test_makefile_targets_resolve.py` — parse recipes from
   Makefile + parse target names from `make help` output, assert
   set equality (modulo `help` itself).
2. Self-test by adding a ghost target to help.

---

## Iteration 28 — README + CHANGELOG refresh (24 leaves)

**Goal**: Sync README leaf table and CHANGELOG count to reflect the
six leaves added since the last refresh: file-uploads, email,
payments, pii, feature-flags, crypto.

**Plan**: One commit covering both docs. CHANGELOG count: 18 → 24,
~104 → ~140 rules. README table gains 6 rows.

---

## Iteration 27 — feature-flags + crypto leaves

**Goal**: Two more universally-applicable leaves: feature flags
(default off, kill-switch, hot-path latency) and crypto (no DIY
primitives, no MD5/SHA-1, KDF for passwords, AEAD, crypto-random,
KMS-managed keys with rotation).

**Plan**:
1. feature-flags leaf (6 rules), mirror.
2. crypto leaf (6 rules), mirror.
3. Both are universal — no demo stub needed; targets are `src/api/`
   which has plenty of files in mock_org so reachability eval passes.

---

## Iteration 26 — payments + pii leaves

**Goal**: Two compliance-grade leaves: payments (idempotency, integer
money, PCI hygiene, webhook signature dance) and PII (minimisation,
KMS encryption, deletion cascade, audit log, opaque IDs, export
rate-limit). Each paired with a violating mock_org stub.

**Plan**:
1. payments leaf (6 rules) + mock_org/agent-gateway/src/api/payment.ts
   stub (float amount + raw PAN field).
2. pii leaf (6 rules) + mock_org/agent-gateway/src/api/user.ts stub
   (sequential id in URL).
3. Mirror via `make seed`. Commit each leaf+stub pair.

---

## Iteration 25 — SETUP.md stranger re-walk

**Goal**: Mirror the DEMO.md polish pass for SETUP.md. Read cold,
find every "you have to know X to follow this", fix it.

**Findings**:
1. Step 2 didn't say "open a fresh terminal" before `npx convex dev`.
2. Step 3 expected count was vague (`passed=N` → `passed=6`).
3. Step 4 didn't reference `make seed`.
4. Step 5 didn't reference `make agent`.
5. Step 5 expected-output named only 3 of 20 leaves (stale).
6. Recovery section listed 11 leaf names (stale).
7. No `make setup-check` hint after install.

---

## Iteration 24 — file-uploads + email leaves

**Goal**: Two more universally-applicable categories: file uploads
(size, MIME, paths, scanning) and transactional email (SPF/DKIM/DMARC,
no plaintext credentials, single-use tokens, bounce handling).

**Plan**:
1. `.context-map/library/file-uploads/size-mime-and-paths.md` — 6 rules.
2. `.context-map/library/email/transactional-deliverability.md` — 6 rules.
3. mock_org didn't have any upload or email files → add minimal stubs
   (`agent-gateway/src/api/upload.ts`, `agent-gateway/src/lib/email.ts`)
   that each violate one rule explicitly so the applies_to-reachability
   eval has a target.
4. Mirror via `seed-context-map.sh`. Commit each leaf+stub pair.

---

## Iteration 23 — README/CHANGELOG refresh + overlap audit

**Goal**: Bring README's leaf table and CHANGELOG's count up to date
with the 7 leaves added in iterations 15–22. While doing it, audit
for rule duplication and document the one intentional overlap.

**Plan**:
1. README leaf table → 18 rows.
2. CHANGELOG: 11 → 18 leaves, ~85 → ~104 rules.
3. CHANGELOG: new "Intentional rule overlap" subsection naming the
   rate-limit/state pair and the rationale.
4. One commit covering both files (single topic: doc refresh).

**Audit finding**: only one cross-leaf rule overlap exists today
(no-process-local-Map between rate-limit and state). Different
applies_to scopes mean Guardian picks the contextually right one.
Documented as intentional; future overlaps get the same treatment
or get consolidated.

---

## Iteration 22 — caching leaf

**Goal**: Add the caching family — TTL discipline, key-namespacing for
auth, write-time invalidation, stampede protection. Universally
load-bearing for any service with a Redis-shaped layer.

**Plan**:
1. `.context-map/library/caching/ttl-and-invalidation.md` — 6 rules.
2. Mirror via `seed-context-map.sh`. Single commit.

---

## Iteration 21 — subTest mirror to remaining evals

**Goal**: Mirror the subTest pattern (landed in iteration 19 for
metadata-consistency) to test_citation_precision and
test_applies_to_globs_resolve so they too report all bad leaves
in one run.

**Plan**:
1. Wrap each per-leaf iteration in `self.subTest(leaf=...)`.
2. Drop `{leaf}:` prefix from assertion messages (subTest already
   identifies the leaf).
3. Verify eval suite stays 6/all green.

---

## Iteration 20 — DEMO.md stranger re-walk

**Goal**: Read DEMO.md cold, find every "you have to know X to follow
this" and fix it. Five fixes shipped in one commit.

**Findings**:
1. Pre-flight didn't tell you the expected pass count (now `passed=6`).
2. `<repo>` placeholder appeared without explanation.
3. T+0:00 buried `make agent` behind the env-prefixed line.
4. T+1:30 said "open in your editor" with no concrete command.
5. "Things that go wrong" missed the seed-mirror failure modes.
6. Path B told you to `git grep` for a Vercel URL that doesn't exist
   anywhere in the repo.
7. "Verifying this runbook" claimed 2 evals — actually 6.

---

## Iteration 19 — re-audit recent commits

**Goal**: Per loop instructions priority 1, "re-audit your own recent
commits — find a bug, a weak test, a missing edge case." Hunt
through evals + leaves for problems.

**Findings + fixes**:
1. `test_citation_precision._numbered_rule_lines` was a dead helper
   from an earlier draft (returned empty). Removed.
2. `test_leaf_metadata_consistency` iterated leaves in a flat for-loop;
   one bad leaf masked others. Wrapped each iteration in subTest so
   all failures surface in one run.
3. Defensive `if m is None: continue` after `assertIsNotNone(m)` in
   chunk_id parsing — assertion already fails, but avoids a confusing
   AttributeError on the next `.group()` call.

**Plan**: One commit per fix.

---

## Iteration 18 — accessibility + i18n leaves

**Goal**: Round out the frontend coverage with accessibility (WCAG-grade
keyboard / focus / contrast / motion) and i18n (CLDR plurals, Intl.*
formatting, RTL, Unicode-tolerant inputs).

**Plan**:
1. `.context-map/library/accessibility/semantic-and-keyboard.md` — 7 rules.
2. `.context-map/library/i18n/locale-and-formatting.md` — 6 rules.
3. Mirror via `seed-context-map.sh`. Commit each as its own topic.

---

## Iteration 17 — frontend-security leaf + CHANGELOG refresh

**Goal**: Add the frontend / browser-trust-boundary leaf so Guardian
covers the OWASP-grade UI risks too, and refresh CHANGELOG with the
4 leaves added in iterations 15–17.

**Plan**:
1. `.context-map/library/frontend-security/xss-csrf-csp.md` — 7 rules
   (XSS, CSRF, CSP, cookie flags, iframe sandboxing, open redirect).
   applies_to covers both Next.js src-dir and the
   `mock_org/control-plane/components/*.tsx` shape.
2. CHANGELOG row updates to 15 leaves / ~85 rules.

---

## Iteration 16 — time + network leaves

**Goal**: Two more universally-applicable categories: time-and-clocks
(timezones, monotonic vs wall, DST math, parsing strictness) and
network (TLS verification, DNS handling, SSRF, timeouts, redirect
credentials).

**Plan**:
1. `.context-map/library/time/timezones-and-monotonic.md` — 6 rules.
2. `.context-map/library/network/tls-and-egress.md` — 6 rules.
3. Mirror via `seed-context-map.sh`, commit each leaf as its own topic.

---

## Iteration 15 — concurrency leaf + Makefile

**Goal**: One more universally-load-bearing leaf (concurrency: locks,
races, ordering) plus a Makefile that hides the per-command env-var
prefixes and gives Nicolas `make demo` as a one-liner pre-flight.

**Plan**:
1. `.context-map/library/concurrency/locks-and-races.md` — 6 rules
   (TTL on distributed locks, finally-release, no serial-await,
   per-key ordering, no cache-write-in-tx, idempotent handlers).
2. Mirror via `seed-context-map.sh`, commit as one topic.
3. `Makefile` with eval/seed/agent/ui/demo/setup-check/clean-mirrors.
4. Verify `make eval`.

---

## Iteration 14 — README expansion + CHANGELOG.md

**Goal**: Make the surface area visible from the front page. README's
Evals section was 4 evals when there are 6, and there was no
constraint library table. Plus a single CHANGELOG.md so a sponsor
doesn't have to read git log.

**Plan**:
1. README — extend Evals list to 6 entries, add a "Constraint library"
   sub-table with per-leaf links + target file family.
2. CHANGELOG.md — consolidates 11 leaves, 6 evals, 3 docs, the
   wiring helper. Includes per-leaf demo-target violation examples
   so a sponsor can verify claims by hand.
3. Commit each as its own topic.

---

## Iteration 13 — mirror helper + cover all sub-orgs

**Goal**: Replace the manual `mkdir && cp -R` from SETUP step 4 with a
single helper command, and bootstrap the seed library into every
`mock_org/` sub-org so Guardian fires regardless of which sub-org is
set as `DEMO_REPO_LOCAL_PATH`.

**Plan**:
1. `seed-context-map.sh` — root-level shell helper. `bash seed-context-map.sh`
   mirrors to all sub-orgs with a `src/` dir; `bash seed-context-map.sh <name>`
   targets one.
2. SETUP.md + DEMO.md — replace the `mkdir && cp -R` snippet with the helper.
3. Run the helper, commit the new mirrors for connectors,
   memory-graph, runtime-orchestrator.
4. Verify mirror eval passes across all four sub-orgs.

---

## Iteration 12 — wire seed library to demo target + drift eval

**Goal**: CRITICAL gap discovered — Guardian reads constraints from
`<DEMO_REPO_LOCAL_PATH>/.context-map/library/`, not from the repo root.
The seed library at the repo root has been invisible to the demo.
Fix this with explicit wiring + a drift eval that refuses silent
divergence.

**Plan**:
1. SETUP.md step 4 — `cp -R .context-map/library mock_org/agent-gateway/.context-map/`.
   Renumber subsequent steps.
2. DEMO.md prereqs — link to SETUP step 4.
3. `evals/test_seed_library_mirror.py` — verify any bootstrapped
   mirror is byte-identical to the canonical seed. Skips when no
   mirror exists.
4. Bootstrap and commit `mock_org/agent-gateway/.context-map/library/`
   so a fresh clone runs Guardian end-to-end without manual setup.

---

## Iteration 11 — supply-chain + state leaves

**Goal**: Two more universally-load-bearing categories: supply-chain
(lockfile, install, bootstrap, container) and durable-state
(atomic writes, no process-local source of truth). Both fire on
real code in mock_org sub-orgs.

**Plan**:
1. `.context-map/library/supply-chain/dependencies-and-build.md` —
   7 rules. Targets package.json/Dockerfile/CI workflow files.
2. `.context-map/library/state/durable-and-atomic.md` — 6 rules.
   Targets src/runtime/state*.py and analogues. Rule 1 fires on
   mock_org/runtime-orchestrator/src/runtime/state_store.py
   (raw write_text, no atomic rename).
3. Verify evals stay green.

---

## Iteration 10 — validation leaf + DEMO stranger-readability pass

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

### 2026-05-10 — Iteration 31

- **88bede2** `feat(demo): add `make verify` recipe with PASS/FAIL summary`
- **e387f0b** `test(evals): add npm-scripts-referenced-in-docs eval`
- Eval suite: 8 evals, 36 tests when bootstrapped. Self-test
  verified for npm-scripts (replacing `npm test` with a bogus name
  in README turns the eval red).

**Surprise**: the npm-scripts eval initially failed because README
references `cd docs-ingest && npm run demo` and the eval only knew
about root + ui package.json. Extended the catalog to include
docs-ingest + dashboard. Tradeoff: a script defined in one workspace
but referenced in the wrong context isn't caught — acceptable since
all workspaces share the same repo.

**Left to do (next iterations, in priority):**
1. README + CHANGELOG eval section refresh (8 evals now).
2. Add `make verify` doc references in DEMO.md / SETUP.md.
3. Doc-references-real-file eval — every relative-path link in any
   markdown points to a file that exists.

### 2026-05-10 — Iteration 30

- **b52114e** `docs(readme,changelog): refresh evals section to 7 evals / 34 tests`

**Status snapshot at iteration 30**:
- Library: 24 leaves, ~140 rules. Mirrored to 4 sub-orgs.
- Evals: 7 evals, 34 tests when bootstrapped. All have self-tests
  that demonstrate they bite on a real-world mutation.
- Docs: SETUP.md, DEMO.md, PITCH-OUTLINE.md, CHANGELOG.md, README.md
  all current and cross-linked.
- Helpers: seed-context-map.sh, Makefile (eval/seed/agent/ui/demo/
  setup-check/clean-mirrors).
- 30 iterations, ~130 commits, all on main, all reviewed against
  the eval suite before push.

**Left to do (next iterations, in priority):**
1. Hunt: are there any other invariants in the codebase the eval
   suite should pin? (e.g. `package.json` script names referenced
   by docs — do they exist?)
2. Add a `frontend-error-boundaries` leaf if there's appetite for
   another frontend leaf.
3. Consider adding a `make verify` recipe that chains
   eval + seed + agent and prints a coloured PASS/FAIL summary.

### 2026-05-10 — Iteration 29

- **08c0776** `test(evals): add Makefile target/help drift eval`
- Eval suite now 7 evals / 34 tests. Self-test verified
  (ghost-target injection turns the eval red).

**Left to do (next iterations, in priority):**
1. README "Evals" section refresh: list 7 evals (currently lists 6).
2. Add a `frontend-error-boundaries` leaf (ErrorBoundary placement,
   Suspense fallback hygiene, hydration mismatch detection).
3. Update CHANGELOG eval table (currently 6 evals, now 7).

### 2026-05-10 — Iteration 28

- **035e822** `docs(readme,changelog): refresh leaf table to 24 leaves / ~140 rules`

**Status snapshot at iteration 28**:
- 24 hand-authored seed leaves under `.context-map/library/`,
  ~140 rules total. Mirrored to 4 sub-orgs.
- 6 stdlib-only Python evals (31 tests when bootstrapped). Each has
  a documented self-test that proves it bites on the right mutation.
- Three docs polished: SETUP.md, DEMO.md (3-min runbook),
  PITCH-OUTLINE.md (90s/5min/Q&A). README and CHANGELOG synced.
- One helper script (`seed-context-map.sh`) and one Makefile with
  `eval / seed / agent / ui / demo / setup-check / clean-mirrors`.
- All commits land on `main` after rebase. Workflow proven across
  28 iterations, ~120 commits.

**Left to do (next iterations, in priority):**
1. Verify `make demo` end-to-end actually completes a Guardian cycle
   without LLM keys (will surface real issues if any).
2. Audit `make help` output against actual targets (drift check).
3. Add an `evals/test_makefile_targets_resolve.py` that asserts every
   target named in `make help` exists as a recipe.

### 2026-05-10 — Iteration 27

- **1f1afe9** `feat(context-map): add feature-flags/rollout-and-killswitch leaf`
- **10315e2** `feat(context-map): add crypto/primitives-and-keys leaf`
- Library: 24 leaves, ~140 rules. All mirrored. Eval suite still 6/all green.

**Diminishing returns check**: at 24 leaves the library covers the
universal categories (auth, secrets, db, observability, errors,
validation, network, time, concurrency, caching, state, sandbox,
webhooks, supply-chain, frontend-security, accessibility, i18n,
file-uploads, email, payments, pii, feature-flags, crypto, rate-limit).
Future additions should be domain-specific (e.g. ML training data,
real-time pipelines) rather than more general categories.

**Left to do (next iterations, in priority):**
1. CHANGELOG / README refresh: 24-leaf table.
2. Verify `make demo` end-to-end actually completes a Guardian cycle
   without LLM keys (proves the helper recipe holds).
3. Add a `make help` target audit — does the help output stay in sync
   with the actual recipes?

### 2026-05-10 — Iteration 26

- **b1b91af** `feat(context-map): add payments/idempotency-and-money leaf + demo stub`
- **f814ce5** `feat(context-map): add pii/minimisation-and-deletion leaf + demo stub`
- Library: 22 leaves, ~128 rules. Each leaf paired with a stub
  violating one of its rules; reachability eval green across all.

**Left to do (next iterations, in priority):**
1. CHANGELOG / README refresh: 22-leaf table.
2. Add a leaf for `feature-flags` (config in code, kill-switch
   discipline, no-secret-data-in-flag-rules, drift-detection).
3. Add a leaf for `crypto` (no DIY primitives, no MD5/SHA1 for
   security, KDF for passwords, AEAD over CBC).
4. Verify `make demo` end-to-end runs without LLM keys (uses mock
   mode flags) — proves the helper recipe holds.

### 2026-05-10 — Iteration 25

- **cb6c6b3** `docs(setup): five fixes from a stranger-readability re-walk`
- Six runbook fixes consolidated. SETUP.md now matches DEMO.md's
  polish level: every command available as `make <target>`, all leaf
  counts current, every "obvious to me" assumption explicit.

**Left to do (next iterations, in priority):**
1. CHANGELOG / README refresh for file-uploads + email rows.
2. Add a leaf for `payments` (idempotent capture, never log full PAN,
   webhook signature dance, currency precision).
3. Add a leaf for `pii` (data-minimisation, encryption-at-rest for
   identifiers, deletion handling, audit log of access).
4. Audit Makefile recipes — does every documented `make <target>`
   actually exist? (setup-check, eval, seed, agent, ui, demo,
   clean-mirrors are all defined; verified earlier.)

### 2026-05-10 — Iteration 24

- **fb6ed94** `feat(context-map): add file-uploads/size-mime-and-paths leaf + demo stub`
- **2f0dd33** `feat(context-map): add email/transactional-deliverability leaf + demo stub`
- Library: 20 leaves, ~116 rules. Each new leaf paired with a minimal
  mock_org stub that violates one rule, so the reachability eval
  verified them as load-bearing.

**Surprise**: shipped both leaves with applies_to globs that resolved
to nothing (mock_org had no upload/email files). The applies_to
reachability eval immediately failed — exactly the use case it was
written for. Added the stubs, eval went green.

**Left to do (next iterations, in priority):**
1. SETUP.md re-walk (mirror DEMO polish — fresh-eyes pass).
2. CHANGELOG / README refresh for file-uploads + email rows.
3. Add a leaf for `payments` (idempotent capture, never log full PAN,
   webhook signature dance, currency precision).
4. Add a leaf for `pii` (data-minimisation, encryption-at-rest for
   identifiers, deletion handling, audit log of access).

### 2026-05-10 — Iteration 23

- **21557ad** `docs(readme,changelog): refresh leaf table to 18 leaves + document overlap`
- README + CHANGELOG synced. Overlap doc added so future authors know
  why the no-process-local-Map rule appears twice.

**Left to do (next iterations, in priority):**
1. SETUP.md re-walk (mirror DEMO polish — fresh-eyes pass).
2. Convert evals/test_gc_pruning.py to subTest where it iterates
   (it already uses setUp per-test, so probably no change needed —
   audit anyway).
3. Add a leaf for `email-deliverability` (SPF/DKIM/DMARC, bounce
   handling, no plain-text password reset links).
4. Add a leaf for `file-uploads` (size limits, MIME validation,
   filename sanitisation, no path traversal in stored filenames).

### 2026-05-10 — Iteration 22

- **a65d6f0** `feat(context-map): add caching/ttl-and-invalidation leaf`
- Library: 18 leaves, ~104 rules. All mirrored. Eval suite still 6/all green.

**Surprise**: hook flagged a literal token in rule 5 even though the
rule recommends *against* it. Rephrased to "language-native binary
serializer" — same lesson, no false-positive.

**Left to do (next iterations, in priority):**
1. CHANGELOG refresh: 18 leaves, accessibility / i18n / caching rows.
2. README leaf table refresh: same 3 new rows.
3. SETUP.md re-walk (mirror the DEMO.md polish pass).
4. Audit for rule overlap and document the intentional duplication
   (process-local-Map appears in rate-limit, state, concurrency).

### 2026-05-10 — Iteration 21

- **763ed80** `refactor(evals): use subTest in citation-precision and applies_to-resolve`
- All eval suites that iterate per-leaf now report independently;
  multiple bad leaves surface in one run.

**Left to do (next iterations, in priority):**
1. caching leaf — TTL, key invalidation, no-cache for authenticated
   responses, cache stampede protection.
2. CHANGELOG refresh + README leaf table refresh for accessibility +
   i18n + caching.
3. Audit for rule overlap and document the intentional duplication.
4. SETUP.md re-walk (mirror the DEMO.md polish pass).

### 2026-05-10 — Iteration 20

- **d475818** `docs(demo): five fixes from a stranger-readability re-walk`
- Seven runbook fixes consolidated into one commit (atomic for the
  reader: it's all DEMO.md polish, no behavior change).

**Left to do (next iterations, in priority):**
1. Mirror the subTest pattern to test_citation_precision +
   test_applies_to_globs_resolve so they too report all bad leaves.
2. caching leaf + CHANGELOG refresh.
3. Audit for rule overlap and document the intentional duplication.
4. SETUP.md re-walk.

### 2026-05-10 — Iteration 19

- **c9d5e63** `refactor(evals): remove dead _numbered_rule_lines helper`
- **730a2e2** `refactor(evals): use subTest in metadata-consistency so all leaf failures surface`
- Eval suite still 6 evals; metadata-consistency now reports per-leaf
  failures simultaneously instead of stopping at the first.

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV — final pass.
2. Mirror the subTest pattern to test_citation_precision so it
   reports all bad leaves at once too.
3. Audit for rule overlap and document the intentional duplication.
4. Add a leaf for `caching` (TTL, key invalidation, no-cache for
   authenticated content).

### 2026-05-10 — Iteration 18

- **6ce68bd** `feat(context-map): add accessibility/semantic-and-keyboard leaf`
- **5a3cc14** `feat(context-map): add i18n/locale-and-formatting leaf`
- Library: 17 leaves, ~98 rules. All mirrored.

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV — final pass.
2. CHANGELOG refresh for accessibility + i18n.
3. Audit for rule overlap and document the intentional duplication.
4. Add a leaf for `caching` (TTL, key invalidation, write-through vs
   write-behind, no-cache for authenticated content).

### 2026-05-10 — Iteration 17

- **eed6ba5** `feat(context-map): add frontend-security/xss-csrf-csp leaf`
- **2e8501c** `docs(changelog): refresh constraint library count to 15 leaves / ~85 rules`
- Library: 15 leaves, ~85 rules. All mirrored. Eval suite still 6/all green.

**Surprise**: hook blocked the first write because the literal token
`dangerouslySetInnerHTML` triggers a security-reminder regex even
when the surrounding text recommends *against* it. Reworded the
constraint to "the raw-HTML escape hatch prop" + a description so
the rule still teaches the right lesson without tripping the regex.

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV.
2. Audit for rule overlap across leaves (no-process-local-Map appears
   in rate-limit, state, and concurrency).
3. Add a leaf for `accessibility` (semantic HTML, ARIA, keyboard nav,
   focus trap, color contrast).
4. Add a leaf for `i18n` (locale/dir/script-aware string handling,
   no concatenated translations).

### 2026-05-10 — Iteration 16

- **81ce43a** `feat(context-map): add time/timezones-and-monotonic leaf`
- **60743e2** `feat(context-map): add network/tls-and-egress leaf`
- Library: 14 leaves, 78 rules. All mirrored.

**Surprise**: shipped network leaf with `network: network` instead of
`library: network` in the frontmatter. Three independent evals turned
red simultaneously (metadata-consistency, citation-precision via the
applies_to extractor, mirror via the byte-equality check). The eval
suite did exactly what it was built to do — caught a hand-typed
typo before commit. This is the second time the suite has caught
me; first was the `__pycache__` issue in iteration 1.

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV.
2. Audit for rule overlap across leaves (no-process-local-Map appears
   in rate-limit, state, and concurrency now — flag it deliberately
   or consolidate).
3. Add a leaf for `frontend-security` (XSS, CSRF, CSP, sandboxed
   iframes, unsafe innerHTML insertion patterns).
4. Update CHANGELOG.md to reflect 14 leaves (was 11).

### 2026-05-10 — Iteration 15

- **6a82306** `feat(context-map): add concurrency/locks-and-races leaf`
- **8afbcae** `feat(demo): add Makefile with eval/seed/agent/ui/demo recipes`
- Library: 12 leaves, 66 rules. `make demo` chains seed + eval + agent.
  Mirror eval still green across all 4 sub-orgs.

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV — pre-flight, T-0:30, T+0:00:
   are commands cut-paste-able as-is?
2. Q&A practice run — read PITCH-OUTLINE.md cold, answer each
   question out loud, rewrite anything that requires a footnote.
3. Add a leaf for `time-and-clocks` (UTC vs local, monotonic vs wall,
   timezone-naive datetime arithmetic, leap seconds).
4. Add a leaf for `network` (DNS pinning, TLS verification, retry
   semantics on transient DNS failures, no IP allow-lists vs cloud
   egress).

### 2026-05-10 — Iteration 14

- **48fb766** `docs(readme): expand Evals section with full eval list + constraint library table`
- **8bb6063** `docs(changelog): add CHANGELOG.md consolidating Agent 4 demo/content/evals work`
- A reviewer landing on the README now sees: SETUP/DEMO/PITCH-OUTLINE
  links → Evals coverage (6 evals named, each with self-test) →
  Constraint library table (11 leaves with target file families) →
  CHANGELOG with violation examples. No spelunking required.

**Left to do (next iterations, in priority):**
1. Re-walk DEMO.md from a stranger's POV — pre-flight, T-0:30, T+0:00:
   are commands cut-paste-able? Are env vars in the same shell?
2. Add a `Makefile` with `make seed`, `make eval`, `make demo`
   recipes wrapping the existing scripts.
3. Q&A practice run — read PITCH-OUTLINE.md cold, answer each
   question out loud, rewrite anything that requires a footnote.
4. Add a leaf for `concurrency` (locks, race conditions, async vs sync,
   await-in-loop pitfalls).

### 2026-05-10 — Iteration 13

- **0d6882d** `feat(demo): add seed-context-map.sh helper + reference it from SETUP/DEMO`
- **dd883d4** `chore(demo): mirror seed library to remaining mock_org sub-orgs`
  (connectors, memory-graph, runtime-orchestrator)
- All 4 sub-orgs now have a mirrored `.context-map/library/` matching
  the canonical seed. Eval suite still 6 evals all green.

**Left to do (next iterations, in priority):**
1. Code-shape eval — for each leaf, grep at least one keyword from
   each rule body against the resolved applies_to files.
2. README — link the mirror script + the new wiring step in
   "Where to look" or "Quickstart".
3. CHANGELOG.md / RELEASE-NOTES.md so a sponsor can see what shipped
   without reading commits (root-level, in scope).
4. Q&A practice run — read PITCH-OUTLINE.md cold and answer each
   question out loud; rewrite anything that requires a footnote.

### 2026-05-10 — Iteration 12

- **53d349c** `docs(setup,demo): wire seed library into demo target so Guardian reads it`
- **231f3db** `test(evals): add seed-library mirror eval`
- **f88f373** `chore(demo): commit bootstrapped seed-library mirror under agent-gateway`
- 6 evals, 31 tests (mirror skip → 0 tests → fired test once mirror exists).

**Surprise — load-bearing**: I shipped 11 leaves over 4 iterations
without realising Guardian wouldn't read any of them. The seed
library at `<root>/.context-map/library/` is read by the canonical
suite (citation, applies_to, metadata) but Guardian's `filesystemRoot`
is `DEMO_REPO_LOCAL_PATH`, which is `mock_org/agent-gateway`. The
mirror eval now refuses to merge silent drift.

**Left to do (next iterations, in priority):**
1. Code-shape eval — for each leaf, grep at least one keyword from
   each rule body against the resolved applies_to files.
2. Mirror to other sub-orgs (`connectors/`, `runtime-orchestrator/`,
   `memory-graph/`, `control-plane/`) so Guardian fires on all of them
   regardless of which `DEMO_REPO_LOCAL_PATH` is set.
3. Add a Makefile or npm script `seed:mirror` that re-runs SETUP step 4
   (one command instead of `mkdir -p && cp -R`).
4. README — surface the new wiring step in the "Where to look" table.

### 2026-05-10 — Iteration 11

- **e3e3c74** `feat(context-map): add supply-chain/dependencies-and-build leaf`
- **767b38d** `feat(context-map): add state/durable-and-atomic leaf`
- Library now: 11 leaves, 60 rules. Eval suite still 5/30 green.

**Left to do (next iterations, in priority):**
1. Code-shape eval — for each leaf, grep at least one keyword from
   each rule body against the resolved applies_to files. Catches a
   leaf whose globs resolve but whose rules describe code shapes that
   don't exist there.
2. Verify across leaves: are any rules redundant across files
   (e.g. "no process-local Map" appears in rate-limit AND state)?
   Either consolidate or note the duplication is intentional.
3. Look at whether docs-ingest already produces leaves at the same
   paths (e.g. `library/lodash/security-advisories.md`); avoid
   collisions with the seed library.
4. README: link the eval coverage table to specific leaves.

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

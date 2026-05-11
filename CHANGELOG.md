# CHANGELOG

What shipped, in reverse chronological order. One entry per logical
change set; granular commits are visible in `git log`.

## 2026-05-10 — Demo, content, evals (Agent 4)

### Added — constraint library

25 hand-authored seed leaves under `.context-map/library/`, ~150 rules
total. Each rule is a single line, byte-citable by Guardian's
`verifyConstraintCite`, and currently violated by at least one file
under `mock_org/` (where applicable — `frontend-security` and
`supply-chain` are universal).

| Library | Rules | Demo target violation example |
|---|---:|---|
| auth | 5 | `agent-gateway/src/api/auth.ts` returns `{ ok: true }` with no credential check |
| secrets | 4 | `agent-gateway/src/lib/redaction.ts` redacts by KEY only, missing value-pattern scan |
| rate-limit | 5 | `agent-gateway/src/api/rateLimit.ts` is a process-local Map with no decay or eviction |
| db | 6 | universal: parameter binding, transactions, migrations |
| observability | 6 | `console.log`, correlation ids, redaction at emission |
| errors | 6 | exp backoff with jitter, attempt + wall-clock ceilings, no swallowed errors |
| validation | 6 | `agent-gateway` handlers accept `Record<string, unknown>` (rule 2 fires) |
| webhooks | 6 | `connectors/src/github/webhooks.ts` calls `timingSafeEqual` without an equal-length check |
| sandbox | 6 | `runtime-orchestrator/src/runtime/job_runner.py` validates upper bound only |
| supply-chain | 7 | universal: lockfile in same commit, `npm ci` in CI, no `curl \| bash` |
| state | 6 | `runtime-orchestrator/src/runtime/state_store.py` calls `write_text` non-atomically |
| concurrency | 6 | universal: distributed-lock TTL, finally-release, no serial await, idempotent handlers |
| time | 6 | universal: UTC + ISO 8601, monotonic clocks for elapsed, calendar-aware date math |
| network | 6 | universal: TLS verify on, min TLS 1.2, SSRF allow-list, both timeouts, no cross-origin auth follow |
| frontend-security | 7 | `control-plane/components/*.tsx` — XSS, CSRF, CSP, cookies, iframes, open redirect |
| accessibility | 7 | `control-plane/components/*.tsx` — semantic HTML, keyboard, ARIA, focus, contrast, motion |
| i18n | 6 | universal: no concatenated translations, CLDR plurals, Intl.* formatting, RTL, Unicode inputs |
| caching | 6 | universal: TTL on every entry, no auth/anon mixing, write-time invalidation, stampede protection |
| file-uploads | 6 | `agent-gateway/src/api/upload.ts` joins client-supplied filename into local path (rule 3 fires) |
| email | 6 | `agent-gateway/src/lib/email.ts` includes new password in the body (rule 2 fires) |
| payments | 6 | `agent-gateway/src/api/payment.ts` uses `amount: number` (float) and a raw `cardNumber` field |
| pii | 6 | `agent-gateway/src/api/user.ts` exposes `/user/<sequential-int>/profile` (rule 5 fires) |
| feature-flags | 6 | universal: explicit off-default, kill-switch, no synchronous-fetch in hot path |
| crypto | 6 | universal: no DIY primitives, no MD5/SHA-1, KDF for passwords, AEAD, KMS-managed keys |
| ai-agent | 7 | universal: prompt-injection delimiters, schema-validate tool outputs, token ceilings, no secrets in prompts, structured-output mode |

The seed is mirrored into every `mock_org/<sub-org>/.context-map/library/`
via [`seed-context-map.sh`](seed-context-map.sh); a drift eval
([`evals/test_seed_library_mirror.py`](evals/test_seed_library_mirror.py))
refuses silent divergence.

**Intentional rule overlap.** A few rules appear in two leaves with
different applies_to scopes:

- "no process-local Map / Set / dict as source of truth" appears in
  both `rate-limit/persistent-decay.md` (rule 2) and
  `state/durable-and-atomic.md` (rule 3). The same anti-pattern hits a
  rate-limit code path and a state-store code path with different
  failure modes (over-limit on one replica, double-process on scale-out).
  Two leaves means Guardian's planner picks the more contextual
  rule for each file rather than firing the same generic rule twice.

If you find a third copy of a rule across leaves, that's worth
consolidating.

### Added — eval suite

8 stdlib-only Python evals under [`evals/`](evals/), 36 tests when the
mirror is bootstrapped (one suite skips when no mirror exists). Every
eval has a documented self-test that breaks the source under verification.

| Eval | Pins | Self-test |
|---|---|---|
| `test_hurdle_threshold.py` | NM `expand_windows`: HURDLE_THRESHOLD, SIGNAL_CLUSTER_GAP, score-as-sum | `HURDLE_THRESHOLD = 0.5` → 3 fail |
| `test_citation_precision.py` | every rule line is single-line, byte-citable, applies_to non-empty | trailing whitespace → fail |
| `test_applies_to_globs_resolve.py` | every leaf has at least one glob that resolves under `mock_org/` | aspirational glob → fail |
| `test_leaf_metadata_consistency.py` | library == parent dir, chunk_id format, rule count match, source_uri | library mismatch → 3 of 4 fail |
| `test_gc_pruning.py` | NM GC: decay → merge → prune cascade on synthetic SQLite | PRUNE_THRESHOLD = 0.0 → fail |
| `test_seed_library_mirror.py` | every bootstrapped mirror is byte-identical to canonical | append a line → fail |
| `test_makefile_targets_resolve.py` | every help-listed target exists, every recipe is documented | add ghost help line → fail |
| `test_npm_scripts_referenced_in_docs_exist.py` | every `npm run <name>` in docs resolves to a workspace package.json | rename `npm test` → bogus → fail |

```bash
bash evals/run_all.sh                # nonzero exit on any failure
```

### Added — documentation

- [SETUP.md](SETUP.md) — single linear path from `git clone` to first
  Guardian cycle in <5 min. Step 4 wires the seed library into the
  demo target via the helper.
- [DEMO.md](DEMO.md) — 3-minute pitch runbook with seven 30-second
  beats, two paths (live + offline), a pre-flight check, and a
  "things that go wrong" table.
- [PITCH-OUTLINE.md](PITCH-OUTLINE.md) — 90-second + 5-minute pitch
  variants sharing one thesis, plus 7 preempted Q&A entries and a
  "don't say" list.
- [README.md](README.md) — expanded Evals section, full constraint
  library table.

### Added — wiring

- [`seed-context-map.sh`](seed-context-map.sh) — mirrors canonical
  seed into every `mock_org/<sub-org>/.context-map/library/`. Run
  after editing any leaf.

### Notes

- The mirror eval was added *after* 11 leaves had already been
  written; the gap (Guardian reads from `<DEMO_REPO_LOCAL_PATH>/`,
  not the repo root) was invisible until the wiring fix landed in
  commit `53d349c`. From iteration 12 forward, every leaf is
  guaranteed to reach Guardian.
- All evals pass on `main` as of `48fb766`.

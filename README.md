# Context Cloud

A shared-memory + drift-detection platform for AI coding agents, built at the **Nozomio Hackathon** (May 9, 2026) on Nia + Tensorlake + Convex + Vercel.

Three independently-developed halves merged into one app, sharing one Convex deployment but writing to disjoint tables. Any subset can run alone.

```
┌──────────── NM ────────────┐  ┌────────── Guardian ──────────┐  ┌── docs-ingest ──┐
│ capture → hurdle → note    │  │ cycle: PLAN → SCAN → ANALYZE │  │ external docs   │
│ inject on file touch       │  │ → CRITIQUE → HANDOFF →       │  │ → per-line .md  │
│ GC: decay → merge → prune  │  │ RECONCILE (Devin closed loop)│  │ constraints     │
└──────────────┬─────────────┘  └──────────────┬───────────────┘  └────────┬────────┘
               │                               │                            │
               └───────── shared Convex deployment: colorless-porcupine-926 ──────┘
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                       Hindsight UI (ui/)     Vercel demo (mock/)
```

---

## What's in here

| Path | What it is | Lang |
|---|---|---|
| `agent/` | **Guardian** — Node/TS cycle: WAKE → PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → RECONCILE. Files real GitHub issues, hands findings to Devin, re-scans until resolved. | TypeScript |
| `convex/` | Shared backend. Disjoint table sets per half. Guardian: `cycles / findings / devinRuns / events / docsIngestRuns / fileScanHistory`. NM: `sessions / notes / files / noteFiles / hurdles / injections / gcActions`. UI: `agentEvents / dashboard / libraries / seed / users`. | TypeScript |
| `ui/` | **Hindsight** — Next.js 15 dashboard. Tabs: Activity, Guardian, Sessions, Sources, Replay. Subscribes live to Convex. | TypeScript |
| `dashboard/` | Legacy NM-only dashboard (active notes, injection feed, GC actions, sessions). | TypeScript |
| `docs-ingest/` | Pipeline that ingests external docs (md / HTML / OpenAPI / live URL) into per-line `.md` constraints under `<demo-target>/.context-map/library/<lib>/`. | TypeScript |
| `nm_*.py` | NM capture + inject + extract + GC + dashboard + Nia + MCP server. SQLite is the source of truth for capture; mirrors to Convex best-effort. | Python |
| `tensorlake/` | Three deployable functions: `guardian_cycle.py` (cron `* * * * *`), `note_manager.py` (webhook), `gc.py` (cron `*/15 * * * *`). | Python |
| `mock/` | Static demo-mode HTML served by Vercel for the offline demo fallback (per `vercel.json`). | HTML |
| `mock_org/` | Synthetic ACME organization for the Hindsight demo — five sub-products plus `.nm/briefs/` corpus. | Mixed |
| `scripts/` | Standalone scripts: `index-demo.ts`, `make_architecture_pdf.py`, `mock_traces.py`. | Mixed |
| `docs/` | Guardian design spec + plans (`superpowers/`), hurdle detection spec, architecture PDF, hackathon brief, history archive. | Markdown |

---

## Quickstart

### Prereqs
- Node 20+, npm
- Python 3.10+
- A Convex deployment (`npx convex dev` to provision)
- Optional but recommended: Nia API key, OpenAI key, GitHub PAT, Tensorlake key

### One-shot Guardian cycle (mock LLM, real GitHub issues)
```bash
npm install
npx convex dev --once
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target USE_MOCK_LLM=1 npm run agent:once
```
Produces real GitHub issues against the demo target. Re-running is a no-op (fingerprint dedup).

### Continuous Guardian
```bash
npm run agent          # interval from GUARDIAN_CYCLE_INTERVAL_S
```

### Hindsight UI (live event stream)
```bash
cd ui && npm install && npm run dev    # http://localhost:3000
```

### Legacy NM dashboard
```bash
cd dashboard && npm install && npm run dev
```
Set `NEXT_PUBLIC_CONVEX_URL` to the deployment's `.convex.cloud` URL. (NM's Python sync writes to `.convex.site`; UI reads from `.convex.cloud` — same deployment, two endpoints.)

### NM session capture (Python half)
NM's hooks run automatically once Claude Code is configured to point at `nm_server.py`. To extract notes from a captured session and run GC:
```bash
pip install -r requirements.txt
python nm_extract.py --session <session-id>
python nm_gc.py --loop --interval 900
```

### docs-ingest demo (run once before a Guardian cycle)
```bash
cd docs-ingest && npm install && npm run demo
```
Writes `<sibling demo-target>/.context-map/library/lodash/security-advisories.md`.

---

## Where to look

| You want to … | Read |
|---|---|
| Set up from a clean clone (5 min) | [SETUP.md](SETUP.md) |
| Run the 3-minute demo | [DEMO.md](DEMO.md) |
| Pitch this in 90 seconds or 5 minutes | [PITCH-OUTLINE.md](PITCH-OUTLINE.md) |
| Understand what shipped | [PRD.md](PRD.md) |
| Operate Claude Code in this repo | [CLAUDE.md](CLAUDE.md) |
| The NM SQLite schema | [SCHEMA.md](SCHEMA.md) |
| How NM detects hurdles | [docs/HURDLE_DETECTION_SPEC.md](docs/HURDLE_DETECTION_SPEC.md) |
| Guardian design spec | [docs/superpowers/specs/2026-05-09-guardian-agent-design.md](docs/superpowers/specs/2026-05-09-guardian-agent-design.md) |
| Tensorlake deploy | [tensorlake/README.md](tensorlake/README.md) |
| docs-ingest reference | [docs-ingest/README.md](docs-ingest/README.md) |
| Hackathon brief | [docs/Nozomio Hackathon Guide.md](docs/Nozomio%20Hackathon%20Guide.md) |
| System diagram | [docs/architecture.pdf](docs/architecture.pdf) |
| Pre-cleanup originals | [docs/history/](docs/history/) |

---

## Convex deployment

One shared deployment: `colorless-porcupine-926` (project `nozomioHackathon`).

- Reactive UI endpoint (read): `https://colorless-porcupine-926.convex.cloud`
- HTTP actions endpoint (write from Python): `https://colorless-porcupine-926.convex.site`

Schema at [`convex/schema.ts`](convex/schema.ts) is the union of every half's tables. Adding a table on either side is fine; renaming or dropping needs coordination.

---

## Environment

A complete `.env.example` is at the root. Per-subsystem env vars:

- **Guardian** — `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_CRITIQUE_MODEL`, `NIA_API_KEY`, `NIA_MCP_URL`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GUARDIAN_CYCLE_INTERVAL_S`, `GUARDIAN_PRIORITY_BUDGET`, `GUARDIAN_JUDGMENT_BUDGET`, `USE_MOCK_LLM`, `USE_MOCK_DEVIN`, `SKIP_NIA`, `DEMO_REPO_LOCAL_PATH`, `DEVIN_API_KEY`
- **NM (Python)** — `OPENAI_API_KEY`, `NM_EXTRACT_MODEL`, `CONVEX_URL` (`.convex.site`), `NM_SYNC_TOKEN`, `NIA_API_KEY`, `NIA_INDEX_ID`
- **UI / dashboard** — `NEXT_PUBLIC_CONVEX_URL` (`.convex.cloud`)
- **docs-ingest** — `OPENAI_API_KEY` (optional; regex fallback), `DOCS_INGEST_CONTEXT_MAP`, `DOCS_INGEST_CODEBASE_ROOT`, `CONVEX_URL`

`.env` is git-ignored. Do not commit it.

---

## Tests

```bash
npm test                         # vitest at the repo root (Guardian + Convex helpers)
cd docs-ingest && npm test       # vitest for the ingestion pipeline
```

---

## Evals

A stdlib-only Python suite under [`evals/`](evals/) verifies behaviour on
top of the unit tests. Every eval has a known-failing self-test
documented at the top of its file (mutate the named source line → eval
turns red).

```bash
bash evals/run_all.sh            # all evals; nonzero exit on any failure
```

Currently covers:
- **NM hurdle scoring** — `HURDLE_THRESHOLD`, `SIGNAL_CLUSTER_GAP`, score-as-sum invariants in `nm_extract.expand_windows`.
- **Guardian citation precision** — every numbered rule in `.context-map/library/**/*.md` is single-line and byte-citable by `verifyConstraintCite`.
- **Library `applies_to` reachability** — every leaf has at least one glob that resolves under `mock_org/`; catches dead leaves Guardian would silently skip.
- **Leaf metadata consistency** — `library:` matches parent dir, `chunk_id` follows `<library>.<topic>.v<n>`, frontmatter rule count matches body rule count.
- **Seed library mirror** — every bootstrapped `mock_org/<sub>/.context-map/library/` is byte-identical to the canonical seed at the repo root; catches drift after `seed-context-map.sh` is forgotten.
- **NM GC** — decay → merge → prune cycle on a synthetic SQLite DB; covers `nm_gc.run_once` end to end.

Add a new eval by following [`evals/README.md`](evals/README.md). The
quality bar is non-negotiable: if you cannot make the eval fail by
mutating the source under test, it is a placebo and gets deleted.

### Constraint library

Guardian enforces 18 constraint families seeded under
[`.context-map/library/`](.context-map/library/). Every leaf is a
markdown file with line-precise rules; Guardian's findings cite a
specific line in a specific leaf, byte-equal to the file content.

| Library | Topic | Targets |
|---|---|---|
| [auth](.context-map/library/auth/credentials-required.md) | credentials-required | `src/api/auth.ts` family |
| [secrets](.context-map/library/secrets/redaction-completeness.md) | redaction-completeness | `src/lib/redaction.ts`, MCP/session APIs |
| [rate-limit](.context-map/library/rate-limit/persistent-decay.md) | persistent-decay | `src/api/rateLimit.ts` family |
| [db](.context-map/library/db/transactions-and-migrations.md) | transactions-and-migrations | `src/db/*.ts`, repositories |
| [observability](.context-map/library/observability/structured-logs-and-correlation.md) | structured-logs-and-correlation | `src/api/`, middleware, loggers |
| [errors](.context-map/library/errors/retries-and-backoff.md) | retries-and-backoff | `src/api/`, retry/http/queue helpers |
| [validation](.context-map/library/validation/schema-at-trust-boundaries.md) | schema-at-trust-boundaries | `src/api/`, parsers, schemas |
| [webhooks](.context-map/library/webhooks/signature-verification.md) | signature-verification | `src/api/webhooks/`, connectors |
| [sandbox](.context-map/library/sandbox/job-resource-budgets.md) | job-resource-budgets | `src/runtime/`, `src/jobs/` |
| [supply-chain](.context-map/library/supply-chain/dependencies-and-build.md) | dependencies-and-build | `package.json`, lockfiles, Dockerfiles, CI workflows |
| [state](.context-map/library/state/durable-and-atomic.md) | durable-and-atomic | `src/runtime/state*`, schedulers, stores |
| [concurrency](.context-map/library/concurrency/locks-and-races.md) | locks-and-races | `src/api/`, `src/jobs/`, `src/workers/`, lock helpers |
| [time](.context-map/library/time/timezones-and-monotonic.md) | timezones-and-monotonic | `src/api/`, `src/lib/time*/clock*`, runtime |
| [network](.context-map/library/network/tls-and-egress.md) | tls-and-egress | `src/api/`, `src/lib/http*`, connectors |
| [frontend-security](.context-map/library/frontend-security/xss-csrf-csp.md) | xss-csrf-csp | `components/*.tsx`, middleware, next.config |
| [accessibility](.context-map/library/accessibility/semantic-and-keyboard.md) | semantic-and-keyboard | `components/*.tsx`, app routes, pages |
| [i18n](.context-map/library/i18n/locale-and-formatting.md) | locale-and-formatting | `components/*.tsx`, `lib/format*/i18n*/intl*` |
| [caching](.context-map/library/caching/ttl-and-invalidation.md) | ttl-and-invalidation | `src/api/`, `src/lib/cache*/redis*/memo*` |

Wire the seed into a demo target with
[`bash seed-context-map.sh`](seed-context-map.sh) (mirrors to every
sub-org under `mock_org/`).

---

## Branches

- `main` — what this README describes. The merged tree.
- `nicolas/plan-1-foundation` — parallel work stream from the hackathon; still active.

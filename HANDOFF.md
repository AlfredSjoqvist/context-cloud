# Guardian Agent — Handoff

**Date:** 2026-05-09 (during Nozomio Hackathon)
**Branch:** `nicolas/plan-1-foundation` (despite the name, contains both Plan 1 + most of Plan 2)
**Remote:** https://github.com/AlfredSjoqvist/context-cloud
**Demo target repo:** https://github.com/NewCoder3294/demo-target (planted CSRF drift, sliding-TTL drift, lodash CVE)
**Convex deployment:** `acoustic-fish-389` (project: `nozomioHackathon`, team: `nicolas-dos-santos`)

This doc lets a teammate pick up where Nicolas + Claude left off. Read this first, then `docs/superpowers/specs/2026-05-09-guardian-agent-design.md`.

---

## TL;DR

Plan 1 (foundation + skeleton) is **complete and pushed**. Plan 2 (analyzer + GitHub handoff + real Nia) is **~95% complete** — code is in, tests pass, and **3 real GitHub issues have been filed end-to-end** against the demo repo using `USE_MOCK_LLM=1`. The only gap before declaring Plan 2 done is the **real-Nia smoke test (P2-T18)**, which is blocked on a 30-second Nia↔GitHub account link in app.trynia.ai. Once that link is made, re-triggering the index call should unblock everything.

## What ships right now

### Architecture (three independently deployable units)

```
agent/    — Node/TS long-running process. Cycle state machine: WAKE → PLAN → SCAN → ANALYZE → HANDOFF → SLEEP.
convex/   — State + queries + (eventual) GitHub webhook receiver. Live event stream feeds the UI.
ui/       — Next.js 15 + Tailwind, subscribes to Convex events live. Built locally; not yet deployed to Vercel.
```

### Cycle flow today

1. **PLAN** — `priorityPicks(cycleNumber, candidates, history, budget=3)` returns up to 3 file paths. Never-scanned files have `Number.POSITIVE_INFINITY` priority, then most-stale, with a `cleanScanStreak * 0.5` penalty.
2. **SCAN** — `nia.readFile(path)` for each pick. Real Nia transport is `apigcp.trynia.ai/mcp`; falls back to local filesystem reads on any error or when `SKIP_NIA=1`.
3. **ANALYZE** — for `package.json`, runs `npm audit --json` and converts each advisory into a `Finding`. For `*.ts` files, the LLM analyzer (real GPT-5 or `mockAnalyzeFile`) returns `Finding[]` from structured output validated against a Zod schema.
4. **CRITIQUE** — programmatic citation check verifies the cited code line + the cited `.md` constraint text actually exist. Then an optional cheaper LLM (`gpt-5-mini`) judges confidence; below 80% confidence is dropped. Findings with no `repository` or no critique LLM still file (mock-mode runs with citation-only).
5. **HANDOFF** — fingerprints the finding (`sha256(JSON.stringify([path, mdFile, mdLine, codeLine]))`), checks `findings.createIfAbsent` for dedup, files a real GitHub issue via Octokit (`PatAuth`), records `findings.setStatus(detected, githubIssueNumber)`. Devin handoff (Plan 3) and the closed loop come later.

### Repos / paths

- **This repo (guardian agent):** `~/projects/guardian-agent` on Nicolas's laptop.
- **Demo target repo (the codebase guardian scans):** `~/Desktop/guardian-demo-target` locally, pushed as `NewCoder3294/demo-target`. Contains Express+TS source under `src/` plus a hand-authored `.context-map/` with intent/architecture/examples/constraints `.md` files for each topic (login, sessions, payments).
- **Spec:** `docs/superpowers/specs/2026-05-09-guardian-agent-design.md` — single source of truth for architecture, scan strategy, handoff loop.
- **Plans:** `docs/superpowers/plans/`
  - `2026-05-09-guardian-foundation-skeleton.md` (Plan 1 — complete; 25 tasks)
  - `2026-05-09-guardian-write-pipeline-analyzer.md` (Plan 2 — see status below; 18 tasks)

## Plan-by-plan status

### Plan 1 — Foundation + Skeleton ✅ COMPLETE

Tagged `plan-1-foundation-skeleton`. 19 tests green, agent runs cycles against the demo repo, UI builds, fileScanHistory dedup works. See the plan doc for the 25 atomic tasks.

### Plan 2 — Write Pipeline + Real Analyzer ✅ 17/18 tasks done

Done:
- T1–T2: deps installed (`openai@^4.68`, `@openai/agents@^0.0.5`, `@octokit/rest@^21.0.2`, `dotenv`); config schema extended with `openaiApiKey`/`openaiModel`/`openaiCritiqueModel`/`githubToken`/`githubOwner`/`githubRepo` + conditional zod refines.
- T3–T5: shared `Finding` type, `GithubAuth` interface + `PatAuth` impl, full `agent/handoff/github.ts` with `createIssueForFinding` / `commentOnPR` / `getPRStatus`.
- T6: `agent/analyze/npmAudit.ts` — subprocess wrapper, parses CVE advisories, fingerprints them as `path: package.json` findings.
- T7: `agent/analyze/citation.ts` — TDD'd verifier that compares code line + .md constraint text against the actual file.
- T8: `agent/analyze/mockAnalyzer.ts` — deterministic planted findings with citations matching the **real** demo-target file lines (login.ts:28 CSRF, db.ts:93 sliding-TTL).
- T9: `agent/cycle.ts` rewritten to do WAKE → PLAN → SCAN → ANALYZE → HANDOFF; `agent/main.ts` wires the candidates provider to include `package.json`.
- **T10 — smoke #1 PASSED.** Three real GitHub issues filed on `NewCoder3294/demo-target`:
  - #1 [security] package.json:18 — lodash CVE
  - #2 [intent_drift] src/lib/db.ts:93 — sliding-TTL violation
  - #3 [intent_drift] src/routes/login.ts:28 — missing requireCsrfToken
- T11–T15: `prompts.ts` (system prompts + Zod schemas), `openaiClient.ts` (OpenAI singleton), `critique.ts` (TDD with mock LLM), `analyzer.ts` (TDD with mock LLM), `openaiAdapters.ts` (raw SDK → typed call shapes via JSON-schema structured output).
- T16: `cycle.ts` extended with optional `critiqueLLM`; `main.ts` switches between mock and real analyzer based on `USE_MOCK_LLM`.
- T17: `niaClient.ts` updated to call **Nia's actual MCP tools** — `nia_read` for file fetches, `search` for semantic context. Filesystem fallback retained for `SKIP_NIA=1` and on transient MCP errors. Test injects a mock `mcpClientFactory` so the unit test doesn't hit the network.

Pending:
- **T18 — smoke #2 (real GPT-5 + real Nia)**. Blocked on Nia indexing, which requires a one-time GitHub account link in Nia's UI (Nia returns "Authentication required. GitHub token is mandatory" when trying to index a public repo via API alone).

## How to run locally

```bash
# 1. Boot Convex dev (re-uses the linked nozomioHackathon project)
cd ~/projects/guardian-agent
npx convex dev --once

# 2. Run the agent for a single cycle (mock-LLM path; produces real GH issues)
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target npm run agent:once

# 3. Run UI locally (subscribes live to Convex events)
cd ui
npm run dev   # http://localhost:3000
```

For continuous mode: `npm run agent` (interval is `GUARDIAN_CYCLE_INTERVAL_S=60` in `.env`).

## Required environment (`.env`, git-ignored)

Convex auto-fills `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `CONVEX_SITE_URL` when you run `npx convex dev`. Everything else is manual:

```env
NIA_API_KEY=nk_...
NIA_MCP_URL=https://apigcp.trynia.ai/mcp
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5
OPENAI_CRITIQUE_MODEL=gpt-5-mini
GITHUB_TOKEN=ghp_...           # repo scope, on the demo-target repo
GITHUB_OWNER=NewCoder3294
GITHUB_REPO=demo-target
GUARDIAN_CYCLE_INTERVAL_S=60
GUARDIAN_PRIORITY_BUDGET=3
GUARDIAN_JUDGMENT_BUDGET=1
USE_MOCK_LLM=1                 # flip to 0 once Nia is linked + GPT-5 access confirmed
USE_MOCK_DEVIN=0
SKIP_NIA=0                     # 1 forces filesystem fallback (no Nia required)
```

## Test seams (set these flags in `.env`, no code changes needed)

| Flag             | Effect                                                                 |
|------------------|------------------------------------------------------------------------|
| `USE_MOCK_LLM=1` | Replaces analyzer with `mockAnalyzeFile`; planted CSRF + sliding-TTL findings; no critique pass; deterministic output. **This is what produced our 3 real GitHub issues.** |
| `SKIP_NIA=1`     | Bypasses Nia MCP entirely; reads code from local filesystem; `searchContext` returns `[]`. |
| `USE_MOCK_DEVIN=1` | Reserved for Plan 3; Devin handoff isn't wired yet so currently a no-op. |

## What broke / pitfalls discovered

1. **Nia tool names ≠ generic MCP names.** I originally coded against `read_file` / `search_code` / `search_context` / `recent_diff` (assumed names from the spec). Nia actually exposes `nia_read` / `search` / `nia_grep` / `nia_explore` / `tracer` and requires a `source_type` + `source_identifier` like `"NewCoder3294/demo-target:src/routes/login.ts"`. Fixed in `agent/tools/niaClient.ts`. **Nia has no `recent_diff` equivalent** — `recentDiff()` returns `""` and the analyzer prompt handles missing diff gracefully.
2. **Nia `index` requires GitHub auth even for public repos.** This is the current T18 blocker. Linking a GitHub account in app.trynia.ai once unblocks it.
3. **OpenAI strict structured output needs hand-written JSON Schema.** Zod ↔ OpenAI strict-mode JSON Schema conversion isn't 1:1 — `zod-to-json-schema` produces slight mismatches on `additionalProperties` and `required`. We hand-wrote the schema in `agent/analyze/openaiAdapters.ts::zodToOpenAIJsonSchema`. Two schemas only (analyzer + critique); update both if you change the Zod output shape.
4. **MCP SDK transport import paths.** We import `@modelcontextprotocol/sdk/client/index.js` + `streamableHttp.js` dynamically from `defaultMcpFactory` in `niaClient.ts`. The MCP SDK exposes both via package `exports`. If a future SDK version re-shuffles, only that one factory function needs adjusting.
5. **`npm audit` exits non-zero when vulnerabilities exist.** `defaultRunAudit` in `npmAudit.ts` catches the exec error and extracts `stdout` from it — required behavior.
6. **`fileScanHistory` clean-streak resets on findings.** A finding makes the cycle pass `cleanScan: false` for that file, which sets `cleanScanStreak: 0` in Convex. Subsequent cycles' priority function then treats it as a higher-priority re-scan candidate. This naturally surfaces files with persistent issues on the next cycle.
7. **`ui/tsconfig.tsbuildinfo` is git-ignored** (added in commit `70df200`) — Next.js writes it on build and it shouldn't be tracked.

## Demo / smoke checklist

To prove the pipeline works without touching real LLM (~30s, no OpenAI tokens burned):
```bash
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target USE_MOCK_LLM=1 npm run agent:once
gh issue list --repo NewCoder3294/demo-target --label guardian
```
Should show ≥3 open issues with the `guardian` label. Re-running produces 0 new issues (dedup via fingerprint).

## What Plan 3 + Plan 4 will add

Per the spec's §17 phase plan:

- **Plan 3 — Closed Loop with Devin** (8–10 tasks):
  - `agent/handoff/devin.ts` — Devin REST API client (`POST /sessions`, `GET /sessions/:id`)
  - `agent/handoff/reconcile.ts` — Reconcile phase: walk findings in `devin_running`/`pr_open`/`verifying` states, transition them based on PR events
  - `convex/http.ts` — GitHub webhook receiver (HMAC verified) for instant PR-event propagation
  - Sharpen iteration: when a re-scan finds the constraint still violated, build a sharpened prompt referencing the previous Devin attempt's diff + verbatim constraint citation, spawn a second Devin run. Hard cap at 2 iterations.
- **Plan 4 — Polish + Tensorlake migration** (5–6 tasks):
  - `judgmentBudget` + LLM-driven judgment-call picks in `priorityPicks`
  - Tensorlake sandbox config (`infra/tensorlake.yaml`); migrate from local `npm run agent` to Tensorlake-hosted scheduled execution
  - Atomic `nextCycleNumber` + `openCycle` so concurrent sandboxes can't collide
  - Vercel deployment of UI

## Open questions / decisions for the team

1. **Devin auth for Plan 3** — does the team have a Devin org API key, or do we use individual user keys per agent run?
2. **GitHub webhook routing** — Convex HTTP actions vs a separate Vercel function. Spec says HMAC verification is straightforward in a Convex HTTP action; needs validation.
3. **Sharpen prompt content** — the Plan 3 design says we feed Devin the previous attempt's diff + the constraint citation. Worth deciding how much of the diff to include (full vs unified ±5 lines).
4. **Real-time UI vs static log** — Plan 1 ships a basic `EventStream` that subscribes to `events` via `useQuery`. The spec described a "B' log viewer" with terminal aesthetic; the current UI is functional but not styled to spec. Polish in Plan 4 if visible to judges.
5. **Auto-dedup of GitHub issues across cycles is by fingerprint of `(path, constraintMdFile, constraintMdLine, codeLine)`.** If the LLM cites a slightly different line on a re-scan, dedup misses. Worth considering a fuzzier dedup key (e.g., `path + constraintMdFile` only) once the real-LLM smoke test exposes how stable citations are run-to-run.

## Quick access — credentials we used (for reference only — rotate before shipping to anything but the hackathon demo)

- Nia API key: `nk_1P9BsTX6...` (in `.env`, also bound to Nicolas's Nia account)
- OpenAI key: `sk-proj-e0we...` (in `.env`)
- GitHub PAT: `ghp_RH5o...` (in `.env`, repo scope on `NewCoder3294/demo-target`)
- Convex deploy URL: `https://acoustic-fish-389.convex.cloud`

`.env` is git-ignored. **Don't commit it.**

## Resuming the work

If you're picking this up cold, the first command is:
```bash
cd ~/projects/guardian-agent
git checkout nicolas/plan-1-foundation
git pull
npm install                    # install any new deps
npx convex dev --once          # warm up Convex
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target npm run agent:once
```

If Nia↔GitHub linking is now done, flip `.env` to `USE_MOCK_LLM=0` and re-run — the real GPT-5 analyzer will fire, query Nia for `.md` context, and the critique pass will cull low-confidence findings before they hit GitHub.

Then move on to Plan 3 (Devin handoff + closed loop) by writing it via the brainstorming → writing-plans skills, or read the spec's §17 phase plan for the task breakdown.

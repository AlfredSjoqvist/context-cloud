# Guardian Agent — Design Spec

**Date:** 2026-05-09
**Status:** Approved (post-brainstorm)
**Authors:** Nicolas (lead), one teammate building the context-map authoring agent (out of scope)
**Hackathon:** Nozomio Hackathon — track-agnostic submission

---

## 1. Mission

A 24/7 autonomous engineer that knows what your code is *supposed* to do.

The guardian wakes itself in a Tensorlake sandbox on a continuous loop, reads each code file alongside a structured context map (intent / architecture / examples / constraints) maintained by a sibling agent, and detects three classes of issue:

1. **Intent drift** — code stopped matching its `.md` spec
2. **Security vulnerabilities** — CVEs surfaced by `npm audit` plus constraint violations like missing auth
3. **Bugs** — logic errors against documented examples and constraints

Every confirmed finding is filed as a GitHub issue with a citation linking the violating line to the violated `.md` constraint. Findings are handed off to Devin for autonomous fixing. When Devin's PR opens, the guardian re-scans the affected file and either confirms resolution or sharpens the prompt and re-spawns Devin. Closed loop, no human in the seat.

## 2. Goals

- **Autonomous loop** — guardian runs continuously without human invocation
- **Drift detection** — find divergence between code and the documented intent / constraints in `.md` context files (the unique value prop)
- **Security floor** — `npm audit` always provides at least one ironclad finding so the demo is never empty-handed
- **Citation discipline** — every finding cites a specific code line + a specific `.md` constraint line, both verified before filing
- **Closed loop with Devin** — the guardian owns findings through to verified resolution, including sharpening the prompt when Devin's first attempt is incomplete
- **Statefulness** — durable memory survives sandbox restarts and is load-bearing for dedup, sharpen iteration tracking, and cross-cycle continuity

## 3. Non-goals

- Multi-repo support (single demo repo)
- User-feedback ingestion (cut from v1; encoded as `.md` constraints if needed)
- Auto-merging Devin's PRs (human or external CI gate)
- GitHub App / OAuth (PAT for v1; clean swap path preserved — see §13)
- UI authentication (public read-only log viewer)
- Retries with alternative LLMs
- Tests on the planted demo repo (out of scope for the demo target)
- Building the context-map authoring agent itself (teammate owns it; guardian only consumes the produced `.md` files)

## 4. Architecture

```
┌─────────────────────── Tensorlake Sandbox ───────────────────────┐
│                                                                  │
│  ┌──────────────────── Guardian (OpenAI Agents SDK) ──────────┐  │
│  │                                                            │  │
│  │   Cycle Loop ──► Scan Strategy ──► Analysis ──► Handoff   │  │
│  │       ▲              │                │            │       │  │
│  │       │              ▼                ▼            ▼       │  │
│  │       └────── Reconcile ◄── Citation Check ────────┘      │  │
│  │                                                            │  │
│  └────────────────┬──────────┬──────────┬─────────────────────┘  │
│                   │          │          │                        │
└───────────────────┼──────────┼──────────┼────────────────────────┘
                    │          │          │
            ┌───────▼───┐ ┌────▼────┐ ┌───▼────────────┐
            │   Nia     │ │ Convex  │ │  GitHub +      │
            │  MCP      │ │ (state  │ │  Devin APIs    │
            │ (code +   │ │  + live │ │                │
            │  .md      │ │  events)│ │                │
            │  index)   │ │         │ │                │
            └───────────┘ └────┬────┘ └────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │ Vercel-hosted    │
                    │ log viewer       │
                    │ (subscribes to   │
                    │  Convex events)  │
                    └──────────────────┘
```

### Stack roles (load-bearing — removing any of these breaks the system)

| Layer | Tool | Role |
|---|---|---|
| Sandbox / always-on execution | **Tensorlake** | Background daemon, durable across cycles, schedule-driven wake-ups |
| Agent runtime | **OpenAI Agents SDK + GPT-5** | Reasoning, tool use over MCP, structured outputs |
| Context layer | **Nia MCP** | Indexes codebase + `.md` corpus; semantic search; citation verification |
| State + live UI | **Convex** | Findings, runs, PR mappings, event stream — UI subscribes for free |
| Demo surface | **Vercel** | Hosts the log viewer at a public URL |
| External actions | **GitHub API + Devin API** | File issues, comment on PRs, spawn runs |

## 5. Boundaries with teammate's work

| Component | Owner | Notes |
|---|---|---|
| Guardian agent + cycle loop + reconciler | This spec | All code in this repo |
| Convex state + log viewer UI | This spec | Same repo, deployed independently |
| Context-map authoring agent (creates / updates `.md` files) | Teammate | Out of scope; entirely separate process |
| The `.md` files themselves | Teammate (in production) | Hand-authored in the planted demo repo for v1 |

**Contract between them:** the guardian reads `.md` files from a known directory layout (`.context-map/...`) via Nia. Teammate's agent writes them. No runtime coupling. For the demo, the `.md` files are pre-authored and committed to the planted demo repo.

## 6. Cycle anatomy

Every cycle is a single state machine. Idempotent — if the sandbox dies mid-cycle, the next wake-up resumes cleanly because every state mutation is persisted to Convex before the next phase runs.

```
WAKE ──► PLAN ──► SCAN ──► ANALYZE ──► CRITIQUE ──► HANDOFF ──► RECONCILE ──► SLEEP
                                              │
                                              └─ (no findings) ──► SLEEP
```

| Phase | Output |
|---|---|
| WAKE | Cycle row written to Convex (`status: running`) |
| PLAN | Selected file list with reason per pick |
| SCAN | Per-file context bundle (code + top-K `.md` chunks + recent diff) |
| ANALYZE | Raw findings (pre-citation verification) |
| CRITIQUE | Findings either dropped or marked verified |
| HANDOFF | Issues filed, Devin runs spawned, state transitions to `devin_running` |
| RECONCILE | Open PRs re-checked; status transitions; verifications and sharpens triggered |

Default wake-up cadence: **60 seconds** (env-configurable). Production cadence would be 5–10 minutes; demo cadence is faster so changes are visible quickly.

## 7. Scan strategy

Two-track plan per cycle, both feeding into a single ranked file list.

### Track 1 — rule-based priority queue

Each file in `fileScanHistory` has a score recomputed every cycle:

```
score = w1 · changed_since_last_scan
      + w2 · churn_rate_30d
      + w3 · security_sensitivity      (from .md tag, if present)
      + w4 · time_since_deep_scan
      − w5 · recent_clean_scans
```

Top `GUARDIAN_PRIORITY_BUDGET` (default 3) files picked. Anything changed since the last cycle is always included.

### Track 2 — LLM judgment pick

Once per cycle, a small Agent gets the cycle summary + a Nia tool surface and asks GPT-5:

> "Given the recent scan history, the open findings, and the `.md` corpus, pick 1–2 files worth a deep look this cycle that the priority function might miss. Justify each pick in one sentence."

Available tools: `nia.searchCode`, `nia.searchContext`. The agent may return `[]` if it has no high-value picks; it must never falsely fill the budget.

Picks get appended to the plan with reason logged. The reason line is intentionally surfaced in the event stream — it's the most concrete demonstration of agent reasoning.

## 8. Analysis engine

For each picked file, build the prompt from Nia (not raw filesystem):

```
nia.readFile(path)           → code body
nia.searchContext(file=path, top_k=8)  → most-relevant .md chunks
nia.recentDiff(path)         → last N commits touching this file
```

### Analyzer prompt (system message — abbreviated)

> You are a guardian agent reviewing a single source file against its documented intent and constraints. Output zero or more findings strictly in the schema. Every finding MUST include a citation: the exact `.md` file + line + verbatim text of the constraint violated, and the exact code line + excerpt that violates it. If you cannot cite both, do not report the finding.

### Output schema (zod, structured output)

```ts
const Finding = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["intent_drift", "security", "bug"]),
  codeCite: z.object({
    line: z.number().int().positive(),
    excerpt: z.string(),
  }),
  constraintCite: z.object({
    mdFile: z.string(),
    line: z.number().int().positive(),
    text: z.string(),
  }),
  reasoning: z.string(),
  suggestedFixDirection: z.string(),
});

const ReportFindings = z.object({
  findings: z.array(Finding),
});
```

### Security floor — `npm audit`

Before the LLM pass on `package.json` (or any cycle that touches dependency files), `npm audit --json` runs in the sandbox. CVEs become pre-baked findings (no LLM needed) with citation pointing at `package.json:<line>`. This guarantees a hallucination-free finding floor regardless of LLM behavior.

### Critique pass — hallucination defense

Each finding from the analyzer goes through two cheap verifications:

1. **Programmatic citation check** (`agent/analyze/citation.ts`):
   - `codeCite.line` exists in the file at the time of the scan
   - `codeCite.excerpt` matches the code at that line (substring match, whitespace-tolerant)
   - `constraintCite.text` actually appears at `mdFile:line` (verified via Nia)
   - **Any failure → drop the finding, log "dropped: hallucinated citation"**

2. **LLM self-critique** (smaller, cheaper model — `gpt-5-mini`):
   > "Re-read the code excerpt and the constraint. Does the code as written actually violate the constraint? If you're <80% confident, drop the finding. Output: `{ confident: bool, reason: string }`."
   - **`confident: false` → drop, log the reason**

Both passes run sequentially per finding. Combined cost is <$0.01 per finding. The dropped reasons are kept in the event log — they're useful diagnostics and good observability.

## 9. Handoff to Devin

Surviving findings flow:

1. **Dedup against `findings.by_fingerprint`** — `fingerprint = sha256(path + constraintCite.mdFile + constraintCite.line + codeCite.line)`. If a non-resolved row with the same fingerprint exists, skip.
2. **GitHub issue created** via API. Body template:

   ```markdown
   ## Guardian Finding — [intent_drift|security|bug]
   **Severity:** high
   **File:** src/routes/login.ts:42
   **Violated constraint:** login-constraints.md:1
   > All authentication endpoints MUST verify CSRF token via the
   > `requireCsrfToken` middleware before processing the request body.
   **Reasoning:** <agent reasoning>
   **Suggested direction:** <fix direction>
   **Devin run:** <linked once spawned>
   ---
   _filed by guardian cycle <N> · run id <uuid>_
   ```

3. **Devin run spawned** via API with structured prompt:

   > Resolve issue #N. Constraint violated: `<verbatim constraint text>`. Code line: `<verbatim code excerpt>`. The fix MUST satisfy the constraint exactly as written — do not weaken it. When done, open a PR and link this issue.

4. **Convex rows updated:**
   - `findings`: `status` → `devin_running`, `githubIssueNumber` set
   - `devinRuns`: new row with `findingId`, `devinRunId`, `iteration: 1`, `promptUsed`

## 10. Closed loop & finding state machine

```
              ┌──────────────┐
              │   detected   │  (post-critique, ready to file)
              └──────┬───────┘
                     │ filed
                     ▼
              ┌──────────────┐
              │ devin_running │
              └──────┬───────┘
                     │ pr_opened (webhook or poll)
                     ▼
              ┌──────────────┐
              │ pr_open      │ ─── guardian comments cite-context on PR
              └──────┬───────┘
                     │ pr_merged
                     ▼
              ┌──────────────┐
              │ verifying    │ ─── next cycle re-scans the file
              └──────┬───────┘
                     │
            ┌────────┴────────┐
            │                 │
        constraint          constraint
        satisfied            still violated
            │                 │
            ▼                 ▼
       ┌─────────┐       ┌─────────────────────┐
       │resolved │       │ reopened_sharpened  │  ─── new Devin run
       └─────────┘       └─────────────────────┘     with sharper prompt
                                  │
                                  └──► pr_open (loop again, max 2 iterations)
```

**Hard cap:** `sharpenIterations <= 2`. After two failed re-verifications, status moves to `escalated` and a human gets pinged. Prevents infinite Devin spending and infinite-loop demos.

### Sharpen prompt construction

When a `verifying` re-scan finds the constraint still violated, `buildSharpenPrompt` constructs a re-prompt that includes:

1. The previous Devin run's diff (pulled via GitHub API)
2. The verbatim constraint citation (from the still-failing finding)
3. A concrete description of *why* the previous diff didn't satisfy the constraint, drawn from the analyzer's reasoning on the re-scan
4. Optional canonical examples drawn from the `.md` corpus via `nia.searchContext`

The re-prompt is logged in full into `devinRuns.promptUsed` so the sharpen step is auditable and reproducible.

### PR event sourcing

Two paths, both wired:

- **GitHub webhook → Convex HTTP action → Convex mutation.** Sub-second event propagation. Webhook URL is the deployed Convex HTTP action with shared-secret HMAC verification.
- **Fallback: poll GitHub for PR status every cycle** during `RECONCILE`. Less elegant but resilient if webhook setup is unreliable.

Whichever sees the PR-merged event first wins. Both paths converge on the same Convex mutation, so duplicate events are idempotent.

## 11. Convex schema

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  cycles: defineTable({
    cycleNumber: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    plannedFiles: v.array(
      v.object({ path: v.string(), reason: v.string() }),
    ),
    summary: v.optional(v.string()),
  }).index("by_cycle_number", ["cycleNumber"]),

  fileScanHistory: defineTable({
    path: v.string(),
    lastScannedCycle: v.number(),
    lastScannedAt: v.number(),
    fileHash: v.string(),
    cleanScanStreak: v.number(),
    securityRotationAt: v.number(),
  }).index("by_path", ["path"]),

  findings: defineTable({
    fingerprint: v.string(),
    cycleDetected: v.number(),
    status: v.union(
      v.literal("detected"),
      v.literal("devin_running"),
      v.literal("pr_open"),
      v.literal("verifying"),
      v.literal("resolved"),
      v.literal("reopened_sharpened"),
      v.literal("escalated"),
    ),
    severity: v.string(),
    category: v.string(),
    path: v.string(),
    codeCite: v.object({
      line: v.number(),
      excerpt: v.string(),
    }),
    constraintCite: v.object({
      mdFile: v.string(),
      line: v.number(),
      text: v.string(),
    }),
    reasoning: v.string(),
    suggestedFixDirection: v.string(),
    githubIssueNumber: v.optional(v.number()),
    sharpenIterations: v.number(),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_status", ["status"]),

  devinRuns: defineTable({
    findingId: v.id("findings"),
    devinRunId: v.string(),
    promptUsed: v.string(),
    spawnedAt: v.number(),
    iteration: v.number(),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    prMergedAt: v.optional(v.number()),
    outcome: v.optional(v.string()),
  }).index("by_finding", ["findingId"]),

  events: defineTable({
    cycleNumber: v.optional(v.number()),
    timestamp: v.number(),
    level: v.union(
      v.literal("info"),
      v.literal("warn"),
      v.literal("finding"),
      v.literal("action"),
    ),
    message: v.string(),
    metadata: v.optional(v.any()),
  }).index("by_timestamp", ["timestamp"]),
});
```

**Why this shape:**

- `findings.fingerprint` kills duplicate filing across cycles
- `findings.sharpenIterations` enforces the 2-iteration cap mechanically
- `events` is append-only, ordered, drives the live UI
- `fileScanHistory` feeds the priority function; `cleanScanStreak` deprioritizes files that scan clean
- Resetting the demo is a single command: clear `cycles`, `findings`, `devinRuns`, `events`

## 12. Project structure

```
guardian/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
│
├── convex/
│   ├── schema.ts
│   ├── findings.ts                  # mutations: create, update, dedup
│   ├── cycles.ts                    # mutations: open/close cycle, write plan
│   ├── devinRuns.ts                 # mutations: spawn, link PR, mark outcome
│   ├── events.ts                    # mutation: append; query: stream
│   └── http.ts                      # HTTP action: GitHub webhook receiver
│
├── agent/
│   ├── main.ts                      # entrypoint: cycle loop, signal handling
│   ├── cycle.ts                     # WAKE → … → SLEEP state machine
│   ├── plan/
│   │   ├── priority.ts              # rule-based priority function
│   │   └── judgment.ts              # LLM judgment-call pick
│   ├── analyze/
│   │   ├── analyzer.ts              # per-file analysis pipeline
│   │   ├── prompts.ts               # analyzer + critique system prompts
│   │   ├── npmAudit.ts              # subprocess wrapper
│   │   └── citation.ts              # programmatic citation verification
│   ├── handoff/
│   │   ├── githubAuth.ts            # PatAuth (v1); AppAuth deferred
│   │   ├── github.ts                # createIssue, commentOnPR, getPRStatus
│   │   ├── devin.ts                 # spawnRun, getRunStatus, sharpen
│   │   └── reconcile.ts             # PR-event → finding-state transitions
│   ├── tools/
│   │   ├── niaClient.ts             # MCP client wrapper + filesystem fallback
│   │   └── convexClient.ts          # convex-js client for writes from agent
│   └── lib/
│       ├── fingerprint.ts           # stable hash for finding dedup
│       ├── logger.ts                # structured event logger → events table
│       └── config.ts                # env loading, validated with zod
│
├── ui/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx                 # subscribes to events via Convex
│   ├── components/
│   │   ├── EventStream.tsx
│   │   ├── EventLine.tsx
│   │   └── CycleHeader.tsx
│   ├── lib/convex.ts
│   ├── package.json
│   └── tsconfig.json
│
├── infra/
│   ├── tensorlake.yaml              # sandbox + schedule definition
│   └── webhook.md                   # GitHub webhook setup checklist
│
└── docs/
    └── superpowers/specs/2026-05-09-guardian-agent-design.md
```

Three independently deployable units:

1. **`agent/`** — Node/TS process, runs in Tensorlake sandbox; no HTTP server, no UI
2. **`convex/`** — pushed via `npx convex deploy`; owns state, real-time subscriptions, GitHub webhook endpoint
3. **`ui/`** — Next.js on Vercel, subscribes to Convex; read-only

The agent never talks to the UI directly. It writes to Convex; the UI subscribes.

## 13. Module contracts

The contracts that define module boundaries and enable parallelization.

```ts
// agent/cycle.ts
export async function runCycle(cycleNumber: number): Promise<CycleResult>;

// agent/plan/priority.ts
export async function priorityPicks(
  cycleNumber: number,
  budget: number,
): Promise<Array<{ path: string; reason: string }>>;

// agent/plan/judgment.ts
export async function judgmentPicks(
  cycleNumber: number,
  alreadyPicked: string[],
  budget: number,
): Promise<Array<{ path: string; reason: string }>>;

// agent/analyze/analyzer.ts
export async function analyzeFile(
  path: string,
  cycleNumber: number,
): Promise<Finding[]>;        // post-critique survivors

// agent/handoff/github.ts
export async function createIssueForFinding(
  f: Finding,
): Promise<{ issueNumber: number }>;
export async function commentOnPR(
  prNumber: number,
  body: string,
): Promise<void>;
export async function getPRStatus(
  prNumber: number,
): Promise<"open" | "merged" | "closed">;

// agent/handoff/devin.ts
export async function spawnDevinRun(args: {
  finding: Finding;
  issueNumber: number;
  iteration: number;
  previousAttemptDiff?: string;
}): Promise<{ devinRunId: string; promptUsed: string }>;

export async function buildSharpenPrompt(args: {
  finding: Finding;
  previousRun: DevinRun;
  previousDiff: string;
}): Promise<string>;

// agent/handoff/reconcile.ts
export async function reconcileOpenPRs(): Promise<void>;

// agent/tools/niaClient.ts
export interface NiaClient {
  searchCode(query: string, opts?: NiaSearchOpts): Promise<Hit[]>;
  searchContext(query: string, opts?: NiaSearchOpts): Promise<Hit[]>;
  readFile(path: string): Promise<string>;
  recentDiff(path: string, n?: number): Promise<string>;
  verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean>;
}
```

## 14. External integration shapes

| Service | Client | Auth | Failure handling |
|---|---|---|---|
| **Tensorlake** | SDK or YAML schedule | API key | Sandbox dies → next schedule wakes a fresh one; cycle idempotency handles it |
| **Nia** | MCP client (stdio or HTTP per Nia's MCP server) | Token | Filesystem fallback in `niaClient.ts`; logged but non-fatal |
| **Convex** | `convex/server` (agent) + `convex/browser` (UI) | Deploy URL + auth token | Hard dependency; no graceful fallback |
| **GitHub** | Octokit | PAT (v1) | 429 → exponential backoff; circuit-break the cycle after 3 consecutive fails |
| **Devin** | REST (`POST /sessions`, `GET /sessions/:id`) | API key | Run timeout → mark `escalated`, move on |
| **OpenAI** | `openai` SDK + `@openai/agents` | API key | Single retry then drop the file from this cycle |

### LLM provider — OpenAI

- **Analyzer + judgment-pick:** `gpt-5` (reasoning model)
- **Critique pass:** `gpt-5-mini` (cheaper; doesn't need full reasoning)
- **Prompt caching:** automatic on inputs ≥1024 tokens. The stable `.md` context block is placed at the start of the prompt and kept byte-stable across analyzer + critique calls so the cache hits.
- **MCP:** OpenAI Agents SDK speaks MCP natively; Nia's MCP server plugs in unchanged.

### GitHub auth strategy

PAT for v1. The `GithubAuth` interface hides the auth layer behind a single accessor:

```ts
export interface GithubAuth {
  forRepo(owner: string, repo: string): Promise<Octokit>;
}

export class PatAuth implements GithubAuth { /* v1 */ }
export class AppAuth implements GithubAuth { /* deferred — drop-in later */ }
```

Every caller goes through `auth.forRepo(...)`. Swapping to a GitHub App later is a `main.ts` one-line change plus the `AppAuth` implementation. No caller changes.

## 15. Environment variables

```env
# openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
OPENAI_CRITIQUE_MODEL=gpt-5-mini

# nia
NIA_API_KEY=
NIA_MCP_URL=

# convex
CONVEX_DEPLOYMENT=
CONVEX_URL=

# github
GITHUB_TOKEN=                # PAT, repo scope
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_WEBHOOK_SECRET=

# devin
DEVIN_API_KEY=
DEVIN_ORG_ID=

# guardian
GUARDIAN_CYCLE_INTERVAL_S=60
GUARDIAN_PRIORITY_BUDGET=3
GUARDIAN_JUDGMENT_BUDGET=1

# test seams (see §17)
USE_MOCK_LLM=0
USE_MOCK_DEVIN=0
SKIP_NIA=0
```

Loaded and validated at startup with zod. Crash on missing required keys; never start half-configured.

## 16. Observability

The `events` table is the single source of truth for what the guardian is doing. Every meaningful state transition writes an event row. The UI is a thin renderer over this stream.

Event levels:
- `info` — plan picks, scan starts, sleep transitions
- `action` — issue filed, Devin run spawned, PR comment, sharpen triggered
- `finding` — a confirmed finding (after critique)
- `warn` — dropped finding, citation check failed, integration hiccup, fallback engaged

Every event row includes `cycleNumber` (when applicable) and a `metadata` JSON blob for structured detail. The UI renders the `message` line; metadata is available on hover for debugging.

## 17. Build sequencing

Vertical slices end-to-end at every checkpoint. Each phase ends with a demoable working state.

### Dependency floor (must be done before any phase)

1. Convex schema deployed
2. Repo scaffolded per §12, env loader with zod, structured logger, three independently deployable units
3. End-to-end "hello world": agent writes one event → UI on Vercel renders it

### Phases

| # | Phase | Output |
|---|---|---|
| 1 | Agent skeleton + cycle loop | UI shows cycles ticking; PLAN/SCAN/SLEEP stubs |
| 2 | Read pipeline (Nia + indexing) | Real PLAN; SCAN logs file body length and top-K context chunks |
| 3 | Write pipeline (mocked findings → GitHub) | Hardcoded finding pushed through full pipeline; real GitHub issue created; dedup verified |
| 4 | Real analyzer + critique | Real findings on the planted demo repo (CSRF + sliding-TTL detected) |
| 5 | npm audit floor | CVE finding fires reliably for `package.json` cycles |
| 6 | Devin handoff + closed loop | Full closed loop for clean fixes (CSRF, CVE) |
| 7 | Sharpen iteration | Sliding-TTL finding triggers sharpen + second Devin run |
| 8 | Judgment-call picks | Plan includes 1–2 LLM-driven picks per cycle with reason |
| 9 | Tensorlake migration | Fully autonomous, scheduled in the sandbox |

### Mock seams (preserved for the entire build, not retrofitted)

- `USE_MOCK_LLM=1` — analyzer returns the planted finding set deterministically. Lifesaver if OpenAI rate-limits during dev.
- `USE_MOCK_DEVIN=1` — Devin run fakes a 30-second delay then writes a fake PR via GitHub API. Decouples loop testing from Devin uptime.
- `SKIP_NIA=1` — `niaClient.ts` falls back to filesystem reads. Lets you keep iterating if Nia is misbehaving.

These are wired in at the start of each phase, used during dev, available as emergency fallbacks during demo.

### Cuts available if scope tightens

Ordered cheapest-to-cut first:

1. Judgment-call picks (Phase 8) — drop entirely; priority alone produces a plan
2. Webhook (keep poll-only) — saves Convex HTTP action complexity
3. Sharpen iteration cap > 1 — show the sharpen mechanic with one iteration only
4. Reduce demo repo plant set from 3 findings to 2 (drop sliding-TTL re-verify)

Cuts at the top remove agentic-depth flair; cuts at the bottom kill the demo. Don't cut from the bottom.

## 18. Demo target repo (built in parallel by another session)

A separate Claude Code session is building the planted demo repo:

- Small TypeScript Express API (~6–8 files)
- `.context-map/` directory with router `.md` files pointing to leaf `.md` files (intent / architecture / examples / constraints per source file)
- Three planted findings:
  1. **Intent drift** — CSRF middleware missing on login route; constraint cites `login-constraints.md:1`
  2. **CVE** — `lodash@4.17.20` pinned with a known critical advisory (`npm audit` floor)
  3. **Subtle constraint requiring re-verify** — sliding-TTL session expiry; absolute-time used instead. Engineered so Devin's first attempt is likely to misinterpret as a longer absolute TTL, requiring sharpen iteration.

The repo is initialized as a fresh GitHub repo and indexed into Nia. Guardian targets it via `GITHUB_OWNER` and `GITHUB_REPO` env vars.

## 19. Risks & open questions

### Known risks

| Risk | Mitigation |
|---|---|
| OpenAI Agents SDK structured-output schema mismatch | Validate `analyzeFile` standalone before wiring into cycle |
| Nia MCP server connectivity issues | Filesystem fallback in `niaClient.ts`; logged warning |
| Devin run latency variance (30s to 4+min) | Mock seam; environment-controlled cycle pacing |
| GitHub webhook unreliable on hackathon Wi-Fi | Poll fallback always running in `RECONCILE` |
| LLM hallucinates findings past citation check | Two-pass critique; planted demo repo has bounded surface area |
| Tensorlake sandbox restart loses work | Cycle idempotency; every state mutation persisted to Convex first |
| Sharpen iteration produces another incorrect fix | Hard cap at 2; status moves to `escalated` |

### Open questions to resolve during build

1. **Tensorlake schedule format** — confirm whether `tensorlake.yaml` schedule supports sub-minute cadence or whether 60s cycles need to be in-process (i.e., long-running daemon with internal timer rather than per-cycle sandbox spawns).
2. **Nia MCP transport** — confirm whether Nia's MCP server is stdio or HTTP and whether OpenAI Agents SDK supports the chosen transport without custom adapters.
3. **Devin re-prompt API shape** — does Devin support a "follow-up" prompt to an existing session or does each iteration spawn a new session? Affects how `devinRuns.iteration` rows are linked.
4. **Convex HTTP action HMAC verification** — confirm GitHub webhook signature verification is straightforward in a Convex HTTP action context (Web Crypto API availability).

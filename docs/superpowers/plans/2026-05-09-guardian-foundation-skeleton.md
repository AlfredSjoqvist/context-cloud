# Guardian Agent — Plan 1: Foundation + Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the guardian project end-to-end so the agent runs a continuous cycle locally, the Convex backend records every state transition, and the Vercel-hosted UI subscribes to the event stream live. Ends with the agent reading the demo repo via Nia and producing a real plan + scan log per cycle. No findings yet — that's Plan 2.

**Architecture:** Three independently deployable units in one repo: (1) `agent/` is a Node/TS long-running process that runs the cycle state machine, (2) `convex/` owns durable state and exposes mutations + queries, (3) `ui/` is a Next.js app on Vercel that subscribes to Convex queries for the live log. The agent never talks to the UI directly; both communicate via Convex. Nia's MCP server is the read layer — every code/.md read goes through `agent/tools/niaClient.ts` which has a filesystem fallback.

**Tech Stack:** TypeScript (strict), Node ≥20, Convex, Next.js 15 (App Router), React 19, Vitest, Zod, `@modelcontextprotocol/sdk` (Nia client), `convex-react`. Tensorlake migration is deferred to Plan 4 — Plan 1 runs the agent locally with `tsx`.

---

## File Structure

The plan creates these files. Files are listed with their single responsibility.

**Root**
- `package.json` — root deps (convex, agent), scripts
- `tsconfig.json` — strict TS config for agent + convex
- `tsconfig.test.json` — vitest-friendly TS config
- `vitest.config.ts` — test runner config
- `.gitignore`
- `.env.example`
- `.nvmrc`
- `README.md`

**Convex (state + queries + webhook receiver later)**
- `convex/schema.ts` — full schema from spec §11
- `convex/events.ts` — `append` mutation + `listRecent` query
- `convex/cycles.ts` — `openCycle`, `closeCycle`, `setPlan`, `latestCycle`
- `convex/findings.ts` — `createIfAbsent` (fingerprint dedup), `setStatus`, `byStatus`
- `convex/devinRuns.ts` — `recordRun`, `linkPR`, `markOutcome`
- `convex/fileScanHistory.ts` — `upsertScan`, `byPath`, `getAll`

**Agent**
- `agent/lib/config.ts` — env loading + zod validation
- `agent/lib/fingerprint.ts` — sha256 finding fingerprint
- `agent/lib/logger.ts` — structured event logger that writes to Convex
- `agent/tools/convexClient.ts` — Convex client wrapper for the agent
- `agent/tools/niaClient.ts` — Nia MCP client + filesystem fallback
- `agent/plan/priority.ts` — rule-based priority function
- `agent/cycle.ts` — WAKE → PLAN → SCAN → SLEEP state machine (analyze/handoff stubbed in Plan 1)
- `agent/main.ts` — long-running process, signal handling

**UI**
- `ui/package.json`
- `ui/tsconfig.json`
- `ui/next.config.mjs`
- `ui/postcss.config.mjs`
- `ui/tailwind.config.ts`
- `ui/app/layout.tsx`
- `ui/app/page.tsx`
- `ui/app/globals.css`
- `ui/lib/convex.ts`
- `ui/components/EventStream.tsx`
- `ui/components/EventLine.tsx`
- `ui/components/CycleHeader.tsx`

**Scripts**
- `scripts/index-demo.ts` — manual: index the demo repo + `.context-map/` into Nia (documented as a one-shot script)

**Tests** (vitest)
- `agent/lib/fingerprint.test.ts`
- `agent/lib/config.test.ts`
- `agent/lib/logger.test.ts`
- `agent/plan/priority.test.ts`
- `agent/tools/niaClient.test.ts`

---

## Prerequisites (verify before starting)

- [ ] Node ≥20 installed (`node --version`)
- [ ] `npm` available (`npm --version`)
- [ ] Convex account ready and `npx convex` available (`npx convex --version`)
- [ ] `OPENAI_API_KEY` available (deferred use, but verify the value is in your password manager)
- [ ] `NIA_API_KEY` and `NIA_MCP_URL` from the hackathon credits
- [ ] A GitHub PAT scoped to the demo repo (`GITHUB_TOKEN`)
- [ ] Demo repo URL on GitHub (built by the parallel session)
- [ ] `gh auth status` shows you are logged in (you will push to GitHub later in Plan 3)

---

## Task 1: Initialize package and TypeScript

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "guardian-agent",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "agent": "tsx agent/main.ts",
    "agent:once": "tsx agent/main.ts --once",
    "convex:dev": "convex dev",
    "convex:deploy": "convex deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "index-demo": "tsx scripts/index-demo.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "convex": "^1.16.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["agent/**/*", "scripts/**/*", "convex/**/*"],
  "exclude": ["node_modules", "ui", "**/*.test.ts"]
}
```

- [ ] **Step 3: Write `.nvmrc`**

```
20
```

- [ ] **Step 4: Write `.gitignore`**

```
# deps
node_modules/
ui/node_modules/

# build
dist/
.next/
out/

# env
.env
.env.local

# convex
.convex/

# misc
.DS_Store
*.log
coverage/
```

- [ ] **Step 5: Write `.env.example`**

```env
# openai (deferred to Plan 2)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
OPENAI_CRITIQUE_MODEL=gpt-5-mini

# nia
NIA_API_KEY=
NIA_MCP_URL=

# convex
CONVEX_DEPLOYMENT=
CONVEX_URL=

# github (deferred to Plan 2)
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_WEBHOOK_SECRET=

# devin (deferred to Plan 3)
DEVIN_API_KEY=
DEVIN_ORG_ID=

# guardian
GUARDIAN_CYCLE_INTERVAL_S=60
GUARDIAN_PRIORITY_BUDGET=3
GUARDIAN_JUDGMENT_BUDGET=1

# test seams
USE_MOCK_LLM=0
USE_MOCK_DEVIN=0
SKIP_NIA=0
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` populated.

- [ ] **Step 7: Verify TypeScript builds**

Run: `npm run typecheck`
Expected: passes (no source files yet, so no errors). If you see errors, they are environment errors not code errors.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .nvmrc .gitignore .env.example package-lock.json
git commit -m "chore: scaffold package, typescript, env"
```

---

## Task 2: Vitest setup with a sanity test

**Files:**
- Create: `vitest.config.ts`
- Create: `tsconfig.test.json`
- Create: `agent/lib/fingerprint.test.ts` (placeholder sanity test in this task)

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["agent/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false,
    pool: "threads",
  },
});
```

- [ ] **Step 2: Write `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "vitest/globals"]
  },
  "include": ["agent/**/*.test.ts", "scripts/**/*.test.ts"]
}
```

- [ ] **Step 3: Write a placeholder sanity test**

`agent/lib/fingerprint.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 1 passing test, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tsconfig.test.json agent/lib/fingerprint.test.ts
git commit -m "chore: vitest config and sanity test"
```

---

## Task 3: Initialize Convex project

**Files:**
- Create: `convex/.gitignore`
- Modify (auto): `package.json` (Convex may add a script)
- Convex generates `convex/_generated/*` automatically — do not commit by hand

- [ ] **Step 1: Run Convex init**

Run: `npx convex dev --configure=new --once`

This will prompt for project name (`guardian-agent`) and team. After creation it writes `CONVEX_DEPLOYMENT` and `CONVEX_URL` to your local `.env.local`. Allow it to do so.

Expected output (abbreviated):
```
✓ Created project guardian-agent
✓ Wrote .env.local
```

- [ ] **Step 2: Confirm `.env.local` was created**

Run: `ls .env.local`
Expected: file exists. It is git-ignored by default.

- [ ] **Step 3: Confirm `convex/_generated/` exists**

Run: `ls convex/_generated/`
Expected: at least `api.d.ts` and `server.d.ts` are present.

- [ ] **Step 4: Verify dev deploy works**

Run: `npx convex dev --once`
Expected: completes without errors. Empty schema is fine for now.

- [ ] **Step 5: Commit**

```bash
git add convex/ package.json package-lock.json
git commit -m "chore: init convex project"
```

---

## Task 4: Define the Convex schema

**Files:**
- Create/Replace: `convex/schema.ts`

- [ ] **Step 1: Write `convex/schema.ts`**

```ts
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

- [ ] **Step 2: Push schema to dev**

Run: `npx convex dev --once`
Expected: schema compiles and deploys; `convex/_generated/dataModel.d.ts` regenerates.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated/
git commit -m "feat(convex): define schema for cycles, findings, runs, events"
```

---

## Task 5: Convex `events` mutations + query

**Files:**
- Create: `convex/events.ts`

- [ ] **Step 1: Write `convex/events.ts`**

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const append = mutation({
  args: {
    cycleNumber: v.optional(v.number()),
    level: v.union(
      v.literal("info"),
      v.literal("warn"),
      v.literal("finding"),
      v.literal("action"),
    ),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      cycleNumber: args.cycleNumber,
      timestamp: Date.now(),
      level: args.level,
      message: args.message,
      metadata: args.metadata,
    });
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});
```

- [ ] **Step 2: Push to dev**

Run: `npx convex dev --once`
Expected: deploys without errors. `convex/_generated/api.d.ts` now exposes `api.events.append` and `api.events.listRecent`.

- [ ] **Step 3: Smoke-test `append` from the dashboard**

Run: `npx convex dashboard`
Then in the dashboard's Functions panel, invoke `events:append` with `{ "level": "info", "message": "convex smoke test" }`.
Expected: returns an `_id`; row visible in `events` table.

- [ ] **Step 4: Commit**

```bash
git add convex/events.ts convex/_generated/
git commit -m "feat(convex): events append + listRecent"
```

---

## Task 6: Convex `cycles` mutations + queries

**Files:**
- Create: `convex/cycles.ts`

- [ ] **Step 1: Write `convex/cycles.ts`**

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const openCycle = mutation({
  args: { cycleNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("cycles", {
      cycleNumber: args.cycleNumber,
      startedAt: Date.now(),
      status: "running",
      plannedFiles: [],
    });
  },
});

export const setPlan = mutation({
  args: {
    cycleId: v.id("cycles"),
    plannedFiles: v.array(
      v.object({ path: v.string(), reason: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cycleId, { plannedFiles: args.plannedFiles });
  },
});

export const closeCycle = mutation({
  args: {
    cycleId: v.id("cycles"),
    status: v.union(v.literal("done"), v.literal("failed")),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cycleId, {
      status: args.status,
      finishedAt: Date.now(),
      summary: args.summary,
    });
  },
});

export const latestCycle = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("cycles")
      .withIndex("by_cycle_number")
      .order("desc")
      .first();
  },
});

export const nextCycleNumber = query({
  args: {},
  handler: async (ctx) => {
    const last = await ctx.db
      .query("cycles")
      .withIndex("by_cycle_number")
      .order("desc")
      .first();
    return (last?.cycleNumber ?? 0) + 1;
  },
});
```

- [ ] **Step 2: Push to dev**

Run: `npx convex dev --once`
Expected: deploys without errors.

- [ ] **Step 3: Commit**

```bash
git add convex/cycles.ts convex/_generated/
git commit -m "feat(convex): cycle open/close/setPlan/latest/nextCycleNumber"
```

---

## Task 7: Convex `findings` mutations + queries (placeholder for Plan 2 use)

**Files:**
- Create: `convex/findings.ts`

These mutations exist now so Plan 2 can call them without schema churn. The agent in Plan 1 doesn't call them yet.

- [ ] **Step 1: Write `convex/findings.ts`**

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createIfAbsent = mutation({
  args: {
    fingerprint: v.string(),
    cycleDetected: v.number(),
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("findings")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .first();
    if (existing) {
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert("findings", {
      ...args,
      status: "detected",
      sharpenIterations: 0,
    });
    return { id, created: true };
  },
});

export const setStatus = mutation({
  args: {
    findingId: v.id("findings"),
    status: v.union(
      v.literal("detected"),
      v.literal("devin_running"),
      v.literal("pr_open"),
      v.literal("verifying"),
      v.literal("resolved"),
      v.literal("reopened_sharpened"),
      v.literal("escalated"),
    ),
    githubIssueNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.githubIssueNumber !== undefined) {
      patch.githubIssueNumber = args.githubIssueNumber;
    }
    await ctx.db.patch(args.findingId, patch);
  },
});

export const incrementSharpen = mutation({
  args: { findingId: v.id("findings") },
  handler: async (ctx, args) => {
    const f = await ctx.db.get(args.findingId);
    if (!f) throw new Error("finding not found");
    await ctx.db.patch(args.findingId, {
      sharpenIterations: f.sharpenIterations + 1,
    });
  },
});

export const byStatus = query({
  args: { status: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("findings")
      .withIndex("by_status", (q) =>
        q.eq("status", args.status as never),
      )
      .collect();
  },
});
```

- [ ] **Step 2: Push to dev**

Run: `npx convex dev --once`
Expected: deploys without errors.

- [ ] **Step 3: Commit**

```bash
git add convex/findings.ts convex/_generated/
git commit -m "feat(convex): findings createIfAbsent, setStatus, incrementSharpen, byStatus"
```

---

## Task 8: Convex `fileScanHistory` mutations + queries

**Files:**
- Create: `convex/fileScanHistory.ts`

- [ ] **Step 1: Write `convex/fileScanHistory.ts`**

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertScan = mutation({
  args: {
    path: v.string(),
    cycleNumber: v.number(),
    fileHash: v.string(),
    cleanScan: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fileScanHistory")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
    const now = Date.now();
    if (!existing) {
      return await ctx.db.insert("fileScanHistory", {
        path: args.path,
        lastScannedCycle: args.cycleNumber,
        lastScannedAt: now,
        fileHash: args.fileHash,
        cleanScanStreak: args.cleanScan ? 1 : 0,
        securityRotationAt: 0,
      });
    }
    await ctx.db.patch(existing._id, {
      lastScannedCycle: args.cycleNumber,
      lastScannedAt: now,
      fileHash: args.fileHash,
      cleanScanStreak: args.cleanScan ? existing.cleanScanStreak + 1 : 0,
    });
    return existing._id;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("fileScanHistory").collect();
  },
});

export const byPath = query({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileScanHistory")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
  },
});
```

- [ ] **Step 2: Push to dev**

Run: `npx convex dev --once`
Expected: deploys without errors.

- [ ] **Step 3: Commit**

```bash
git add convex/fileScanHistory.ts convex/_generated/
git commit -m "feat(convex): fileScanHistory upsertScan, getAll, byPath"
```

---

## Task 9: Convex `devinRuns` mutations (placeholder for Plan 3 use)

**Files:**
- Create: `convex/devinRuns.ts`

- [ ] **Step 1: Write `convex/devinRuns.ts`**

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordRun = mutation({
  args: {
    findingId: v.id("findings"),
    devinRunId: v.string(),
    promptUsed: v.string(),
    iteration: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("devinRuns", {
      findingId: args.findingId,
      devinRunId: args.devinRunId,
      promptUsed: args.promptUsed,
      spawnedAt: Date.now(),
      iteration: args.iteration,
    });
  },
});

export const linkPR = mutation({
  args: {
    runId: v.id("devinRuns"),
    prNumber: v.number(),
    prUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      prNumber: args.prNumber,
      prUrl: args.prUrl,
    });
  },
});

export const markOutcome = mutation({
  args: {
    runId: v.id("devinRuns"),
    outcome: v.string(),
    prMergedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { outcome: args.outcome };
    if (args.prMergedAt !== undefined) patch.prMergedAt = args.prMergedAt;
    await ctx.db.patch(args.runId, patch);
  },
});

export const byFinding = query({
  args: { findingId: v.id("findings") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("devinRuns")
      .withIndex("by_finding", (q) => q.eq("findingId", args.findingId))
      .collect();
  },
});
```

- [ ] **Step 2: Push to dev**

Run: `npx convex dev --once`
Expected: deploys without errors.

- [ ] **Step 3: Commit**

```bash
git add convex/devinRuns.ts convex/_generated/
git commit -m "feat(convex): devinRuns recordRun, linkPR, markOutcome, byFinding"
```

---

## Task 10: `agent/lib/fingerprint.ts` — sha256 helper (TDD)

**Files:**
- Replace: `agent/lib/fingerprint.test.ts` (the placeholder from Task 2)
- Create: `agent/lib/fingerprint.ts`

- [ ] **Step 1: Write the failing test**

`agent/lib/fingerprint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findingFingerprint } from "./fingerprint";

describe("findingFingerprint", () => {
  it("produces a stable hash for the same inputs", () => {
    const a = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 42,
    });
    const b = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 42,
    });
    expect(a).toBe(b);
  });

  it("differs when any input differs", () => {
    const a = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 42,
    });
    const b = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 43,
    });
    expect(a).not.toBe(b);
  });

  it("is a 64-char hex string", () => {
    const fp = findingFingerprint({
      path: "x",
      constraintMdFile: "y",
      constraintLine: 1,
      codeLine: 1,
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fingerprint`
Expected: FAIL — `findingFingerprint` is not exported / module not found.

- [ ] **Step 3: Implement `agent/lib/fingerprint.ts`**

```ts
import { createHash } from "node:crypto";

export interface FingerprintInput {
  path: string;
  constraintMdFile: string;
  constraintLine: number;
  codeLine: number;
}

export function findingFingerprint(input: FingerprintInput): string {
  const payload = [
    input.path,
    input.constraintMdFile,
    String(input.constraintLine),
    String(input.codeLine),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- fingerprint`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/lib/fingerprint.ts agent/lib/fingerprint.test.ts
git commit -m "feat(agent): findingFingerprint sha256 helper"
```

---

## Task 11: `agent/lib/config.ts` — env loading + zod validation (TDD)

**Files:**
- Create: `agent/lib/config.test.ts`
- Create: `agent/lib/config.ts`

- [ ] **Step 1: Write the failing test**

`agent/lib/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const baseEnv = {
  NIA_API_KEY: "k",
  NIA_MCP_URL: "https://nia.example/mcp",
  CONVEX_URL: "https://convex.example",
  GUARDIAN_CYCLE_INTERVAL_S: "60",
  GUARDIAN_PRIORITY_BUDGET: "3",
  GUARDIAN_JUDGMENT_BUDGET: "1",
  USE_MOCK_LLM: "0",
  USE_MOCK_DEVIN: "0",
  SKIP_NIA: "0",
};

describe("loadConfig", () => {
  it("parses valid env into typed config", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.cycleIntervalSeconds).toBe(60);
    expect(cfg.priorityBudget).toBe(3);
    expect(cfg.judgmentBudget).toBe(1);
    expect(cfg.skipNia).toBe(false);
  });

  it("throws when a required key is missing", () => {
    const env = { ...baseEnv, CONVEX_URL: undefined } as Record<string, string | undefined>;
    expect(() => loadConfig(env)).toThrow();
  });

  it("treats SKIP_NIA=1 as true", () => {
    const cfg = loadConfig({ ...baseEnv, SKIP_NIA: "1" });
    expect(cfg.skipNia).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- config`
Expected: FAIL — `loadConfig` not exported.

- [ ] **Step 3: Implement `agent/lib/config.ts`**

```ts
import { z } from "zod";

const boolFromEnv = z
  .union([z.literal("0"), z.literal("1"), z.literal("true"), z.literal("false")])
  .transform((v) => v === "1" || v === "true");

const Schema = z.object({
  niaApiKey: z.string().min(1),
  niaMcpUrl: z.string().url(),
  convexUrl: z.string().url(),
  cycleIntervalSeconds: z.coerce.number().int().positive(),
  priorityBudget: z.coerce.number().int().nonnegative(),
  judgmentBudget: z.coerce.number().int().nonnegative(),
  useMockLlm: boolFromEnv,
  useMockDevin: boolFromEnv,
  skipNia: boolFromEnv,
});

export type GuardianConfig = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GuardianConfig {
  const parsed = Schema.parse({
    niaApiKey: env.NIA_API_KEY,
    niaMcpUrl: env.NIA_MCP_URL,
    convexUrl: env.CONVEX_URL,
    cycleIntervalSeconds: env.GUARDIAN_CYCLE_INTERVAL_S,
    priorityBudget: env.GUARDIAN_PRIORITY_BUDGET,
    judgmentBudget: env.GUARDIAN_JUDGMENT_BUDGET,
    useMockLlm: env.USE_MOCK_LLM,
    useMockDevin: env.USE_MOCK_DEVIN,
    skipNia: env.SKIP_NIA,
  });
  return parsed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- config`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/lib/config.ts agent/lib/config.test.ts
git commit -m "feat(agent): zod-validated config loader"
```

---

## Task 12: `agent/tools/convexClient.ts` — Convex client wrapper

**Files:**
- Create: `agent/tools/convexClient.ts`

This wrapper exists so that other modules import `getConvex()` once and don't construct clients ad-hoc. Tested indirectly via integration smoke tests; no unit tests for the wrapper itself.

- [ ] **Step 1: Write `agent/tools/convexClient.ts`**

```ts
import { ConvexHttpClient } from "convex/browser";
import type { GuardianConfig } from "../lib/config.js";

let cached: ConvexHttpClient | null = null;

export function getConvex(config: GuardianConfig): ConvexHttpClient {
  if (cached) return cached;
  cached = new ConvexHttpClient(config.convexUrl);
  return cached;
}

// Test seam.
export function _resetConvexClientForTests(): void {
  cached = null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/tools/convexClient.ts
git commit -m "feat(agent): convex http client wrapper"
```

---

## Task 13: `agent/lib/logger.ts` — structured event logger (TDD with mocked client)

**Files:**
- Create: `agent/lib/logger.test.ts`
- Create: `agent/lib/logger.ts`

- [ ] **Step 1: Write the failing test**

`agent/lib/logger.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Logger } from "./logger";

describe("Logger", () => {
  it("invokes the convex sink with the structured payload", async () => {
    const calls: unknown[] = [];
    const sink = vi.fn(async (payload: unknown) => {
      calls.push(payload);
    });
    const logger = new Logger({ sink, cycleNumber: 7 });

    await logger.info("scanning login.ts");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      level: "info",
      message: "scanning login.ts",
      cycleNumber: 7,
    });
  });

  it("threads metadata through to the sink", async () => {
    const sink = vi.fn(async () => {});
    const logger = new Logger({ sink, cycleNumber: 1 });
    await logger.action("filed issue", { issueNumber: 34 });
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "action",
        metadata: { issueNumber: 34 },
      }),
    );
  });

  it("never throws when the sink fails", async () => {
    const sink = vi.fn(async () => {
      throw new Error("convex down");
    });
    const logger = new Logger({ sink, cycleNumber: 1 });
    await expect(logger.warn("flake")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- logger`
Expected: FAIL — `Logger` not exported.

- [ ] **Step 3: Implement `agent/lib/logger.ts`**

```ts
export type EventLevel = "info" | "warn" | "finding" | "action";

export interface EventPayload {
  level: EventLevel;
  message: string;
  cycleNumber?: number;
  metadata?: Record<string, unknown>;
}

export type EventSink = (payload: EventPayload) => Promise<void>;

export interface LoggerOptions {
  sink: EventSink;
  cycleNumber?: number;
}

export class Logger {
  constructor(private readonly opts: LoggerOptions) {}

  async info(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("info", message, metadata);
  }

  async warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("warn", message, metadata);
  }

  async finding(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("finding", message, metadata);
  }

  async action(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.emit("action", message, metadata);
  }

  private async emit(
    level: EventLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.opts.sink({
        level,
        message,
        cycleNumber: this.opts.cycleNumber,
        metadata,
      });
    } catch (err) {
      // Never let logging crash the agent. Mirror to stderr for visibility.
      // eslint-disable-next-line no-console
      console.error("[logger] sink failed:", err, { level, message });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- logger`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/lib/logger.ts agent/lib/logger.test.ts
git commit -m "feat(agent): structured Logger with convex sink"
```

---

## Task 14: Convex sink adapter for the Logger

**Files:**
- Modify: `agent/tools/convexClient.ts`

Wire the Logger up to the real Convex `events.append` mutation behind a small factory. No new tests — covered by the smoke test in Task 18.

- [ ] **Step 1: Modify `agent/tools/convexClient.ts` to add the sink factory**

Replace the file contents with:

```ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import type { GuardianConfig } from "../lib/config.js";
import type { EventSink } from "../lib/logger.js";

let cached: ConvexHttpClient | null = null;

export function getConvex(config: GuardianConfig): ConvexHttpClient {
  if (cached) return cached;
  cached = new ConvexHttpClient(config.convexUrl);
  return cached;
}

export function makeConvexEventSink(config: GuardianConfig): EventSink {
  const client = getConvex(config);
  return async (payload) => {
    await client.mutation(api.events.append, {
      level: payload.level,
      message: payload.message,
      cycleNumber: payload.cycleNumber,
      metadata: payload.metadata,
    });
  };
}

export function _resetConvexClientForTests(): void {
  cached = null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/tools/convexClient.ts
git commit -m "feat(agent): convex event sink for Logger"
```

---

## Task 15: `agent/cycle.ts` — skeleton state machine (no Nia/priority yet)

**Files:**
- Create: `agent/cycle.ts`

The cycle in this task uses stub planning. Real planning lands in Task 23.

- [ ] **Step 1: Write `agent/cycle.ts`**

```ts
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { Logger } from "./lib/logger.js";
import type { EventSink } from "./lib/logger.js";

export interface CycleDeps {
  convex: ConvexHttpClient;
  sinkFor: (cycleNumber: number) => EventSink;
}

export interface CycleResult {
  cycleNumber: number;
  status: "done" | "failed";
  plannedFiles: Array<{ path: string; reason: string }>;
}

export async function runCycle(deps: CycleDeps): Promise<CycleResult> {
  const cycleNumber = await deps.convex.query(api.cycles.nextCycleNumber, {});
  const cycleId: Id<"cycles"> = await deps.convex.mutation(
    api.cycles.openCycle,
    { cycleNumber },
  );
  const log = new Logger({ sink: deps.sinkFor(cycleNumber), cycleNumber });

  await log.info("wake");

  try {
    // PLAN — stubbed for Plan 1; real planning replaces this in Task 23.
    const plannedFiles: Array<{ path: string; reason: string }> = [
      { path: "STUB", reason: "no real planner wired yet" },
    ];
    await deps.convex.mutation(api.cycles.setPlan, {
      cycleId,
      plannedFiles,
    });
    await log.info(`plan: ${plannedFiles.length} files`, { plannedFiles });

    // SCAN — stubbed for Plan 1.
    for (const pick of plannedFiles) {
      await log.info(`scan ${pick.path}`, { reason: pick.reason });
    }

    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "done",
      summary: `stubbed cycle: ${plannedFiles.length} picks`,
    });
    await log.info("sleep");
    return { cycleNumber, status: "done", plannedFiles };
  } catch (err) {
    await log.warn(`cycle failed: ${(err as Error).message}`);
    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "failed",
      summary: (err as Error).message,
    });
    return { cycleNumber, status: "failed", plannedFiles: [] };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/cycle.ts
git commit -m "feat(agent): cycle state machine skeleton with stub plan"
```

---

## Task 16: `agent/main.ts` — long-running process with signal handling

**Files:**
- Create: `agent/main.ts`

- [ ] **Step 1: Write `agent/main.ts`**

```ts
import "dotenv/config";
import { loadConfig } from "./lib/config.js";
import { getConvex, makeConvexEventSink } from "./tools/convexClient.js";
import { runCycle } from "./cycle.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const onceFlag = process.argv.includes("--once");
  const config = loadConfig(process.env);
  const convex = getConvex(config);
  const sinkFor = (cycleNumber: number) => makeConvexEventSink(config);

  let stopped = false;
  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[main] received ${signal}, finishing current cycle then exiting`);
    stopped = true;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // eslint-disable-next-line no-console
  console.log(`[main] guardian online · cycle interval ${config.cycleIntervalSeconds}s`);

  while (!stopped) {
    const result = await runCycle({ convex, sinkFor });
    // eslint-disable-next-line no-console
    console.log(
      `[main] cycle ${result.cycleNumber} ${result.status} · ${result.plannedFiles.length} picks`,
    );
    if (onceFlag) break;
    if (stopped) break;
    await sleep(config.cycleIntervalSeconds * 1000);
  }

  // eslint-disable-next-line no-console
  console.log("[main] guardian shutting down cleanly");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[main] fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `dotenv` dep**

Run: `npm install dotenv`
Expected: dependency installed.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Run agent once locally**

Ensure `.env.local` has `CONVEX_URL` populated by Convex from Task 3, and that `NIA_API_KEY` / `NIA_MCP_URL` have placeholder values. Then:

```bash
cp .env.local .env
echo "NIA_API_KEY=placeholder" >> .env
echo "NIA_MCP_URL=https://example.invalid/mcp" >> .env
echo "GUARDIAN_CYCLE_INTERVAL_S=60" >> .env
echo "GUARDIAN_PRIORITY_BUDGET=3" >> .env
echo "GUARDIAN_JUDGMENT_BUDGET=1" >> .env
echo "USE_MOCK_LLM=0" >> .env
echo "USE_MOCK_DEVIN=0" >> .env
echo "SKIP_NIA=0" >> .env
```

Then run: `npm run agent:once`
Expected output (abbreviated):
```
[main] guardian online · cycle interval 60s
[main] cycle 1 done · 1 picks
[main] guardian shutting down cleanly
```

Confirm in the Convex dashboard: one row in `cycles` with `status: done`, multiple rows in `events` (`wake`, `plan: 1 files`, `scan STUB`, `sleep`).

- [ ] **Step 5: Commit**

```bash
git add agent/main.ts package.json package-lock.json
git commit -m "feat(agent): main loop with signal handling and --once flag"
```

---

## Task 17: UI — Next.js scaffold

**Files:**
- Create: `ui/package.json`
- Create: `ui/tsconfig.json`
- Create: `ui/next.config.mjs`
- Create: `ui/postcss.config.mjs`
- Create: `ui/tailwind.config.ts`
- Create: `ui/app/globals.css`
- Create: `ui/app/layout.tsx`
- Create: `ui/app/page.tsx` (placeholder, replaced in Task 19)

- [ ] **Step 1: Write `ui/package.json`**

```json
{
  "name": "guardian-ui",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "convex": "^1.16.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Write `ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./*"],
      "@convex/*": ["../convex/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    "../convex/_generated/**/*.d.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `ui/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 4: Write `ui/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Write `ui/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Write `ui/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  background: #000;
  color: #d4d4d4;
}
```

- [ ] **Step 7: Write `ui/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardian",
  description: "Live event stream for the Guardian agent",
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-mono">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Write `ui/app/page.tsx` (placeholder)**

```tsx
export default function Page(): JSX.Element {
  return (
    <main className="p-6">
      <h1 className="text-2xl">guardian — bootstrapping</h1>
      <p className="opacity-60">UI not yet wired to Convex.</p>
    </main>
  );
}
```

- [ ] **Step 9: Install ui deps**

Run: `cd ui && npm install && cd ..`
Expected: completes; `ui/node_modules/` populated.

- [ ] **Step 10: Verify ui builds**

Run: `cd ui && npm run typecheck && cd ..`
Expected: passes.

Run: `cd ui && npm run build && cd ..`
Expected: build succeeds. (`ui/.next/` is git-ignored.)

- [ ] **Step 11: Commit**

```bash
git add ui/package.json ui/tsconfig.json ui/next.config.mjs ui/postcss.config.mjs ui/tailwind.config.ts ui/app/ ui/package-lock.json
git commit -m "chore(ui): next.js + tailwind scaffold"
```

---

## Task 18: UI — Convex client + live event subscription

**Files:**
- Create: `ui/lib/convex.ts`
- Create: `ui/components/EventLine.tsx`
- Create: `ui/components/EventStream.tsx`
- Create: `ui/components/CycleHeader.tsx`
- Modify: `ui/app/layout.tsx`
- Replace: `ui/app/page.tsx`
- Modify: `ui/.env.local` (set `NEXT_PUBLIC_CONVEX_URL`)

- [ ] **Step 1: Write `ui/lib/convex.ts`**

```ts
"use client";
import { ConvexReactClient } from "convex/react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
}

export const convex = new ConvexReactClient(url);
```

- [ ] **Step 2: Write `ui/components/EventLine.tsx`**

```tsx
"use client";

interface Props {
  readonly timestamp: number;
  readonly level: "info" | "warn" | "finding" | "action";
  readonly message: string;
}

const PREFIX: Record<Props["level"], string> = {
  info: "▸",
  action: "▸",
  finding: "⚠",
  warn: "!",
};

const COLOR: Record<Props["level"], string> = {
  info: "text-zinc-300",
  action: "text-emerald-300",
  finding: "text-amber-300",
  warn: "text-rose-300",
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19);
}

export function EventLine({ timestamp, level, message }: Props): JSX.Element {
  return (
    <div className={`flex gap-3 leading-tight ${COLOR[level]}`}>
      <span className="text-zinc-500">[{formatTimestamp(timestamp)}]</span>
      <span aria-hidden>{PREFIX[level]}</span>
      <span className="whitespace-pre-wrap">{message}</span>
    </div>
  );
}
```

- [ ] **Step 3: Write `ui/components/CycleHeader.tsx`**

```tsx
"use client";

interface Props {
  readonly latestCycle:
    | { cycleNumber: number; status: "running" | "done" | "failed" }
    | null
    | undefined;
}

export function CycleHeader({ latestCycle }: Props): JSX.Element {
  const label = latestCycle
    ? `cycle ${latestCycle.cycleNumber} · ${latestCycle.status}`
    : "no cycles yet";
  return (
    <header className="border-b border-zinc-800 px-6 py-3 text-zinc-400">
      <span>guardian</span>
      <span className="mx-2 opacity-50">|</span>
      <span>{label}</span>
    </header>
  );
}
```

- [ ] **Step 4: Write `ui/components/EventStream.tsx`**

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { EventLine } from "./EventLine";
import { CycleHeader } from "./CycleHeader";

export function EventStream(): JSX.Element {
  const events = useQuery(api.events.listRecent, { limit: 200 });
  const latest = useQuery(api.cycles.latestCycle, {});

  return (
    <div className="min-h-screen flex flex-col">
      <CycleHeader latestCycle={latest ?? null} />
      <main className="px-6 py-4 text-base md:text-lg space-y-1">
        {events === undefined && (
          <div className="text-zinc-500">connecting…</div>
        )}
        {events !== undefined && events.length === 0 && (
          <div className="text-zinc-500">no events yet</div>
        )}
        {events?.map((ev) => (
          <EventLine
            key={ev._id}
            timestamp={ev.timestamp}
            level={ev.level}
            message={ev.message}
          />
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Replace `ui/app/page.tsx`**

```tsx
"use client";

import { ConvexProvider } from "convex/react";
import { convex } from "../lib/convex";
import { EventStream } from "../components/EventStream";

export default function Page(): JSX.Element {
  return (
    <ConvexProvider client={convex}>
      <EventStream />
    </ConvexProvider>
  );
}
```

- [ ] **Step 6: Configure `ui/.env.local`**

Get your Convex deployment URL from the root `.env` (`CONVEX_URL=...`) and add it to a new `ui/.env.local` (which is git-ignored):

```bash
echo "NEXT_PUBLIC_CONVEX_URL=$(grep ^CONVEX_URL .env | cut -d= -f2-)" > ui/.env.local
```

- [ ] **Step 7: Run UI dev server**

Run: `cd ui && npm run dev`
Expected: dev server boots on `http://localhost:3000`. Open it; you should see the header `guardian | cycle N · done` and the event lines from the Task 16 smoke test (`wake`, `plan: 1 files`, `scan STUB`, `sleep`).

If you see "connecting…" indefinitely, recheck that `NEXT_PUBLIC_CONVEX_URL` is set and matches the deployment your agent wrote to.

Stop the dev server with Ctrl-C.

- [ ] **Step 8: Build UI to confirm production build works**

Run: `cd ui && npm run build && cd ..`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add ui/lib/ ui/components/ ui/app/page.tsx ui/app/layout.tsx
git commit -m "feat(ui): convex-subscribed event stream"
```

---

## Task 19: Deploy UI to Vercel (one-time setup)

**Files:** none (deployment configuration is in Vercel's dashboard / CLI)

- [ ] **Step 1: Install Vercel CLI globally if needed**

Run: `npx vercel --version`
Expected: prints a version number. If missing, run `npm i -g vercel` (sudo if needed).

- [ ] **Step 2: Log in**

Run: `npx vercel login`
Follow the prompts.

- [ ] **Step 3: Link the `ui/` directory to a new Vercel project**

```bash
cd ui
npx vercel link
```

When prompted, choose "Link to a new project," accept the default name (or `guardian-ui`), and confirm the directory is `./`.

- [ ] **Step 4: Set the env var on Vercel**

```bash
npx vercel env add NEXT_PUBLIC_CONVEX_URL production
# paste your CONVEX_URL value when prompted
npx vercel env add NEXT_PUBLIC_CONVEX_URL preview
# paste again
npx vercel env add NEXT_PUBLIC_CONVEX_URL development
# paste again
```

- [ ] **Step 5: Deploy**

```bash
npx vercel --prod
```

Expected: prints a URL like `https://guardian-ui-xyz.vercel.app`. Open it. You should see the same header + event log as the local dev server.

- [ ] **Step 6: Note the URL in the README**

`cd ..` and write `README.md` with the following content (replace `<your-vercel-url>` with the URL printed by `vercel --prod` in Step 5):

````
# Guardian Agent

Autonomous code-review agent that runs on a continuous loop, scans the codebase
against a structured `.md` context map, files findings as GitHub issues, and
hands them off to Devin for autonomous fixing.

## Live demo
- **UI:** https://<your-vercel-url>.vercel.app

## Local dev
```bash
npm install
npx convex dev
# in another terminal
npm run agent
```
````

- [ ] **Step 7: Commit**

```bash
git add README.md ui/.vercel
git commit -m "chore: deploy ui to vercel"
```

(`ui/.vercel/project.json` is auto-generated by `vercel link` and is safe to commit.)

---

## Task 20: `agent/tools/niaClient.ts` — Nia MCP wrapper with filesystem fallback (TDD)

**Files:**
- Create: `agent/tools/niaClient.test.ts`
- Create: `agent/tools/niaClient.ts`

The test exercises the filesystem-fallback path so it doesn't require a live Nia server.

- [ ] **Step 1: Write the failing test**

`agent/tools/niaClient.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { createNiaClient } from "./niaClient";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "nia-test-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("niaClient (filesystem fallback)", () => {
  it("readFile returns file contents from the filesystem when SKIP_NIA is true", async () => {
    mkdirSync(join(workdir, "src"));
    writeFileSync(join(workdir, "src/login.ts"), "export const x = 1;\n");

    const nia = createNiaClient({
      skipNia: true,
      mcpUrl: "https://invalid",
      apiKey: "k",
      filesystemRoot: workdir,
    });

    const body = await nia.readFile("src/login.ts");
    expect(body).toBe("export const x = 1;\n");
  });

  it("verifyConstraintCite is true when the line text matches", async () => {
    mkdirSync(join(workdir, "leaves"));
    writeFileSync(
      join(workdir, "leaves/login-constraints.md"),
      "# Constraints\n\n1. Must verify CSRF token\n2. Must rate limit\n",
    );

    const nia = createNiaClient({
      skipNia: true,
      mcpUrl: "https://invalid",
      apiKey: "k",
      filesystemRoot: workdir,
    });

    const ok = await nia.verifyConstraintCite(
      "leaves/login-constraints.md",
      3,
      "1. Must verify CSRF token",
    );
    expect(ok).toBe(true);
  });

  it("verifyConstraintCite is false when the line text does not match", async () => {
    mkdirSync(join(workdir, "leaves"));
    writeFileSync(
      join(workdir, "leaves/login-constraints.md"),
      "# Constraints\n\n1. Must verify CSRF token\n",
    );

    const nia = createNiaClient({
      skipNia: true,
      mcpUrl: "https://invalid",
      apiKey: "k",
      filesystemRoot: workdir,
    });

    const ok = await nia.verifyConstraintCite(
      "leaves/login-constraints.md",
      3,
      "Must rate limit",
    );
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- niaClient`
Expected: FAIL — `createNiaClient` not exported.

- [ ] **Step 3: Implement `agent/tools/niaClient.ts`**

```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface NiaSearchHit {
  readonly path: string;
  readonly line: number;
  readonly excerpt: string;
  readonly score?: number;
}

export interface NiaClient {
  searchCode(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]>;
  searchContext(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]>;
  readFile(path: string): Promise<string>;
  recentDiff(path: string, n?: number): Promise<string>;
  verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean>;
}

export interface NiaClientConfig {
  readonly skipNia: boolean;
  readonly mcpUrl: string;
  readonly apiKey: string;
  /**
   * Filesystem root for the fallback path. Required when `skipNia` is true.
   * Typically the absolute path of the demo target repo cloned into the sandbox.
   */
  readonly filesystemRoot: string;
}

export function createNiaClient(cfg: NiaClientConfig): NiaClient {
  if (cfg.skipNia) {
    return new FilesystemFallbackClient(cfg.filesystemRoot);
  }
  // Real Nia MCP transport lands in Plan 2 once we know the wire format
  // their server exposes. Plan 1 ships the fallback so the cycle runs end-to-end.
  return new FilesystemFallbackClient(cfg.filesystemRoot);
}

class FilesystemFallbackClient implements NiaClient {
  constructor(private readonly root: string) {}

  async searchCode(): Promise<NiaSearchHit[]> {
    return [];
  }

  async searchContext(): Promise<NiaSearchHit[]> {
    return [];
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(join(this.root, path), "utf8");
  }

  async recentDiff(): Promise<string> {
    return "";
  }

  async verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean> {
    const full = join(this.root, mdFile);
    if (!existsSync(full)) return false;
    const lines = readFileSync(full, "utf8").split("\n");
    const actual = lines[line - 1];
    if (actual === undefined) return false;
    return actual.trim() === text.trim();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- niaClient`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/tools/niaClient.ts agent/tools/niaClient.test.ts
git commit -m "feat(agent): nia client wrapper with filesystem fallback"
```

---

## Task 21: `agent/plan/priority.ts` — rule-based priority function (TDD)

**Files:**
- Create: `agent/plan/priority.test.ts`
- Create: `agent/plan/priority.ts`

The priority function is pure given (a) the list of all candidate file paths, (b) the existing `fileScanHistory` rows, and (c) the cycle number. The agent provides those inputs from outside.

- [ ] **Step 1: Write the failing test**

`agent/plan/priority.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { priorityPicks } from "./priority";

const FILES = [
  "src/routes/login.ts",
  "src/routes/payments.ts",
  "src/routes/sessions.ts",
  "package.json",
];

describe("priorityPicks", () => {
  it("includes all files that have never been scanned, up to budget", () => {
    const picks = priorityPicks({
      cycleNumber: 1,
      candidates: FILES,
      history: [],
      budget: 3,
    });
    expect(picks).toHaveLength(3);
    expect(picks.every((p) => p.reason.includes("never scanned"))).toBe(true);
  });

  it("picks files with stale lastScannedCycle first", () => {
    const picks = priorityPicks({
      cycleNumber: 10,
      candidates: FILES,
      history: [
        { path: "src/routes/login.ts", lastScannedCycle: 9, cleanScanStreak: 0 },
        { path: "src/routes/payments.ts", lastScannedCycle: 1, cleanScanStreak: 0 },
        { path: "src/routes/sessions.ts", lastScannedCycle: 5, cleanScanStreak: 0 },
        { path: "package.json", lastScannedCycle: 3, cleanScanStreak: 0 },
      ],
      budget: 1,
    });
    expect(picks).toHaveLength(1);
    expect(picks[0]!.path).toBe("src/routes/payments.ts");
  });

  it("returns an empty array when budget is 0", () => {
    const picks = priorityPicks({
      cycleNumber: 1,
      candidates: FILES,
      history: [],
      budget: 0,
    });
    expect(picks).toEqual([]);
  });

  it("never returns more picks than budget", () => {
    const picks = priorityPicks({
      cycleNumber: 1,
      candidates: FILES,
      history: [],
      budget: 2,
    });
    expect(picks).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- priority`
Expected: FAIL — `priorityPicks` not exported.

- [ ] **Step 3: Implement `agent/plan/priority.ts`**

```ts
export interface FileScanState {
  readonly path: string;
  readonly lastScannedCycle: number;
  readonly cleanScanStreak: number;
}

export interface PriorityInput {
  readonly cycleNumber: number;
  readonly candidates: readonly string[];
  readonly history: readonly FileScanState[];
  readonly budget: number;
}

export interface PriorityPick {
  readonly path: string;
  readonly reason: string;
}

export function priorityPicks(input: PriorityInput): PriorityPick[] {
  if (input.budget <= 0) return [];

  const byPath = new Map(input.history.map((h) => [h.path, h]));
  const scored = input.candidates.map((path) => {
    const h = byPath.get(path);
    if (!h) {
      return {
        path,
        reason: "never scanned",
        score: Number.POSITIVE_INFINITY,
      };
    }
    const staleness = input.cycleNumber - h.lastScannedCycle;
    const cleanPenalty = h.cleanScanStreak * 0.5;
    return {
      path,
      reason: `stale by ${staleness} cycles (clean streak ${h.cleanScanStreak})`,
      score: staleness - cleanPenalty,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, input.budget).map(({ path, reason }) => ({ path, reason }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- priority`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/plan/priority.ts agent/plan/priority.test.ts
git commit -m "feat(agent): rule-based priority picks"
```

---

## Task 22: `scripts/index-demo.ts` — manual demo-target indexing entrypoint

**Files:**
- Create: `scripts/index-demo.ts`

This script is a placeholder that prints the steps a human runs against Nia's CLI/console. The actual MCP-driven indexing happens server-side; this script documents the contract and verifies the demo repo is accessible from the agent's host.

- [ ] **Step 1: Write `scripts/index-demo.ts`**

```ts
import "dotenv/config";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DEMO_REPO_ENV = "DEMO_REPO_LOCAL_PATH";

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`[index-demo] ${msg}`);
  process.exit(1);
}

function listFiles(root: string, rel = ""): string[] {
  const entries = readdirSync(join(root, rel));
  const out: string[] = [];
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const r = rel ? `${rel}/${name}` : name;
    const full = join(root, r);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(root, r));
    } else {
      out.push(r);
    }
  }
  return out;
}

const demoPath = process.env[DEMO_REPO_ENV];
if (!demoPath) fail(`set ${DEMO_REPO_ENV} to the absolute path of the demo target repo`);
if (!existsSync(demoPath!)) fail(`demo path does not exist: ${demoPath}`);
if (!existsSync(join(demoPath!, ".context-map"))) {
  fail(`demo repo missing .context-map/ directory: ${demoPath}`);
}

const allFiles = listFiles(demoPath!);
const codeFiles = allFiles.filter(
  (f) => f.startsWith("src/") && (f.endsWith(".ts") || f.endsWith(".js")),
);
const ctxFiles = allFiles.filter((f) => f.startsWith(".context-map/") && f.endsWith(".md"));

// eslint-disable-next-line no-console
console.log(`[index-demo] demo path: ${demoPath}`);
// eslint-disable-next-line no-console
console.log(`[index-demo] code files: ${codeFiles.length}`);
// eslint-disable-next-line no-console
console.log(`[index-demo] context files: ${ctxFiles.length}`);

if (codeFiles.length === 0) fail("no code files found under src/");
if (ctxFiles.length === 0) fail("no .md files found under .context-map/");

// eslint-disable-next-line no-console
console.log("[index-demo] OK — both sources present.");
// eslint-disable-next-line no-console
console.log(
  "[index-demo] Next: index this directory into Nia per their docs " +
    "(MCP server URL = NIA_MCP_URL).",
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Test against the demo repo**

Assuming the parallel session's demo repo is cloned at `~/projects/guardian-demo-target`:

```bash
DEMO_REPO_LOCAL_PATH=$HOME/projects/guardian-demo-target npm run index-demo
```

Expected output:
```
[index-demo] demo path: /Users/.../guardian-demo-target
[index-demo] code files: 6
[index-demo] context files: 12
[index-demo] OK — both sources present.
[index-demo] Next: index this directory into Nia per their docs (MCP server URL = ...).
```

If the parallel session hasn't finished yet, run this against any directory that has a `src/` and `.context-map/` to verify the script works; the real index-demo invocation can wait.

- [ ] **Step 4: Commit**

```bash
git add scripts/index-demo.ts
git commit -m "feat(scripts): demo-target indexing entrypoint"
```

---

## Task 23: Wire priority + Nia into the cycle (replace the stubs)

**Files:**
- Replace: `agent/cycle.ts`

- [ ] **Step 1: Modify `agent/cycle.ts`**

Replace the file with:

```ts
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { Logger } from "./lib/logger.js";
import type { EventSink } from "./lib/logger.js";
import type { NiaClient } from "./tools/niaClient.js";
import { priorityPicks } from "./plan/priority.js";
import type { FileScanState } from "./plan/priority.js";
import { createHash } from "node:crypto";

export interface CycleDeps {
  convex: ConvexHttpClient;
  nia: NiaClient;
  sinkFor: (cycleNumber: number) => EventSink;
  candidatesProvider: () => Promise<readonly string[]>;
  priorityBudget: number;
}

export interface CycleResult {
  cycleNumber: number;
  status: "done" | "failed";
  plannedFiles: Array<{ path: string; reason: string }>;
}

function hashContent(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export async function runCycle(deps: CycleDeps): Promise<CycleResult> {
  const cycleNumber = await deps.convex.query(api.cycles.nextCycleNumber, {});
  const cycleId: Id<"cycles"> = await deps.convex.mutation(
    api.cycles.openCycle,
    { cycleNumber },
  );
  const log = new Logger({ sink: deps.sinkFor(cycleNumber), cycleNumber });

  await log.info("wake");

  try {
    // PLAN
    const candidates = await deps.candidatesProvider();
    const historyRows = await deps.convex.query(api.fileScanHistory.getAll, {});
    const history: FileScanState[] = historyRows.map((row) => ({
      path: row.path,
      lastScannedCycle: row.lastScannedCycle,
      cleanScanStreak: row.cleanScanStreak,
    }));

    const plannedFiles = priorityPicks({
      cycleNumber,
      candidates,
      history,
      budget: deps.priorityBudget,
    });

    await deps.convex.mutation(api.cycles.setPlan, { cycleId, plannedFiles });
    await log.info(`plan: ${plannedFiles.length} files`, { plannedFiles });

    // SCAN — Plan 1 only reads the file + logs context size; analysis is Plan 2.
    for (const pick of plannedFiles) {
      await log.info(`scan ${pick.path}`, { reason: pick.reason });
      const body = await deps.nia.readFile(pick.path);
      await log.info(
        `read ${pick.path}: ${body.split("\n").length} lines`,
        { bytes: body.length },
      );
      await deps.convex.mutation(api.fileScanHistory.upsertScan, {
        path: pick.path,
        cycleNumber,
        fileHash: hashContent(body),
        cleanScan: true,
      });
    }

    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "done",
      summary: `${plannedFiles.length} picks scanned`,
    });
    await log.info("sleep");
    return { cycleNumber, status: "done", plannedFiles };
  } catch (err) {
    await log.warn(`cycle failed: ${(err as Error).message}`);
    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "failed",
      summary: (err as Error).message,
    });
    return { cycleNumber, status: "failed", plannedFiles: [] };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/cycle.ts
git commit -m "feat(agent): wire priority picks and nia reads into the cycle"
```

---

## Task 24: Wire `main.ts` to the real cycle dependencies

**Files:**
- Replace: `agent/main.ts`

- [ ] **Step 1: Replace `agent/main.ts`**

```ts
import "dotenv/config";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./lib/config.js";
import { getConvex, makeConvexEventSink } from "./tools/convexClient.js";
import { createNiaClient } from "./tools/niaClient.js";
import { runCycle } from "./cycle.js";

const DEMO_REPO_ENV = "DEMO_REPO_LOCAL_PATH";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listSrcFiles(root: string): string[] {
  const out: string[] = [];
  function walk(rel: string): void {
    const entries = readdirSync(join(root, rel));
    for (const name of entries) {
      if (name === "node_modules" || name === ".git") continue;
      const r = rel ? `${rel}/${name}` : name;
      const full = join(root, r);
      if (statSync(full).isDirectory()) {
        walk(r);
      } else if (r.startsWith("src/") && (r.endsWith(".ts") || r.endsWith(".js"))) {
        out.push(r);
      }
    }
  }
  walk("");
  return out;
}

async function main(): Promise<void> {
  const onceFlag = process.argv.includes("--once");
  const config = loadConfig(process.env);

  const demoRoot = process.env[DEMO_REPO_ENV];
  if (!demoRoot) throw new Error(`${DEMO_REPO_ENV} is required`);
  if (!existsSync(demoRoot)) throw new Error(`${DEMO_REPO_ENV} does not exist: ${demoRoot}`);

  const convex = getConvex(config);
  const sinkFor = (_cycleNumber: number) => makeConvexEventSink(config);
  const nia = createNiaClient({
    skipNia: config.skipNia,
    mcpUrl: config.niaMcpUrl,
    apiKey: config.niaApiKey,
    filesystemRoot: demoRoot,
  });

  const candidatesProvider = async () => listSrcFiles(demoRoot);

  let stopped = false;
  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[main] received ${signal}, finishing current cycle then exiting`);
    stopped = true;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // eslint-disable-next-line no-console
  console.log(
    `[main] guardian online · demo=${demoRoot} · interval=${config.cycleIntervalSeconds}s`,
  );

  while (!stopped) {
    const result = await runCycle({
      convex,
      nia,
      sinkFor,
      candidatesProvider,
      priorityBudget: config.priorityBudget,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[main] cycle ${result.cycleNumber} ${result.status} · ${result.plannedFiles.length} picks`,
    );
    if (onceFlag) break;
    if (stopped) break;
    await sleep(config.cycleIntervalSeconds * 1000);
  }

  // eslint-disable-next-line no-console
  console.log("[main] guardian shutting down cleanly");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[main] fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/main.ts
git commit -m "feat(agent): main wires demo path + nia + priority"
```

---

## Task 25: End-to-end smoke test

This is verification only — no new files.

- [ ] **Step 1: Ensure prerequisites**

The parallel demo-target session must have produced a repo with `src/` and `.context-map/`. Clone it locally:

```bash
git clone <demo-target-repo-url> ~/projects/guardian-demo-target
```

Set `SKIP_NIA=1` in `.env` for now so the agent uses the filesystem fallback (the real Nia indexing happens in Plan 2):

```bash
sed -i.bak 's/^SKIP_NIA=0/SKIP_NIA=1/' .env && rm .env.bak
```

- [ ] **Step 2: Run the agent for one cycle**

```bash
DEMO_REPO_LOCAL_PATH=$HOME/projects/guardian-demo-target npm run agent:once
```

Expected output (abbreviated):
```
[main] guardian online · demo=... · interval=60s
[main] cycle 2 done · 3 picks
[main] guardian shutting down cleanly
```

- [ ] **Step 3: Verify in Convex dashboard**

Open Convex dashboard. Confirm:
- A new row in `cycles` with `status: done`, `plannedFiles` containing 3 picks
- Multiple rows in `events` for the new cycle: `wake`, `plan: 3 files`, `scan ...` (×3), `read ...` (×3), `sleep`
- 3 new rows in `fileScanHistory` (one per scanned file)

- [ ] **Step 4: Verify in the deployed UI**

Open your Vercel URL. The header should show the new cycle number; the event log should stream all the events from Step 2 above.

- [ ] **Step 5: Run the agent in continuous mode for ~3 minutes**

```bash
DEMO_REPO_LOCAL_PATH=$HOME/projects/guardian-demo-target npm run agent
```

Watch the UI. Every `GUARDIAN_CYCLE_INTERVAL_S` seconds (60 by default — you can drop to 15 in `.env` for faster feedback) you should see a new cycle's events stream in. Stop with Ctrl-C; the agent should finish the current cycle and exit cleanly.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass (fingerprint, config, logger, niaClient, priority).

- [ ] **Step 7: Final commit / tag**

```bash
git tag plan-1-foundation-skeleton
git log --oneline -25
```

---

## Plan complete

After Task 25, you have:

- A Convex backend with the full schema and the mutations every later plan needs
- An agent process that runs an idempotent cycle loop, plans files via a tested priority function, reads them via the Nia client (filesystem fallback for now), records scan history, and emits a structured event stream
- A Vercel-hosted UI that subscribes to events live
- A clean `GithubAuth` extension point ready for Plan 2 (issue filing) and Plan 3 (PR comments)
- Test suite covering all pure helpers

Plan 2 will replace the stubbed analyzer with a real OpenAI Agents SDK pipeline + npm-audit floor and start filing real issues.

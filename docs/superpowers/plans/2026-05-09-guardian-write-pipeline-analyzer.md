# Guardian Agent — Plan 2: Write Pipeline + Real Analyzer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the cycle's SCAN phase into a real pipeline that detects three classes of issue (intent drift via LLM, CVEs via npm audit, intent drift via mocked seam) and files each as a GitHub issue with verified citations. Ends with `cycle 1 done · 2 findings filed (1 LLM, 1 CVE)` against the planted demo repo and matching issues live on GitHub.

**Architecture:** Adds two new directory trees to the agent — `agent/analyze/` for the analyzer + critique + npm-audit + citation pipeline, and `agent/handoff/` for the GitHub auth + client. Cycle becomes WAKE → PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → SLEEP. The analyzer is dispatched per-picked-file: `package.json` → `npmAudit`, code files → LLM analyzer (or `mockAnalyzer` when `USE_MOCK_LLM=1`). Every finding goes through programmatic citation verification + a small LLM critique before being filed. Issues are deduped via the existing `findings.createIfAbsent` fingerprint.

**Tech Stack:** Adds `openai` (Anthropic-equivalent SDK), `@openai/agents` (Agents SDK with MCP support), `@octokit/rest` (GitHub API). Existing stack (Convex, Vitest, Zod, Nia MCP via `@modelcontextprotocol/sdk`) is unchanged.

---

## File Structure

The plan creates and modifies these files. Each has one clear responsibility.

**New files**
- `agent/analyze/types.ts` — `Finding` type, shared between analyzer + handoff modules
- `agent/analyze/citation.ts` — programmatic verification of `codeCite.line` and `constraintCite.text` against actual files (via `niaClient.readFile` + `niaClient.verifyConstraintCite`)
- `agent/analyze/npmAudit.ts` — subprocess wrapper around `npm audit --json`, parses CVEs into `Finding[]`
- `agent/analyze/mockAnalyzer.ts` — deterministic planted findings used when `USE_MOCK_LLM=1`
- `agent/analyze/prompts.ts` — analyzer + critique system prompts + zod output schemas
- `agent/analyze/openaiClient.ts` — OpenAI Agents SDK wrapper with cached client + Nia MCP server attachment
- `agent/analyze/analyzer.ts` — real LLM analyzer (`analyzeFile(path)`) using Agents SDK + Nia tools
- `agent/analyze/critique.ts` — small LLM critique pass that drops low-confidence findings
- `agent/handoff/githubAuth.ts` — `GithubAuth` interface + `PatAuth` implementation
- `agent/handoff/github.ts` — `createIssueForFinding`, `commentOnPR`, `getPRStatus`

**Modified files**
- `agent/lib/config.ts` — surface `openaiApiKey`, `openaiModel`, `openaiCritiqueModel`, `githubToken`, `githubOwner`, `githubRepo`
- `agent/cycle.ts` — extend `CycleDeps`, add ANALYZE/CRITIQUE/HANDOFF phases
- `agent/main.ts` — wire new deps (analyzer factory, github client) into `runCycle`
- `agent/tools/niaClient.ts` — real MCP transport when `skipNia=false`
- `package.json` — add the three deps

**New tests**
- `agent/analyze/citation.test.ts`
- `agent/analyze/npmAudit.test.ts`
- `agent/analyze/mockAnalyzer.test.ts`
- `agent/handoff/githubAuth.test.ts`
- `agent/handoff/github.test.ts`
- `agent/analyze/critique.test.ts`

---

## Prerequisites

Before starting, verify:

- [ ] Plan 1 is on `nicolas/plan-1-foundation` and the smoke test runs cleanly (`DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target npm run agent:once` produces a `done` cycle).
- [ ] `OPENAI_API_KEY` is available — sponsor credits from the hackathon.
- [ ] A `GITHUB_TOKEN` (PAT) is available with `repo` scope. Do NOT use a token from another machine — generate a fresh one from your GitHub account if you don't have one. Required scopes: `repo` (full).
- [ ] Demo target repo is at `~/Desktop/guardian-demo-target` and has been pushed to GitHub by the parallel session. We need its `<owner>/<repo>` slug for `GITHUB_OWNER` / `GITHUB_REPO`.
- [ ] Demo repo's `package.json` pins a vulnerable dependency (`lodash@4.17.20` was the planted CVE per the design). If `npm audit` in the demo repo returns no advisories, the CVE finding test will fail — fix the demo repo first.

---

## Task 1: Install OpenAI + GitHub deps

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto)

- [ ] **Step 1: Install runtime deps**

Run:
```bash
cd ~/projects/guardian-agent
npm install openai@^4.68.0 @openai/agents@^0.0.5 @octokit/rest@^21.0.2
```

Expected: completes without errors, `node_modules/openai`, `node_modules/@openai/agents`, `node_modules/@octokit/rest` exist.

- [ ] **Step 2: Verify import resolution**

Run: `npm run typecheck`
Expected: passes (no source files yet use these; this just confirms they resolve in the type system).

- [ ] **Step 3: Commit**

```bash
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -am "chore: add openai, @openai/agents, octokit deps"
```

(Use `git add package.json package-lock.json` if `-am` complains about untracked files.)

---

## Task 2: Extend `agent/lib/config.ts` with new env keys

**Files:**
- Modify: `agent/lib/config.ts`
- Modify: `agent/lib/config.test.ts`
- Modify: `.env.example`
- Modify: `.env`

- [ ] **Step 1: Add OpenAI + GitHub fields to schema**

Replace the `Schema` definition in `agent/lib/config.ts` with:

```ts
const Schema = z
  .object({
    niaApiKey: z.string().optional(),
    niaMcpUrl: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
    convexUrl: z.string().url(),
    openaiApiKey: z.string().optional(),
    openaiModel: z.string().default("gpt-5"),
    openaiCritiqueModel: z.string().default("gpt-5-mini"),
    githubToken: z.string().optional(),
    githubOwner: z.string().optional(),
    githubRepo: z.string().optional(),
    cycleIntervalSeconds: z.coerce.number().int().positive(),
    priorityBudget: z.coerce.number().int().nonnegative(),
    judgmentBudget: z.coerce.number().int().nonnegative(),
    useMockLlm: boolFromEnv,
    useMockDevin: boolFromEnv,
    skipNia: boolFromEnv,
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.skipNia) {
      if (!cfg.niaApiKey || cfg.niaApiKey.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["niaApiKey"],
          message: "NIA_API_KEY is required when SKIP_NIA=0",
        });
      }
      if (!cfg.niaMcpUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["niaMcpUrl"],
          message: "NIA_MCP_URL is required when SKIP_NIA=0",
        });
      }
    }
    if (!cfg.useMockLlm) {
      if (!cfg.openaiApiKey || cfg.openaiApiKey.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["openaiApiKey"],
          message: "OPENAI_API_KEY is required when USE_MOCK_LLM=0",
        });
      }
    }
    // GitHub is required regardless — handoff is a core feature
    for (const key of ["githubToken", "githubOwner", "githubRepo"] as const) {
      const value = cfg[key];
      if (!value || value.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required`,
        });
      }
    }
  });
```

Update the `loadConfig` function body to include the new keys:

```ts
export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GuardianConfig {
  const parsed = Schema.parse({
    niaApiKey: env.NIA_API_KEY,
    niaMcpUrl: env.NIA_MCP_URL,
    convexUrl: env.CONVEX_URL,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    openaiCritiqueModel: env.OPENAI_CRITIQUE_MODEL,
    githubToken: env.GITHUB_TOKEN,
    githubOwner: env.GITHUB_OWNER,
    githubRepo: env.GITHUB_REPO,
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

- [ ] **Step 2: Update tests for the new required keys**

Update `agent/lib/config.test.ts` so `baseEnv` includes GitHub + OpenAI fields and add coverage for the new conditional rules. Replace the `baseEnv` and add 3 new tests:

```ts
const baseEnv = {
  NIA_API_KEY: "k",
  NIA_MCP_URL: "https://nia.example/mcp",
  CONVEX_URL: "https://convex.example",
  OPENAI_API_KEY: "sk-test",
  OPENAI_MODEL: "gpt-5",
  OPENAI_CRITIQUE_MODEL: "gpt-5-mini",
  GITHUB_TOKEN: "ghp_test",
  GITHUB_OWNER: "alice",
  GITHUB_REPO: "demo",
  GUARDIAN_CYCLE_INTERVAL_S: "60",
  GUARDIAN_PRIORITY_BUDGET: "3",
  GUARDIAN_JUDGMENT_BUDGET: "1",
  USE_MOCK_LLM: "0",
  USE_MOCK_DEVIN: "0",
  SKIP_NIA: "0",
};
```

Add inside the existing `describe("loadConfig")` block:

```ts
it("requires OPENAI_API_KEY when USE_MOCK_LLM=0", () => {
  expect(() => loadConfig({ ...baseEnv, OPENAI_API_KEY: "" })).toThrow();
});

it("permits empty OPENAI_API_KEY when USE_MOCK_LLM=1", () => {
  const cfg = loadConfig({ ...baseEnv, USE_MOCK_LLM: "1", OPENAI_API_KEY: "" });
  expect(cfg.useMockLlm).toBe(true);
});

it("requires GITHUB_TOKEN regardless of mock flags", () => {
  expect(() =>
    loadConfig({ ...baseEnv, USE_MOCK_LLM: "1", GITHUB_TOKEN: "" }),
  ).toThrow();
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- config`
Expected: all 7 tests pass (4 existing + 3 new).

- [ ] **Step 4: Update `.env.example`**

The keys are already present in the example from Plan 1. No changes needed here unless any default values shifted. Verify `OPENAI_MODEL=gpt-5` and `OPENAI_CRITIQUE_MODEL=gpt-5-mini` are present.

- [ ] **Step 5: Update local `.env`**

Append your real values to `.env` (which is git-ignored):

```bash
cd ~/projects/guardian-agent
cat <<'EOF' >> .env

# Plan 2 additions
OPENAI_API_KEY=<paste real key>
OPENAI_MODEL=gpt-5
OPENAI_CRITIQUE_MODEL=gpt-5-mini
GITHUB_TOKEN=<paste real PAT>
GITHUB_OWNER=<demo repo owner login>
GITHUB_REPO=<demo repo name>
EOF
```

Verify `.env` is git-ignored: `git check-ignore .env` should print `.env`.

- [ ] **Step 6: Commit**

```bash
git add agent/lib/config.ts agent/lib/config.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(agent): add openai + github config keys"
```

---

## Task 3: `agent/analyze/types.ts` — shared `Finding` type

**Files:**
- Create: `agent/analyze/types.ts`

You'll need `mkdir -p agent/analyze`.

- [ ] **Step 1: Write `agent/analyze/types.ts`**

```ts
export type Severity = "critical" | "high" | "medium" | "low";
export type FindingCategory = "intent_drift" | "security" | "bug";

export interface CodeCitation {
  readonly line: number;
  readonly excerpt: string;
}

export interface ConstraintCitation {
  readonly mdFile: string;
  readonly line: number;
  readonly text: string;
}

export interface Finding {
  readonly path: string;
  readonly severity: Severity;
  readonly category: FindingCategory;
  readonly codeCite: CodeCitation;
  readonly constraintCite: ConstraintCitation;
  readonly reasoning: string;
  readonly suggestedFixDirection: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/analyze/types.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): shared Finding type"
```

---

## Task 4: `agent/handoff/githubAuth.ts` — auth interface + PatAuth (TDD)

**Files:**
- Create: `agent/handoff/githubAuth.test.ts`
- Create: `agent/handoff/githubAuth.ts`

You'll need `mkdir -p agent/handoff`.

- [ ] **Step 1: Write the failing test**

`agent/handoff/githubAuth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PatAuth } from "./githubAuth";

describe("PatAuth", () => {
  it("returns an Octokit instance authenticated with the PAT", async () => {
    const auth = new PatAuth("ghp_dummy");
    const octokit = await auth.forRepo("owner", "repo");
    // Octokit doesn't expose the auth string after construction; assert the
    // method-call surface is present so callers know the contract holds.
    expect(typeof octokit.rest.issues.create).toBe("function");
    expect(typeof octokit.rest.pulls.get).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- githubAuth`
Expected: FAIL — `PatAuth` not exported / module not found.

- [ ] **Step 3: Implement `agent/handoff/githubAuth.ts`**

```ts
import { Octokit } from "@octokit/rest";

export interface GithubAuth {
  forRepo(owner: string, repo: string): Promise<Octokit>;
}

export class PatAuth implements GithubAuth {
  constructor(private readonly token: string) {}

  async forRepo(_owner: string, _repo: string): Promise<Octokit> {
    return new Octokit({ auth: this.token });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- githubAuth`
Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add agent/handoff/githubAuth.ts agent/handoff/githubAuth.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(handoff): GithubAuth interface and PatAuth"
```

---

## Task 5: `agent/handoff/github.ts` — issue creation client (TDD)

**Files:**
- Create: `agent/handoff/github.test.ts`
- Create: `agent/handoff/github.ts`

This module is tested with a mocked `GithubAuth` so no real GitHub calls happen during TDD.

- [ ] **Step 1: Write the failing test**

`agent/handoff/github.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { createIssueForFinding } from "./github";
import type { GithubAuth } from "./githubAuth";
import type { Finding } from "../analyze/types";

const FINDING: Finding = {
  path: "src/routes/login.ts",
  severity: "high",
  category: "intent_drift",
  codeCite: { line: 42, excerpt: "router.post(\"/login\", handler)" },
  constraintCite: {
    mdFile: ".context-map/leaves/login-constraints.md",
    line: 3,
    text: "1. All authentication endpoints MUST verify CSRF token via the `requireCsrfToken` middleware.",
  },
  reasoning: "Login route is mounted without the CSRF middleware required by the constraint.",
  suggestedFixDirection: "Add `requireCsrfToken` to the route mount.",
};

function makeMockAuth(create: ReturnType<typeof vi.fn>): GithubAuth {
  return {
    async forRepo() {
      return {
        rest: {
          issues: {
            create,
          },
        },
      } as unknown as Octokit;
    },
  };
}

describe("createIssueForFinding", () => {
  it("calls octokit issues.create with a structured body and returns the issue number", async () => {
    const create = vi.fn(async () => ({ data: { number: 42 } }));
    const auth = makeMockAuth(create);

    const result = await createIssueForFinding({
      auth,
      owner: "alice",
      repo: "demo",
      finding: FINDING,
      cycleNumber: 7,
    });

    expect(result).toEqual({ issueNumber: 42 });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(args.owner).toBe("alice");
    expect(args.repo).toBe("demo");
    expect(args.title).toContain("intent_drift");
    expect(args.body).toContain(FINDING.constraintCite.text);
    expect(args.body).toContain("src/routes/login.ts:42");
    expect(args.body).toContain("cycle 7");
    expect(args.labels).toEqual(["guardian", "intent_drift", "severity:high"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- github`
Expected: FAIL — `createIssueForFinding` not exported.

- [ ] **Step 3: Implement `agent/handoff/github.ts`**

```ts
import type { GithubAuth } from "./githubAuth.js";
import type { Finding } from "../analyze/types.js";

export interface CreateIssueArgs {
  readonly auth: GithubAuth;
  readonly owner: string;
  readonly repo: string;
  readonly finding: Finding;
  readonly cycleNumber: number;
}

export async function createIssueForFinding(
  args: CreateIssueArgs,
): Promise<{ issueNumber: number }> {
  const octokit = await args.auth.forRepo(args.owner, args.repo);
  const f = args.finding;

  const title = `[${f.category}] ${f.path}:${f.codeCite.line} — ${truncate(f.reasoning, 80)}`;
  const body = renderIssueBody(f, args.cycleNumber);
  const labels = ["guardian", f.category, `severity:${f.severity}`];

  const res = await octokit.rest.issues.create({
    owner: args.owner,
    repo: args.repo,
    title,
    body,
    labels,
  });

  return { issueNumber: res.data.number };
}

export interface CommentOnPRArgs {
  readonly auth: GithubAuth;
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
  readonly body: string;
}

export async function commentOnPR(args: CommentOnPRArgs): Promise<void> {
  const octokit = await args.auth.forRepo(args.owner, args.repo);
  await octokit.rest.issues.createComment({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.prNumber,
    body: args.body,
  });
}

export interface GetPRStatusArgs {
  readonly auth: GithubAuth;
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
}

export async function getPRStatus(
  args: GetPRStatusArgs,
): Promise<"open" | "merged" | "closed"> {
  const octokit = await args.auth.forRepo(args.owner, args.repo);
  const res = await octokit.rest.pulls.get({
    owner: args.owner,
    repo: args.repo,
    pull_number: args.prNumber,
  });
  if (res.data.merged) return "merged";
  if (res.data.state === "closed") return "closed";
  return "open";
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function renderIssueBody(f: Finding, cycleNumber: number): string {
  return [
    `## Guardian Finding — ${f.category}`,
    `**Severity:** ${f.severity}`,
    `**File:** ${f.path}:${f.codeCite.line}`,
    `**Code:**`,
    "```",
    f.codeCite.excerpt,
    "```",
    `**Violated constraint:** ${f.constraintCite.mdFile}:${f.constraintCite.line}`,
    `> ${f.constraintCite.text}`,
    `**Reasoning:** ${f.reasoning}`,
    `**Suggested direction:** ${f.suggestedFixDirection}`,
    "",
    "---",
    `_filed by guardian cycle ${cycleNumber}_`,
  ].join("\n");
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- github`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add agent/handoff/github.ts agent/handoff/github.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(handoff): createIssueForFinding, commentOnPR, getPRStatus"
```

---

## Task 6: `agent/analyze/npmAudit.ts` — CVE finding source (TDD with mocked subprocess)

**Files:**
- Create: `agent/analyze/npmAudit.test.ts`
- Create: `agent/analyze/npmAudit.ts`

The implementation accepts a function that runs the subprocess and returns the JSON, so tests can inject a fake.

- [ ] **Step 1: Write the failing test**

`agent/analyze/npmAudit.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { auditPackageJson } from "./npmAudit";

const SAMPLE_AUDIT = JSON.stringify({
  vulnerabilities: {
    lodash: {
      name: "lodash",
      severity: "critical",
      via: [
        {
          source: 1094499,
          name: "lodash",
          dependency: "lodash",
          title: "Command Injection in lodash",
          url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
          severity: "critical",
          range: "<4.17.21",
        },
      ],
      effects: [],
      range: "<4.17.21",
      nodes: ["node_modules/lodash"],
      fixAvailable: { name: "lodash", version: "4.17.21", isSemVerMajor: false },
    },
  },
});

const PACKAGE_JSON = JSON.stringify(
  {
    name: "demo-target",
    dependencies: { lodash: "4.17.20" },
  },
  null,
  2,
);

describe("auditPackageJson", () => {
  it("turns each vulnerability into a Finding cited at package.json", async () => {
    const findings = await auditPackageJson({
      cwd: "/fake/demo",
      readPackageJson: async () => PACKAGE_JSON,
      runAudit: vi.fn(async () => SAMPLE_AUDIT),
    });

    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.path).toBe("package.json");
    expect(f.category).toBe("security");
    expect(f.severity).toBe("critical");
    expect(f.codeCite.excerpt).toContain("lodash");
    expect(f.constraintCite.mdFile).toBe("npm-audit");
    expect(f.constraintCite.text).toContain("Command Injection in lodash");
    expect(f.reasoning).toContain("CVE");
    expect(f.suggestedFixDirection).toContain("4.17.21");
  });

  it("returns an empty array when audit reports no vulnerabilities", async () => {
    const findings = await auditPackageJson({
      cwd: "/fake/demo",
      readPackageJson: async () => "{}",
      runAudit: async () => JSON.stringify({ vulnerabilities: {} }),
    });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- npmAudit`
Expected: FAIL — `auditPackageJson` not exported.

- [ ] **Step 3: Implement `agent/analyze/npmAudit.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile as fsReadFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding, Severity } from "./types.js";

const execFileAsync = promisify(execFile);

interface NpmAuditAdvisory {
  readonly source?: number;
  readonly name?: string;
  readonly title?: string;
  readonly url?: string;
  readonly severity?: string;
  readonly range?: string;
}

interface NpmAuditVulnerability {
  readonly name: string;
  readonly severity: string;
  readonly via?: ReadonlyArray<string | NpmAuditAdvisory>;
  readonly fixAvailable?: { name: string; version: string } | boolean;
}

interface NpmAuditOutput {
  readonly vulnerabilities?: Record<string, NpmAuditVulnerability>;
}

export interface AuditPackageJsonArgs {
  readonly cwd: string;
  /** Reader so tests can inject the package.json contents. */
  readPackageJson?: () => Promise<string>;
  /** Subprocess runner so tests can inject a fake `npm audit --json` result. */
  runAudit?: () => Promise<string>;
}

export async function auditPackageJson(args: AuditPackageJsonArgs): Promise<Finding[]> {
  const audit = await (args.runAudit ?? defaultRunAudit(args.cwd))();
  const pkg = await (args.readPackageJson ?? defaultReadPackageJson(args.cwd))();

  let parsed: NpmAuditOutput;
  try {
    parsed = JSON.parse(audit) as NpmAuditOutput;
  } catch {
    return [];
  }

  const vulns = Object.values(parsed.vulnerabilities ?? {});
  const findings: Finding[] = [];

  for (const v of vulns) {
    const advisory = (v.via ?? []).find(
      (entry): entry is NpmAuditAdvisory => typeof entry !== "string",
    );
    if (!advisory) continue;

    const line = findDependencyLine(pkg, v.name);
    const fixVersion =
      typeof v.fixAvailable === "object" && v.fixAvailable !== null
        ? v.fixAvailable.version
        : "";

    findings.push({
      path: "package.json",
      severity: normalizeSeverity(v.severity),
      category: "security",
      codeCite: {
        line,
        excerpt: `"${v.name}": ...`,
      },
      constraintCite: {
        mdFile: "npm-audit",
        line: advisory.source ?? 0,
        text: advisory.title ?? `Vulnerability in ${v.name}`,
      },
      reasoning: `CVE in dependency \`${v.name}\` (${v.severity}). ${
        advisory.title ?? ""
      } ${advisory.url ? `(${advisory.url})` : ""}`.trim(),
      suggestedFixDirection: fixVersion
        ? `Bump \`${v.name}\` to ${fixVersion} or later. Range affected: ${
            advisory.range ?? "n/a"
          }.`
        : `Upgrade or remove \`${v.name}\`. Range affected: ${advisory.range ?? "n/a"}.`,
    });
  }

  return findings;
}

function findDependencyLine(packageJson: string, depName: string): number {
  const lines = packageJson.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(`"${depName}"`)) return i + 1;
  }
  return 1;
}

function normalizeSeverity(s: string): Severity {
  const lower = s.toLowerCase();
  if (lower === "critical" || lower === "high" || lower === "medium" || lower === "low") {
    return lower;
  }
  return "medium";
}

function defaultRunAudit(cwd: string): () => Promise<string> {
  return async () => {
    try {
      const { stdout } = await execFileAsync("npm", ["audit", "--json"], { cwd });
      return stdout;
    } catch (err) {
      // `npm audit` exits non-zero when vulnerabilities are found. The JSON is still on stdout.
      const e = err as { stdout?: string };
      if (e.stdout) return e.stdout;
      throw err;
    }
  };
}

function defaultReadPackageJson(cwd: string): () => Promise<string> {
  return () => fsReadFile(join(cwd, "package.json"), "utf8");
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- npmAudit`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/analyze/npmAudit.ts agent/analyze/npmAudit.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): npm audit subprocess wrapper"
```

---

## Task 7: `agent/analyze/citation.ts` — programmatic citation check (TDD)

**Files:**
- Create: `agent/analyze/citation.test.ts`
- Create: `agent/analyze/citation.ts`

- [ ] **Step 1: Write the failing test**

`agent/analyze/citation.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { verifyCitation } from "./citation";
import type { NiaClient } from "../tools/niaClient";
import type { Finding } from "./types";

const FILE_BODY = [
  "import { router } from \"./router\";",
  "",
  "router.post(\"/login\", handler);",
  "",
  "export {};",
].join("\n");

const FINDING: Finding = {
  path: "src/routes/login.ts",
  severity: "high",
  category: "intent_drift",
  codeCite: { line: 3, excerpt: "router.post(\"/login\", handler)" },
  constraintCite: {
    mdFile: ".context-map/leaves/login-constraints.md",
    line: 3,
    text: "All auth endpoints must verify CSRF.",
  },
  reasoning: "ok",
  suggestedFixDirection: "ok",
};

function makeNia(overrides: Partial<NiaClient> = {}): NiaClient {
  return {
    async readFile() {
      return FILE_BODY;
    },
    async verifyConstraintCite() {
      return true;
    },
    async searchCode() {
      return [];
    },
    async searchContext() {
      return [];
    },
    async recentDiff() {
      return "";
    },
    ...overrides,
  };
}

describe("verifyCitation", () => {
  it("passes when both code and constraint citations are accurate", async () => {
    const result = await verifyCitation({ finding: FINDING, nia: makeNia() });
    expect(result).toEqual({ ok: true });
  });

  it("fails when the cited code line does not contain the excerpt", async () => {
    const broken: Finding = {
      ...FINDING,
      codeCite: { line: 1, excerpt: "router.post(\"/login\", handler)" },
    };
    const result = await verifyCitation({ finding: broken, nia: makeNia() });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/code/i);
  });

  it("fails when the constraint text is not in the .md file", async () => {
    const nia = makeNia({
      async verifyConstraintCite() {
        return false;
      },
    });
    const result = await verifyCitation({ finding: FINDING, nia });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/constraint/i);
  });

  it("fails when the cited line number is out of range", async () => {
    const broken: Finding = { ...FINDING, codeCite: { line: 999, excerpt: "x" } };
    const result = await verifyCitation({ finding: broken, nia: makeNia() });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- citation`
Expected: FAIL — `verifyCitation` not exported.

- [ ] **Step 3: Implement `agent/analyze/citation.ts`**

```ts
import type { NiaClient } from "../tools/niaClient.js";
import type { Finding } from "./types.js";

export type CitationResult = { ok: true } | { ok: false; reason: string };

export interface VerifyCitationArgs {
  readonly finding: Finding;
  readonly nia: NiaClient;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function verifyCitation(args: VerifyCitationArgs): Promise<CitationResult> {
  const { finding, nia } = args;

  // Code citation: read the file, locate the cited line, confirm excerpt match.
  let body: string;
  try {
    body = await nia.readFile(finding.path);
  } catch (err) {
    return { ok: false, reason: `code: cannot read ${finding.path} (${(err as Error).message})` };
  }

  const lines = body.split("\n");
  const lineIdx = finding.codeCite.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) {
    return {
      ok: false,
      reason: `code: line ${finding.codeCite.line} out of range (file has ${lines.length} lines)`,
    };
  }
  const actual = normalize(lines[lineIdx]!);
  const expected = normalize(finding.codeCite.excerpt);
  if (!actual.includes(expected) && !expected.includes(actual)) {
    return {
      ok: false,
      reason: `code: line ${finding.codeCite.line} excerpt does not match`,
    };
  }

  // Constraint citation: defer to Nia.
  const constraintOk = await nia.verifyConstraintCite(
    finding.constraintCite.mdFile,
    finding.constraintCite.line,
    finding.constraintCite.text,
  );
  if (!constraintOk) {
    return {
      ok: false,
      reason: `constraint: ${finding.constraintCite.mdFile}:${finding.constraintCite.line} text mismatch`,
    };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- citation`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/analyze/citation.ts agent/analyze/citation.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): programmatic citation verification"
```

---

## Task 8: `agent/analyze/mockAnalyzer.ts` — deterministic findings under USE_MOCK_LLM (TDD)

**Files:**
- Create: `agent/analyze/mockAnalyzer.test.ts`
- Create: `agent/analyze/mockAnalyzer.ts`

The mock analyzer returns the planted findings for the demo repo when called against specific paths. Used during dev/test so we don't burn OpenAI tokens.

- [ ] **Step 1: Write the failing test**

`agent/analyze/mockAnalyzer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mockAnalyzeFile } from "./mockAnalyzer";

describe("mockAnalyzeFile", () => {
  it("returns the CSRF drift finding for the login route", async () => {
    const findings = await mockAnalyzeFile("src/routes/login.ts");
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.category).toBe("intent_drift");
    expect(f.constraintCite.mdFile).toContain("login-constraints");
    expect(f.constraintCite.text.toLowerCase()).toContain("csrf");
  });

  it("returns the sliding-TTL drift finding for sessions", async () => {
    const findings = await mockAnalyzeFile("src/routes/sessions.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.constraintCite.text.toLowerCase()).toContain("inactivity");
  });

  it("returns no findings for files without a planted issue", async () => {
    const findings = await mockAnalyzeFile("src/lib/db.ts");
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mockAnalyzer`
Expected: FAIL — `mockAnalyzeFile` not exported.

- [ ] **Step 3: Implement `agent/analyze/mockAnalyzer.ts`**

```ts
import type { Finding } from "./types.js";

const PLANTED: Record<string, Finding[]> = {
  "src/routes/login.ts": [
    {
      path: "src/routes/login.ts",
      severity: "high",
      category: "intent_drift",
      codeCite: {
        line: 1,
        excerpt: "router.post(\"/login\", handler)",
      },
      constraintCite: {
        mdFile: ".context-map/leaves/login-constraints.md",
        line: 1,
        text: "All authentication endpoints MUST verify CSRF token via the `requireCsrfToken` middleware.",
      },
      reasoning:
        "The login route is mounted without the `requireCsrfToken` middleware that the constraint requires.",
      suggestedFixDirection:
        "Insert `requireCsrfToken` between the router and the handler in the route definition.",
    },
  ],
  "src/routes/sessions.ts": [
    {
      path: "src/routes/sessions.ts",
      severity: "high",
      category: "intent_drift",
      codeCite: {
        line: 1,
        excerpt: "expiresAt = createdAt + ONE_DAY_MS",
      },
      constraintCite: {
        mdFile: ".context-map/leaves/sessions-constraints.md",
        line: 1,
        text: "Sessions MUST expire after 24 hours of INACTIVITY (sliding TTL).",
      },
      reasoning:
        "Session expiry is set to a fixed offset from createdAt rather than refreshed on every authenticated request.",
      suggestedFixDirection:
        "Replace absolute-time expiry with a sliding TTL that updates on each authenticated request.",
    },
  ],
};

export async function mockAnalyzeFile(path: string): Promise<Finding[]> {
  return PLANTED[path] ?? [];
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- mockAnalyzer`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/analyze/mockAnalyzer.ts agent/analyze/mockAnalyzer.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): mock analyzer with planted findings"
```

---

## Task 9: Wire ANALYZE + HANDOFF phases into the cycle (mock path)

**Files:**
- Modify: `agent/cycle.ts`
- Modify: `agent/main.ts`

This task wires up the mock analyzer + npm audit + GitHub issue creation. After this, every cycle will produce findings (mocked or CVE) and file real GitHub issues.

- [ ] **Step 1: Replace `agent/cycle.ts`**

```ts
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { Logger } from "./lib/logger.js";
import type { EventSink } from "./lib/logger.js";
import type { NiaClient } from "./tools/niaClient.js";
import { priorityPicks } from "./plan/priority.js";
import type { FileScanState } from "./plan/priority.js";
import { findingFingerprint } from "./lib/fingerprint.js";
import { auditPackageJson } from "./analyze/npmAudit.js";
import { verifyCitation } from "./analyze/citation.js";
import { createIssueForFinding } from "./handoff/github.js";
import type { GithubAuth } from "./handoff/githubAuth.js";
import type { Finding } from "./analyze/types.js";
import { createHash } from "node:crypto";

export type AnalyzeFile = (path: string, nia: NiaClient) => Promise<Finding[]>;

export interface CycleDeps {
  convex: ConvexHttpClient;
  nia: NiaClient;
  sinkFor: (cycleNumber: number) => EventSink;
  candidatesProvider: () => Promise<readonly string[]>;
  priorityBudget: number;
  analyzeFile: AnalyzeFile;
  githubAuth: GithubAuth;
  githubOwner: string;
  githubRepo: string;
  demoRepoRoot: string;
}

export interface CycleResult {
  cycleNumber: number;
  status: "done" | "failed";
  plannedFiles: Array<{ path: string; reason: string }>;
  findingsFiled: number;
}

function hashContent(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export async function runCycle(deps: CycleDeps): Promise<CycleResult> {
  const cycleNumber = await deps.convex.query(api.cycles.nextCycleNumber, {});
  const cycleId: Id<"cycles"> = await deps.convex.mutation(api.cycles.openCycle, {
    cycleNumber,
  });
  const log = new Logger({ sink: deps.sinkFor(cycleNumber), cycleNumber });
  await log.info("wake");

  let findingsFiled = 0;

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

    // SCAN + ANALYZE + HANDOFF per file
    for (const pick of plannedFiles) {
      await log.info(`scan ${pick.path}`, { reason: pick.reason });

      let body = "";
      try {
        body = await deps.nia.readFile(pick.path);
      } catch (err) {
        await log.warn(`read failed for ${pick.path}: ${(err as Error).message}`);
      }

      let rawFindings: Finding[] = [];
      if (pick.path === "package.json") {
        rawFindings = await auditPackageJson({ cwd: deps.demoRepoRoot });
      } else {
        rawFindings = await deps.analyzeFile(pick.path, deps.nia);
      }
      await log.info(`analyze ${pick.path}: ${rawFindings.length} raw findings`);

      let cleanScan = true;
      for (const f of rawFindings) {
        // CRITIQUE — citation check (LLM critique pass added in Task 14).
        // npm-audit findings carry a synthetic constraintCite that we trust by construction;
        // skip citation check for them.
        if (f.category !== "security") {
          const cite = await verifyCitation({ finding: f, nia: deps.nia });
          if (!cite.ok) {
            await log.warn(`drop finding (citation): ${cite.reason}`);
            continue;
          }
        }

        // HANDOFF — dedup → file issue → record.
        const fingerprint = findingFingerprint({
          path: f.path,
          constraintMdFile: f.constraintCite.mdFile,
          constraintLine: f.constraintCite.line,
          codeLine: f.codeCite.line,
        });
        const result = await deps.convex.mutation(api.findings.createIfAbsent, {
          fingerprint,
          cycleDetected: cycleNumber,
          severity: f.severity,
          category: f.category,
          path: f.path,
          codeCite: f.codeCite,
          constraintCite: f.constraintCite,
          reasoning: f.reasoning,
          suggestedFixDirection: f.suggestedFixDirection,
        });
        if (!result.created) {
          await log.info(`finding deduped: ${fingerprint.slice(0, 12)}`);
          continue;
        }
        cleanScan = false;
        const { issueNumber } = await createIssueForFinding({
          auth: deps.githubAuth,
          owner: deps.githubOwner,
          repo: deps.githubRepo,
          finding: f,
          cycleNumber,
        });
        await deps.convex.mutation(api.findings.setStatus, {
          findingId: result.id,
          status: "detected",
          githubIssueNumber: issueNumber,
        });
        findingsFiled++;
        await log.finding(`filed issue #${issueNumber}: ${f.category} @ ${f.path}`, {
          fingerprint: fingerprint.slice(0, 12),
        });
      }

      await deps.convex.mutation(api.fileScanHistory.upsertScan, {
        path: pick.path,
        cycleNumber,
        fileHash: hashContent(body),
        cleanScan,
      });
    }

    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "done",
      summary: `${plannedFiles.length} picks · ${findingsFiled} findings filed`,
    });
    await log.info("sleep");
    return { cycleNumber, status: "done", plannedFiles, findingsFiled };
  } catch (err) {
    await log.warn(`cycle failed: ${(err as Error).message}`);
    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "failed",
      summary: (err as Error).message,
    });
    return { cycleNumber, status: "failed", plannedFiles: [], findingsFiled };
  }
}
```

- [ ] **Step 2: Replace `agent/main.ts`**

```ts
import "dotenv/config";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./lib/config.js";
import { getConvex, makeConvexEventSink } from "./tools/convexClient.js";
import { createNiaClient } from "./tools/niaClient.js";
import { runCycle } from "./cycle.js";
import { mockAnalyzeFile } from "./analyze/mockAnalyzer.js";
import { PatAuth } from "./handoff/githubAuth.js";

const DEMO_REPO_ENV = "DEMO_REPO_LOCAL_PATH";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listCandidateFiles(root: string): string[] {
  const out: string[] = [];
  function walk(rel: string): void {
    const entries = readdirSync(join(root, rel));
    for (const name of entries) {
      if (name === "node_modules" || name === ".git") continue;
      const r = rel ? `${rel}/${name}` : name;
      const full = join(root, r);
      if (statSync(full).isDirectory()) {
        walk(r);
      } else if (
        (r.startsWith("src/") && (r.endsWith(".ts") || r.endsWith(".js"))) ||
        r === "package.json"
      ) {
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
    mcpUrl: config.niaMcpUrl ?? "",
    apiKey: config.niaApiKey ?? "",
    filesystemRoot: demoRoot,
  });
  const candidatesProvider = async () => listCandidateFiles(demoRoot);

  // Mock-only path for now; real LLM analyzer is wired in Task 11.
  if (!config.useMockLlm) {
    throw new Error(
      "USE_MOCK_LLM=0 requires the real analyzer (wired in Plan 2 Task 11). Re-run with USE_MOCK_LLM=1.",
    );
  }
  const analyzeFile = async (path: string) => mockAnalyzeFile(path);

  const githubAuth = new PatAuth(config.githubToken!);

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
    `[main] guardian online · demo=${demoRoot} · interval=${config.cycleIntervalSeconds}s · mock_llm=${config.useMockLlm}`,
  );

  while (!stopped) {
    const result = await runCycle({
      convex,
      nia,
      sinkFor,
      candidatesProvider,
      priorityBudget: config.priorityBudget,
      analyzeFile,
      githubAuth,
      githubOwner: config.githubOwner!,
      githubRepo: config.githubRepo!,
      demoRepoRoot: demoRoot,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[main] cycle ${result.cycleNumber} ${result.status} · ${result.plannedFiles.length} picks · ${result.findingsFiled} filed`,
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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add agent/cycle.ts agent/main.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(agent): wire ANALYZE + HANDOFF phases into the cycle"
```

---

## Task 10: Smoke test — mock LLM end-to-end against demo repo

**Files:** none (verification only)

This task runs the agent once with `USE_MOCK_LLM=1` and verifies issues actually appear on GitHub.

- [ ] **Step 1: Set `.env` for mock mode**

Run:
```bash
cd ~/projects/guardian-agent
sed -i.bak 's/^USE_MOCK_LLM=0/USE_MOCK_LLM=1/' .env && rm .env.bak
grep ^USE_MOCK_LLM .env
```
Expected: `USE_MOCK_LLM=1`.

- [ ] **Step 2: Confirm GitHub env values are populated**

```bash
grep -E '^(GITHUB_TOKEN|GITHUB_OWNER|GITHUB_REPO)=' .env
```
Each line must have a non-empty value. If `GITHUB_TOKEN` shows the placeholder, replace it with a real PAT.

- [ ] **Step 3: Confirm the demo repo is pushed to GitHub**

The PAT needs `repo` scope on the demo target repo. Quick check:
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: token $(grep ^GITHUB_TOKEN .env | cut -d= -f2-)" \
  "https://api.github.com/repos/$(grep ^GITHUB_OWNER .env | cut -d= -f2-)/$(grep ^GITHUB_REPO .env | cut -d= -f2-)"
```
Expected: `200`.

- [ ] **Step 4: Run the agent once**

```bash
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target npm run agent:once 2>&1 | tail -30
```

Expected output (fingerprints + cycle # will vary):
```
[main] guardian online · demo=/Users/.../guardian-demo-target · interval=60s · mock_llm=true
[main] cycle N done · 3 picks · 2 filed
[main] guardian shutting down cleanly
```

(2 filed = 1 mock CSRF drift on `src/routes/login.ts` + 1 CVE from `package.json`. Sliding-TTL fires when sessions.ts is in the picks; depending on priority order it may or may not appear in cycle N.)

- [ ] **Step 5: Verify GitHub has the new issues**

Replace OWNER/REPO with your values:
```bash
gh issue list --repo OWNER/REPO --label guardian --json number,title,labels --limit 5
```
Expected: at least 2 recent issues with the `guardian` label, titles like:
- `[security] package.json:N — CVE in dependency \`lodash\` (critical)…`
- `[intent_drift] src/routes/login.ts:1 — The login route is mounted without…`

- [ ] **Step 6: Verify Convex state**

```bash
npx convex run findings:byStatus '{"status": "detected"}' 2>&1 | tail -40
```
Expected: rows for the issues filed, each with `githubIssueNumber` set, `status: "detected"`.

- [ ] **Step 7: Run a second cycle to confirm dedup**

```bash
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target npm run agent:once 2>&1 | tail -10
```
Expected: `0 filed` (or fewer than the first cycle), and no new GitHub issues created. The events log should include lines like `finding deduped: <fingerprint>`.

- [ ] **Step 8: No commit needed**

This task is verification only.

---

## Task 11: `agent/analyze/prompts.ts` — analyzer + critique prompts and zod schemas

**Files:**
- Create: `agent/analyze/prompts.ts`

This is non-TDD: it's static prompt content + zod schemas. The schemas get exercised by the analyzer test in Task 13.

- [ ] **Step 1: Write `agent/analyze/prompts.ts`**

```ts
import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["intent_drift", "security", "bug"]),
  codeCite: z.object({
    line: z.number().int().positive(),
    excerpt: z.string().min(1),
  }),
  constraintCite: z.object({
    mdFile: z.string().min(1),
    line: z.number().int().positive(),
    text: z.string().min(1),
  }),
  reasoning: z.string().min(1),
  suggestedFixDirection: z.string().min(1),
});

export const AnalyzerOutputSchema = z.object({
  findings: z.array(FindingSchema),
});

export type AnalyzerOutput = z.infer<typeof AnalyzerOutputSchema>;

export const ANALYZER_SYSTEM_PROMPT = `You are the guardian agent: an autonomous code reviewer that compares a single source file against its documented intent and constraints.

For the given file, return zero or more findings. A finding describes a concrete divergence between the code and a constraint or example documented in the file's .md context. Three categories are accepted:
- intent_drift: code stopped matching its documented spec
- security: missing auth, missing input validation, or other security-relevant violations of stated constraints
- bug: behavior that contradicts a documented example

Every finding MUST cite:
- A specific line in the source file (codeCite.line and codeCite.excerpt — the excerpt is the verbatim contents of that line)
- A specific line in the .md context (constraintCite.mdFile, constraintCite.line, constraintCite.text — the text is verbatim from that line of the .md)

If you cannot cite both, do not report the finding. False positives are worse than missed findings. When in doubt, omit.

Severity guidance: critical (data loss, auth bypass), high (security violation, intent drift on a documented hard constraint), medium (bug or soft constraint violation), low (style or doc-only).

Return strictly the JSON shape provided as the structured output.`;

export const CRITIQUE_SYSTEM_PROMPT = `You are reviewing a finding produced by another agent. Decide whether it is a real violation of the cited constraint by the cited code.

Return { confident: true } only if you are at least 80% sure the code as written violates the constraint as written. Otherwise return { confident: false } with a one-sentence reason. Be strict — false confidence costs the team wasted Devin runs.`;

export const CritiqueOutputSchema = z.object({
  confident: z.boolean(),
  reason: z.string(),
});

export type CritiqueOutput = z.infer<typeof CritiqueOutputSchema>;

export function buildAnalyzerUserPrompt(args: {
  readonly path: string;
  readonly code: string;
  readonly contextChunks: ReadonlyArray<{ readonly path: string; readonly content: string }>;
  readonly recentDiff: string;
}): string {
  const ctx = args.contextChunks
    .map((c) => `=== ${c.path} ===\n${c.content}`)
    .join("\n\n");
  return [
    `File: ${args.path}`,
    "",
    "Source code:",
    "```",
    args.code,
    "```",
    "",
    "Context (.md chunks):",
    ctx || "(none)",
    "",
    "Recent diff:",
    args.recentDiff || "(none)",
  ].join("\n");
}

export function buildCritiqueUserPrompt(args: {
  readonly finding: { codeCite: { line: number; excerpt: string }; constraintCite: { mdFile: string; line: number; text: string }; reasoning: string };
}): string {
  const f = args.finding;
  return [
    `Code line ${f.codeCite.line}: ${f.codeCite.excerpt}`,
    `Constraint ${f.constraintCite.mdFile}:${f.constraintCite.line}: ${f.constraintCite.text}`,
    `Agent reasoning: ${f.reasoning}`,
  ].join("\n");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/analyze/prompts.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): system prompts and zod output schemas"
```

---

## Task 12: `agent/analyze/openaiClient.ts` — Agents SDK + Nia MCP wrapper

**Files:**
- Create: `agent/analyze/openaiClient.ts`

No tests here — this is pure construction code. It's exercised by the analyzer integration tests.

- [ ] **Step 1: Write `agent/analyze/openaiClient.ts`**

```ts
import OpenAI from "openai";

let cachedRaw: OpenAI | null = null;

export interface OpenAIClientConfig {
  readonly apiKey: string;
}

export function getOpenAI(cfg: OpenAIClientConfig): OpenAI {
  if (cachedRaw) return cachedRaw;
  cachedRaw = new OpenAI({ apiKey: cfg.apiKey });
  return cachedRaw;
}

export function _resetOpenAIClientForTests(): void {
  cachedRaw = null;
}
```

We use the OpenAI raw SDK rather than `@openai/agents` for Plan 2's analyzer. The Agents SDK adds value when you need an autonomous tool-using loop — here the analyzer's tool surface is "read code via Nia, then output findings." That fits a single structured-output call cleanly. We keep `@openai/agents` installed for Plans 3-4 where the judgment-call planner and re-prompt sharpening will benefit from agent loops.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/analyze/openaiClient.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): openai client wrapper"
```

---

## Task 13: `agent/analyze/critique.ts` — LLM critique pass (TDD with mocked OpenAI)

**Files:**
- Create: `agent/analyze/critique.test.ts`
- Create: `agent/analyze/critique.ts`

The critique pass takes a single Finding and returns whether the agent is confident enough to file it. We test with a fake LLM that returns canned JSON.

- [ ] **Step 1: Write the failing test**

`agent/analyze/critique.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { critiqueFinding } from "./critique";
import type { Finding } from "./types";

const FINDING: Finding = {
  path: "src/routes/login.ts",
  severity: "high",
  category: "intent_drift",
  codeCite: { line: 1, excerpt: "router.post(\"/login\", handler)" },
  constraintCite: {
    mdFile: ".context-map/leaves/login-constraints.md",
    line: 1,
    text: "All authentication endpoints MUST verify CSRF token.",
  },
  reasoning: "missing requireCsrfToken middleware",
  suggestedFixDirection: "add the middleware",
};

describe("critiqueFinding", () => {
  it("keeps the finding when the LLM returns confident=true", async () => {
    const callLLM = vi.fn(async () => ({ confident: true, reason: "obvious mismatch" }));
    const result = await critiqueFinding({ finding: FINDING, callLLM });
    expect(result.keep).toBe(true);
  });

  it("drops the finding when the LLM returns confident=false", async () => {
    const callLLM = vi.fn(async () => ({ confident: false, reason: "could be middleware applied elsewhere" }));
    const result = await critiqueFinding({ finding: FINDING, callLLM });
    expect(result.keep).toBe(false);
    expect(result.keep ? "" : result.reason).toContain("middleware applied elsewhere");
  });

  it("drops the finding when the LLM call throws", async () => {
    const callLLM = vi.fn(async () => {
      throw new Error("rate limit");
    });
    const result = await critiqueFinding({ finding: FINDING, callLLM });
    expect(result.keep).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- critique`
Expected: FAIL — `critiqueFinding` not exported.

- [ ] **Step 3: Implement `agent/analyze/critique.ts`**

```ts
import type { Finding } from "./types.js";
import type { CritiqueOutput } from "./prompts.js";

export type CritiqueLLMCall = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<CritiqueOutput>;

export interface CritiqueArgs {
  readonly finding: Finding;
  readonly callLLM: CritiqueLLMCall;
}

export type CritiqueResult = { keep: true } | { keep: false; reason: string };

import { CRITIQUE_SYSTEM_PROMPT, buildCritiqueUserPrompt } from "./prompts.js";

export async function critiqueFinding(args: CritiqueArgs): Promise<CritiqueResult> {
  try {
    const out = await args.callLLM({
      systemPrompt: CRITIQUE_SYSTEM_PROMPT,
      userPrompt: buildCritiqueUserPrompt({ finding: args.finding }),
    });
    if (out.confident) return { keep: true };
    return { keep: false, reason: out.reason || "low confidence" };
  } catch (err) {
    return { keep: false, reason: `critique failed: ${(err as Error).message}` };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- critique`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/analyze/critique.ts agent/analyze/critique.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): LLM critique pass"
```

---

## Task 14: `agent/analyze/analyzer.ts` — real LLM analyzer (TDD with mocked OpenAI)

**Files:**
- Create: `agent/analyze/analyzer.test.ts`
- Create: `agent/analyze/analyzer.ts`

The analyzer reads a file via Nia, gathers up to 8 context chunks, asks the LLM for findings via structured output, validates against `AnalyzerOutputSchema`, and returns the result. We test with a fake LLM that returns canned JSON.

- [ ] **Step 1: Write the failing test**

`agent/analyze/analyzer.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { analyzeFile } from "./analyzer";
import type { NiaClient } from "../tools/niaClient";

const FILE_BODY = "router.post(\"/login\", handler);\n";

const niaStub: NiaClient = {
  async readFile() {
    return FILE_BODY;
  },
  async searchContext() {
    return [
      {
        path: ".context-map/leaves/login-constraints.md",
        line: 1,
        excerpt: "All authentication endpoints MUST verify CSRF token.",
      },
    ];
  },
  async searchCode() {
    return [];
  },
  async recentDiff() {
    return "";
  },
  async verifyConstraintCite() {
    return true;
  },
};

describe("analyzeFile", () => {
  it("returns findings parsed from the LLM structured output", async () => {
    const callLLM = vi.fn(async () => ({
      findings: [
        {
          severity: "high" as const,
          category: "intent_drift" as const,
          codeCite: { line: 1, excerpt: "router.post(\"/login\", handler)" },
          constraintCite: {
            mdFile: ".context-map/leaves/login-constraints.md",
            line: 1,
            text: "All authentication endpoints MUST verify CSRF token.",
          },
          reasoning: "no csrf middleware",
          suggestedFixDirection: "add it",
        },
      ],
    }));

    const findings = await analyzeFile("src/routes/login.ts", niaStub, callLLM);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.path).toBe("src/routes/login.ts");
    expect(findings[0]!.category).toBe("intent_drift");
  });

  it("returns empty when the LLM returns no findings", async () => {
    const callLLM = vi.fn(async () => ({ findings: [] }));
    const findings = await analyzeFile("src/routes/login.ts", niaStub, callLLM);
    expect(findings).toEqual([]);
  });

  it("returns empty when the LLM call throws", async () => {
    const callLLM = vi.fn(async () => {
      throw new Error("rate limit");
    });
    const findings = await analyzeFile("src/routes/login.ts", niaStub, callLLM);
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- analyzer`
Expected: FAIL — `analyzeFile` not exported.

- [ ] **Step 3: Implement `agent/analyze/analyzer.ts`**

```ts
import type { NiaClient } from "../tools/niaClient.js";
import type { Finding } from "./types.js";
import {
  ANALYZER_SYSTEM_PROMPT,
  AnalyzerOutputSchema,
  buildAnalyzerUserPrompt,
  type AnalyzerOutput,
} from "./prompts.js";

export type AnalyzerLLMCall = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<AnalyzerOutput>;

export async function analyzeFile(
  path: string,
  nia: NiaClient,
  callLLM: AnalyzerLLMCall,
): Promise<Finding[]> {
  let code = "";
  try {
    code = await nia.readFile(path);
  } catch {
    return [];
  }

  const ctxHits = await nia.searchContext(path, { topK: 8 }).catch(() => []);
  const contextChunks = await Promise.all(
    ctxHits.slice(0, 8).map(async (h) => {
      const content = await nia.readFile(h.path).catch(() => h.excerpt);
      return { path: h.path, content };
    }),
  );

  const recentDiff = await nia.recentDiff(path).catch(() => "");

  let raw: unknown;
  try {
    raw = await callLLM({
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      userPrompt: buildAnalyzerUserPrompt({ path, code, contextChunks, recentDiff }),
    });
  } catch {
    return [];
  }

  const parsed = AnalyzerOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  return parsed.data.findings.map((f) => ({ ...f, path }));
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- analyzer`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/analyze/analyzer.ts agent/analyze/analyzer.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): LLM analyzer with structured output"
```

---

## Task 15: OpenAI structured-output adapters

**Files:**
- Create: `agent/analyze/openaiAdapters.ts`

Wraps the raw OpenAI SDK calls into the `AnalyzerLLMCall` and `CritiqueLLMCall` shapes used in Tasks 13–14. No new tests — exercised in the smoke test.

- [ ] **Step 1: Write `agent/analyze/openaiAdapters.ts`**

```ts
import OpenAI from "openai";
import { AnalyzerOutputSchema, CritiqueOutputSchema } from "./prompts.js";
import type { AnalyzerLLMCall } from "./analyzer.js";
import type { CritiqueLLMCall } from "./critique.js";

export interface AdapterConfig {
  readonly client: OpenAI;
  readonly model: string;
  readonly critiqueModel: string;
}

export function makeAnalyzerLLMCall(cfg: AdapterConfig): AnalyzerLLMCall {
  return async ({ systemPrompt, userPrompt }) => {
    const res = await cfg.client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "AnalyzerOutput",
          strict: true,
          schema: zodToOpenAIJsonSchema(AnalyzerOutputSchema),
        },
      },
    });
    const content = res.choices[0]?.message?.content ?? "{}";
    return AnalyzerOutputSchema.parse(JSON.parse(content));
  };
}

export function makeCritiqueLLMCall(cfg: AdapterConfig): CritiqueLLMCall {
  return async ({ systemPrompt, userPrompt }) => {
    const res = await cfg.client.chat.completions.create({
      model: cfg.critiqueModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "CritiqueOutput",
          strict: true,
          schema: zodToOpenAIJsonSchema(CritiqueOutputSchema),
        },
      },
    });
    const content = res.choices[0]?.message?.content ?? "{}";
    return CritiqueOutputSchema.parse(JSON.parse(content));
  };
}

/**
 * Hand-written Zod → OpenAI strict JSON Schema converter for the two schemas we use.
 * We avoid pulling in `zod-to-json-schema` to keep dependencies minimal. If the schemas
 * change, this function must be updated to match.
 */
function zodToOpenAIJsonSchema(schema: unknown): Record<string, unknown> {
  // AnalyzerOutputSchema: { findings: Finding[] }
  if (schema === AnalyzerOutputSchema) {
    return {
      type: "object",
      additionalProperties: false,
      required: ["findings"],
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "severity",
              "category",
              "codeCite",
              "constraintCite",
              "reasoning",
              "suggestedFixDirection",
            ],
            properties: {
              severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
              category: {
                type: "string",
                enum: ["intent_drift", "security", "bug"],
              },
              codeCite: {
                type: "object",
                additionalProperties: false,
                required: ["line", "excerpt"],
                properties: {
                  line: { type: "integer", minimum: 1 },
                  excerpt: { type: "string", minLength: 1 },
                },
              },
              constraintCite: {
                type: "object",
                additionalProperties: false,
                required: ["mdFile", "line", "text"],
                properties: {
                  mdFile: { type: "string", minLength: 1 },
                  line: { type: "integer", minimum: 1 },
                  text: { type: "string", minLength: 1 },
                },
              },
              reasoning: { type: "string", minLength: 1 },
              suggestedFixDirection: { type: "string", minLength: 1 },
            },
          },
        },
      },
    };
  }

  // CritiqueOutputSchema: { confident: boolean, reason: string }
  if (schema === CritiqueOutputSchema) {
    return {
      type: "object",
      additionalProperties: false,
      required: ["confident", "reason"],
      properties: {
        confident: { type: "boolean" },
        reason: { type: "string" },
      },
    };
  }

  throw new Error("zodToOpenAIJsonSchema: unknown schema");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add agent/analyze/openaiAdapters.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(analyze): openai structured-output adapters"
```

---

## Task 16: Wire critique + real analyzer into the cycle

**Files:**
- Modify: `agent/cycle.ts`
- Modify: `agent/main.ts`

Adds the critique pass after citation verification, and routes between mockAnalyzer and the real analyzer based on `useMockLlm`.

- [ ] **Step 1: Update `agent/cycle.ts` — add critique to the loop**

Change the `CycleDeps` interface to add an optional critique callable:

```ts
import { critiqueFinding } from "./analyze/critique.js";
import type { CritiqueLLMCall } from "./analyze/critique.js";

export interface CycleDeps {
  // ... (existing fields)
  critiqueLLM?: CritiqueLLMCall;
}
```

Inside the per-finding loop in `runCycle`, after the citation check (`verifyCitation`) succeeds, add the critique pass before dedup/handoff. Wrap it in a check so cycles run with the mock seam (no critiqueLLM provided) skip critique:

```ts
// After the existing `if (!cite.ok) { continue; }` block:
if (deps.critiqueLLM) {
  const critique = await critiqueFinding({ finding: f, callLLM: deps.critiqueLLM });
  if (!critique.keep) {
    await log.warn(`drop finding (critique): ${critique.keep ? "" : critique.reason}`);
    continue;
  }
}
```

(The `critique.keep ? "" : critique.reason` expression is awkward; a cleaner form is `(critique as { keep: false; reason: string }).reason`. Use whichever your linter prefers.)

- [ ] **Step 2: Update `agent/main.ts` — switch between mock and real analyzer**

Replace the analyzer wiring block in `main.ts` with:

```ts
import { mockAnalyzeFile } from "./analyze/mockAnalyzer.js";
import { analyzeFile as realAnalyzeFile } from "./analyze/analyzer.js";
import { getOpenAI } from "./analyze/openaiClient.js";
import { makeAnalyzerLLMCall, makeCritiqueLLMCall } from "./analyze/openaiAdapters.js";

// ... inside main():

let analyzeFile: (path: string, n: typeof nia) => Promise<import("./analyze/types.js").Finding[]>;
let critiqueLLM: import("./analyze/critique.js").CritiqueLLMCall | undefined;

if (config.useMockLlm) {
  analyzeFile = async (path) => mockAnalyzeFile(path);
  critiqueLLM = undefined;
} else {
  const openai = getOpenAI({ apiKey: config.openaiApiKey! });
  const analyzerLLM = makeAnalyzerLLMCall({
    client: openai,
    model: config.openaiModel,
    critiqueModel: config.openaiCritiqueModel,
  });
  critiqueLLM = makeCritiqueLLMCall({
    client: openai,
    model: config.openaiModel,
    critiqueModel: config.openaiCritiqueModel,
  });
  analyzeFile = (path, n) => realAnalyzeFile(path, n, analyzerLLM);
}
```

Remove the `if (!config.useMockLlm) throw new Error(...)` block that was inserted in Task 9.

Pass `critiqueLLM` into the `runCycle` call:

```ts
const result = await runCycle({
  // ... (existing fields)
  critiqueLLM,
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all existing tests pass — no test changes needed because the cycle's critique branch is gated on `critiqueLLM` being provided, which the tests don't set.

- [ ] **Step 5: Commit**

```bash
git add agent/cycle.ts agent/main.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(agent): route between mock and real analyzer; wire critique"
```

---

## Task 17: Real Nia MCP transport in `niaClient.ts`

**Files:**
- Modify: `agent/tools/niaClient.ts`
- Modify: `agent/tools/niaClient.test.ts`

We replace the dead `if (cfg.skipNia)` branch (Plan 1 left it as fallback-only) with a real MCP-backed client. Tests cover both paths with a mock MCP transport.

The real implementation uses `@modelcontextprotocol/sdk` to connect to Nia's MCP server. Two unknowns at write-time: (a) Nia's MCP transport (stdio vs HTTP), (b) the exact tool names exposed by Nia's MCP server. We assume HTTP and the tool names listed in the spec; if either is wrong, the wiring needs adjustment when the real Nia keys are available.

- [ ] **Step 1: Add a new test for the MCP path**

Append to `agent/tools/niaClient.test.ts`, inside the existing describe block:

```ts
it("calls the MCP client when skipNia=false", async () => {
  const calls: Array<{ tool: string; args: unknown }> = [];
  const mockMcp = {
    async callTool(args: { name: string; arguments: unknown }) {
      calls.push({ tool: args.name, args: args.arguments });
      if (args.name === "read_file") {
        return { content: [{ type: "text", text: "mocked code" }] };
      }
      if (args.name === "search_context") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify([{ path: "x.md", line: 1, excerpt: "ok" }]),
            },
          ],
        };
      }
      return { content: [] };
    },
  };

  const nia = createNiaClient({
    skipNia: false,
    mcpUrl: "https://invalid",
    apiKey: "k",
    filesystemRoot: workdir,
    mcpClientFactory: async () => mockMcp,
  });

  const body = await nia.readFile("src/login.ts");
  expect(body).toBe("mocked code");
  expect(calls[0]!.tool).toBe("read_file");

  const hits = await nia.searchContext("auth");
  expect(hits).toEqual([{ path: "x.md", line: 1, excerpt: "ok" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- niaClient`
Expected: FAIL — `mcpClientFactory` not in `NiaClientConfig`, or returns the filesystem fallback instead of the mock.

- [ ] **Step 3: Update `agent/tools/niaClient.ts`**

Replace the file with:

```ts
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

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

/**
 * Minimum MCP client surface this module needs. Plan 2 only uses callTool.
 * Tests inject a mock that satisfies this interface.
 */
export interface McpClientLike {
  callTool(args: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{ content: Array<{ type: string; text: string }> }>;
}

export interface NiaClientConfig {
  readonly skipNia: boolean;
  readonly mcpUrl: string;
  readonly apiKey: string;
  readonly filesystemRoot: string;
  /** Factory for the MCP client. Tests inject a mock; production builds the real client. */
  readonly mcpClientFactory?: (cfg: NiaClientConfig) => Promise<McpClientLike>;
}

export function createNiaClient(cfg: NiaClientConfig): NiaClient {
  if (cfg.skipNia) {
    return new FilesystemFallbackClient(cfg.filesystemRoot);
  }
  return new MCPNiaClient(cfg);
}

class FilesystemFallbackClient implements NiaClient {
  constructor(private readonly root: string) {}

  private safeJoin(relativePath: string): string {
    const root = resolve(this.root);
    const target = resolve(root, relativePath);
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`path escapes filesystemRoot: ${relativePath}`);
    }
    return target;
  }

  async searchCode(): Promise<NiaSearchHit[]> {
    return [];
  }

  async searchContext(): Promise<NiaSearchHit[]> {
    return [];
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(this.safeJoin(path), "utf8");
  }

  async recentDiff(): Promise<string> {
    return "";
  }

  async verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean> {
    const full = this.safeJoin(mdFile);
    if (!existsSync(full)) return false;
    const lines = readFileSync(full, "utf8").split("\n");
    const actual = lines[line - 1];
    if (actual === undefined) return false;
    return actual.trim() === text.trim();
  }
}

class MCPNiaClient implements NiaClient {
  private clientP: Promise<McpClientLike> | null = null;
  private readonly fallback: FilesystemFallbackClient;

  constructor(private readonly cfg: NiaClientConfig) {
    this.fallback = new FilesystemFallbackClient(cfg.filesystemRoot);
  }

  private getClient(): Promise<McpClientLike> {
    if (this.clientP) return this.clientP;
    const factory = this.cfg.mcpClientFactory ?? defaultMcpFactory;
    this.clientP = factory(this.cfg);
    return this.clientP;
  }

  async searchCode(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]> {
    return this.searchTool("search_code", query, opts);
  }

  async searchContext(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]> {
    return this.searchTool("search_context", query, opts);
  }

  private async searchTool(
    tool: "search_code" | "search_context",
    query: string,
    opts?: { topK?: number },
  ): Promise<NiaSearchHit[]> {
    try {
      const client = await this.getClient();
      const res = await client.callTool({
        name: tool,
        arguments: { query, top_k: opts?.topK ?? 8 },
      });
      const text = res.content[0]?.text ?? "[]";
      const parsed = JSON.parse(text) as NiaSearchHit[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async readFile(path: string): Promise<string> {
    try {
      const client = await this.getClient();
      const res = await client.callTool({ name: "read_file", arguments: { path } });
      const text = res.content[0]?.text;
      if (typeof text === "string") return text;
      throw new Error("nia read_file returned no text");
    } catch {
      // Filesystem fallback when MCP is unavailable mid-cycle.
      return this.fallback.readFile(path);
    }
  }

  async recentDiff(path: string, n?: number): Promise<string> {
    try {
      const client = await this.getClient();
      const res = await client.callTool({
        name: "recent_diff",
        arguments: { path, n: n ?? 5 },
      });
      return res.content[0]?.text ?? "";
    } catch {
      return "";
    }
  }

  async verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean> {
    // Verification is cheap on the filesystem and avoids LLM-dependent MCP semantics.
    return this.fallback.verifyConstraintCite(mdFile, line, text);
  }
}

async function defaultMcpFactory(cfg: NiaClientConfig): Promise<McpClientLike> {
  // Real MCP client construction. The MCP SDK's exact transport may need tweaking
  // for Nia's HTTP server — see https://modelcontextprotocol.io/quickstart for current
  // API. The shape here matches the Nia hackathon docs as of 2026-05-09.
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const transport = new StreamableHTTPClientTransport(new URL(cfg.mcpUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    },
  });
  const client = new Client({ name: "guardian-agent", version: "0.0.1" }, {});
  await client.connect(transport);
  return {
    async callTool(args) {
      const res = await client.callTool({ name: args.name, arguments: args.arguments });
      return {
        content: (res.content ?? []).map((c) => ({
          type: typeof c === "object" && c !== null && "type" in c ? String((c as { type: unknown }).type) : "text",
          text:
            typeof c === "object" && c !== null && "text" in c
              ? String((c as { text: unknown }).text)
              : "",
        })),
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- niaClient`
Expected: all 5 tests pass (the 4 from Plan 1 + the new MCP test).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes. (If the MCP SDK's actual API differs, the typecheck will fail — fix the import paths in `defaultMcpFactory` based on the SDK's current exports.)

- [ ] **Step 6: Commit**

```bash
git add agent/tools/niaClient.ts agent/tools/niaClient.test.ts
git -c user.name="Nicolas Dos Santos" -c user.email="nickpenton07@gmail.com" \
  commit -m "feat(nia): real MCP transport with filesystem fallback on error"
```

---

## Task 18: End-to-end smoke test — real LLM against demo repo

**Files:** none (verification only)

This is the goal-line check. With `USE_MOCK_LLM=0`, real OpenAI calls find the planted CSRF drift; the npm-audit floor finds the lodash CVE; both file real GitHub issues; the critique pass runs on each LLM finding.

- [ ] **Step 1: Switch `.env` to real LLM mode**

```bash
cd ~/projects/guardian-agent
sed -i.bak 's/^USE_MOCK_LLM=1/USE_MOCK_LLM=0/' .env && rm .env.bak
grep ^USE_MOCK_LLM .env
```
Expected: `USE_MOCK_LLM=0`.

- [ ] **Step 2: Confirm OPENAI_API_KEY is real**

```bash
grep ^OPENAI_API_KEY .env | grep -v "<paste"
```
Expected: prints the line. If empty, you haven't set the real key yet — set it before continuing.

- [ ] **Step 3: Run one cycle with real LLM**

```bash
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target npm run agent:once 2>&1 | tail -40
```
Expected: cycle runs to completion. Findings count depends on what the LLM picks up — typically 1–2 LLM findings + 1 CVE finding. If it shows `0 filed`, check the events log in Convex for `drop finding (citation)` or `drop finding (critique)` lines and inspect the rejected payloads.

- [ ] **Step 4: Verify GitHub issues exist for the new findings**

```bash
gh issue list --repo OWNER/REPO --label guardian --json number,title --limit 10
```

- [ ] **Step 5: Verify Convex state**

```bash
npx convex run findings:byStatus '{"status": "detected"}' 2>&1 | tail -50
```

- [ ] **Step 6: Run a second cycle to confirm dedup still works with real LLM**

```bash
DEMO_REPO_LOCAL_PATH=$HOME/Desktop/guardian-demo-target npm run agent:once 2>&1 | tail -10
```
Expected: 0 filed (dedup) OR very small number if the LLM drifted slightly in its citation. Some drift between LLM runs is expected; the fingerprint key is `path + constraintMdFile + constraintLine + codeLine`, so as long as the LLM cites the same constraint line + code line, the dedup will fire.

- [ ] **Step 7: No commit needed**

This task is verification only.

- [ ] **Step 8: Tag the plan-complete commit**

```bash
git tag plan-2-write-pipeline-analyzer
git log --oneline -25
```

---

## Plan complete

After Task 18, the cycle does the full ANALYZE/CRITIQUE/HANDOFF chain. Real GitHub issues land for each detected finding, the npm-audit floor provides a CVE finding regardless of LLM behavior, citation verification kills hallucinated findings, the LLM critique pass kills low-confidence findings, and dedup by fingerprint prevents duplicate filings across cycles.

Plan 3 will pick up: spawning Devin runs from filed issues, watching for the resulting PRs, and closing the loop with a re-scan that either confirms resolution or sharpens the prompt and tries again.

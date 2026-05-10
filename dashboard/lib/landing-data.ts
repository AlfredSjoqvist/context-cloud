// dashboard/lib/landing-data.ts
// Single source of truth for any number / example shown on the landing.
// Frozen snapshot — last refreshed: 2026-05-10 from convex deployment
// acoustic-fish-389 + demo-target NewCoder3294. To refresh: re-query the
// Convex queries listed in docs/superpowers/plans/2026-05-10-landing-fixes.md
// (Phase 1 / Task 1) and bump SNAPSHOT_TAKEN.

export const SNAPSHOT_TAKEN = "2026-05-10";
export const SNAPSHOT_CONVEX = "acoustic-fish-389";
export const SNAPSHOT_DEMO = "NewCoder3294/demo-target";

export const COUNTS = {
    activeNotes: 17,
    totalInjections: 241,
    cyclesRun: 51,
    filesWatched: 26,
    findingsTotal: 6,
    issuesFiled: 5,
    issuesResolved: 1,
    sessionsCaptured: 12,
    gcActionsLifetime: 29,
} as const;

export const CYCLE_TIMINGS_MS = [400, 200, 2100, 5800, 2300, 600, 100] as const;
// WAKE · PLAN · SCAN · ANALYZE · CRITIQUE · HANDOFF · RECONCILE
export const CYCLE_PHASES = [
    { id: "wake",     name: "WAKE",     sub: "scheduler tick",  body: "Tensorlake fires the cycle every 60s. Convex state loads. Hot microVM boots the Node agent.",                       sample: "cron: * * * * *  →  openCycle()" },
    { id: "plan",     name: "PLAN",     sub: "priority + judgment", body: "priorityPicks() ranks by staleness × cleanScanStreak. One GPT-5 judgment-pick added per cycle.",                  sample: "→ login.ts · package.json · db.ts" },
    { id: "scan",     name: "SCAN",     sub: "nia.read",        body: "nia_read for each pick. searchContext returns top-K .md chunks. recentDiff returns the last commits touching the file.", sample: "nia_read(src/routes/login.ts)" },
    { id: "analyze",  name: "ANALYZE",  sub: "gpt-5 + zod",     body: "Compares code against constraints in .context-map/. Structured output via OpenAI strict JSON schema. npm audit is the security floor.", sample: "Finding[] {severity, codeCite, mdCite}" },
    { id: "critique", name: "CRITIQUE", sub: "byte-check + gpt-5-mini", body: "1) verifyCitation: code line + .md line must literally exist. 2) cheaper LLM self-critique — <80% confidence drops.", sample: "drop f_d04 · 0.62 confidence" },
    { id: "handoff",  name: "HANDOFF",  sub: "octokit + devin", body: "Fingerprint dedup (sha256 path+mdFile+mdLine+codeLine). Creates GitHub issue, spawns Devin run, sets status to devin_running.", sample: "POST /repos/.../issues → #146" },
    { id: "reconcile", name: "RECONCILE", sub: "PR walk + sharpen", body: "Walks open findings: PR merged → re-scan → resolved OR re-spawn Devin with sharpened prompt. Hard cap 2 iterations.", sample: "if still violating → sharpen(iter=2)" },
] as const;

export const HURDLE_SIGNALS = [
    { id: "action_bigram_loop", weight: 3.0, body: "Same tool/action shape repeats ≥ 3 times in a 10-call window." },
    { id: "retry_loop",         weight: 2.0, body: "Same tool produces ≥ 2 consecutive errors." },
    { id: "interrupt",          weight: 2.0, body: "User sends a free-text message while tool calls are still pending." },
    { id: "reverted_edit",      weight: 2.0, body: "Same file edited again within 5 events of the prior edit." },
    { id: "correction_phrase",  weight: 1.0, body: "User text matches 'no | wrong | actually | instead | stop | never'." },
    { id: "prompt_reask",       weight: 1.0, body: "User repeats a semantically similar prompt (cosine ≥ 0.6)." },
    { id: "feedback",           weight: 3.0, body: "MCP feedback tool reports useful=false." },
] as const;
export const HURDLE_THRESHOLD = 3.0;
export const SIGNAL_CLUSTER_GAP = 12;
export const RESOLUTION_LOOKAHEAD = 16;
export const PRECONTEXT_EVENTS = 10;

export const GC_KNOBS = {
    halfLifeDays: 7,
    mergeJaccard: 0.6,
    mergeCosine: 0.5,
    pruneImportance: 0.10,
    cron: "*/15 * * * *",
} as const;

export const NM_NOTE_EXAMPLE = {
    id: "n_92ac",
    importance: 0.94,
    injects: 47,
    age: "3d",
    symptom: "Agent hardcoded an internal API host in client.ts",
    rootCause: "All backend URLs read from INTERNAL_API_BASE env var; hardcoding leaks staging into prod.",
    correction: "Read from process.env.INTERNAL_API_BASE; never inline a URL.",
    files: [
        { path: "src/lib/client.ts", weight: 1.0 },
        { path: ".env.example",     weight: 0.6 },
    ],
} as const;

export const GUARDIAN_FINDING_EXAMPLE = {
    id: "f_a01",
    severity: "high",
    category: "intent_drift",
    path: "src/routes/login.ts",
    codeLine: 28,
    codeExcerpt: "router.post('/login', async (req, res) => {",
    constraintMdFile: ".context-map/library/auth/login-constraints.md",
    constraintLine: 1,
    constraintText: "All authentication endpoints MUST verify CSRF token via the requireCsrfToken middleware before processing the request body.",
    githubIssue: 3,
    devinRunId: "devin_a1b2c3",
    sharpenIterations: 0,
} as const;

export const SEVERITY_COUNTS = { critical: 1, high: 3, medium: 2, low: 0 } as const;

export const STACK_NODES = [
    { id: "tensorlake", label: "Tensorlake", role: "scheduler · sandbox",       color: "#7C9EFF" },
    { id: "convex",     label: "Convex",     role: "reactive state",            color: "#FFB86B" },
    { id: "nia",        label: "Nia",        role: "code + .md index",          color: "#C49BFF" },
    { id: "openai",     label: "OpenAI",     role: "analyzer + critique",       color: "#66E0FF" },
    { id: "devin",      label: "Devin",      role: "spawn → PR → sharpen",      color: "#6EE7B7" },
    { id: "github",     label: "GitHub",     role: "issues · PRs · webhooks",   color: "#F9E27D" },
    { id: "docsingest", label: "docs-ingest", role: "external docs → .md",      color: "#FF7A8A" },
    { id: "sqlite",     label: "SQLite",     role: "capture tier · trace",      color: "#A0A8BD" },
] as const;

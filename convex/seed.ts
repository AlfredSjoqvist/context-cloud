// One-shot seed mutation that populates Convex with the same data baked into
// mock/index.html, so the deployed Vercel dashboard renders identical content
// when wired to live Convex queries.
//
// Run with:    npx convex run seed:seedAll
// Re-runs are safe: stable string IDs (userId/agentId/noteId/path) drive
// upserts; volatile tables (injections, gcActions, gcRuns, prunedEdges) are
// cleared first to avoid duplicates.
//
// All timestamps are computed at seed time as (now - offsetMin * 60_000),
// so the data ages naturally relative to whenever this is run.

import { mutation } from "./_generated/server";

const NOW = () => Date.now();
const isoAt = (msAgo: number) => new Date(NOW() - msAgo).toISOString();
const minToMs = (m: number) => m * 60_000;

// stable PRNG (same algorithm as mock/index.html so we get reproducible data)
function mulberry32(seed: number) {
    let s = seed;
    return () => {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── ORG ─────────────────────────────────────────
const USERS = [
    { userId: "u_alfred", name: "Alfred Sjöqvist", handle: "alfred", email: "alfred@acme.eng", role: "Founding eng", initial: "AS", color: "#7C9EFF", joinedDaysAgo: 270 },
    { userId: "u_jenna",  name: "Jenna Park",      handle: "jenna",  email: "jenna@acme.eng",  role: "Senior eng",   initial: "JP", color: "#FFB86B", joinedDaysAgo: 247 },
    { userId: "u_kai",    name: "Kai Tanaka",      handle: "kai",    email: "kai@acme.eng",    role: "Backend eng",  initial: "KT", color: "#6EE7B7", joinedDaysAgo: 114 },
    { userId: "u_mira",   name: "Mira Reyes",      handle: "mira",   email: "mira@acme.eng",   role: "Frontend eng", initial: "MR", color: "#C49BFF", joinedDaysAgo: 70  },
    { userId: "u_ren",    name: "Ren Bakhtin",     handle: "ren",    email: "ren@acme.eng",    role: "Eng intern",   initial: "RB", color: "#FF7A8A", joinedDaysAgo: 22  },
];
const AGENTS = [
    { agentId: "a_codex_alfred",  userId: "u_alfred", vendor: "Codex" },
    { agentId: "a_cc_alfred",     userId: "u_alfred", vendor: "Claude Code" },
    { agentId: "a_cursor_jenna",  userId: "u_jenna",  vendor: "Cursor" },
    { agentId: "a_cc_jenna",      userId: "u_jenna",  vendor: "Claude Code" },
    { agentId: "a_codex_kai",     userId: "u_kai",    vendor: "Codex" },
    { agentId: "a_cc_mira",       userId: "u_mira",   vendor: "Claude Code" },
    { agentId: "a_cursor_ren",    userId: "u_ren",    vendor: "Cursor" },
];

// ─── FILES ───────────────────────────────────────
const FILES = [
    "acme-agent-gateway/src/api/mcp.ts","acme-agent-gateway/src/api/auth.ts","acme-connectors/src/github/webhooks.ts","acme-agent-gateway/src/db/schema.ts",
    "acme-control-plane/components/ActivityFeed.tsx","acme-control-plane/app/page.tsx","acme-control-plane/components/NoteGraph.tsx",
    "acme-control-plane/components/InjectionPanel.tsx","acme-control-plane/components/ReplayTimeline.tsx",
    "acme-memory-graph/src/context/briefs.py","acme-memory-graph/src/context/graph.py","acme-memory-graph/src/context/guardian.py",
    "acme-control-plane/lib/convex.ts","acme-runtime-orchestrator/src/runtime/sandbox.py","acme-connectors/src/nia/search.ts","acme-agent-gateway/src/lib/redaction.ts",
    "acme-control-plane/lib/format.ts","acme-runtime-orchestrator/src/runtime/metrics.py",
    "acme-memory-graph/src/context/extract.py","acme-memory-graph/src/context/gc.py","acme-memory-graph/src/context/nia_index.py",
    "acme-agent-gateway/.env.example","acme-agent-gateway/package.json","acme-runtime-orchestrator/pyproject.toml","acme-agent-gateway/README.md","acme-control-plane/README.md",
];
const FILE_TYPE_OF = (p: string): string => {
    if (p.endsWith(".tsx")) return "tsx";
    if (p.endsWith(".ts")) return "ts";
    if (p.endsWith(".json")) return "json";
    if (p.endsWith(".md")) return "md";
    if (p.endsWith(".example")) return "env";
    return "txt";
};

// ─── NOTES (active) ──────────────────────────────
type ActiveNote = {
    noteId: string; importance: number; injectCount: number; ageMin: number;
    symptom: string; rootCause: string; correction: string;
    edges: { path: string; weight: number }[];
};
const ACTIVE_NOTES: ActiveNote[] = [
    { noteId:"n_92ac", importance:0.94, injectCount:47, ageMin:2*1440,
      symptom:"Hardcoded API URL in client.ts",
      rootCause:"All backend URLs use the INTERNAL_API_BASE env var. Hardcoding leaks staging into prod.",
      correction:"Read from process.env.INTERNAL_API_BASE; never inline a URL.",
      edges:[{path:"acme-agent-gateway/src/api/mcp.ts",weight:1.0},{path:"acme-agent-gateway/.env.example",weight:0.6}] },
    { noteId:"n_91d5", importance:0.71, injectCount:18, ageMin:4*1440,
      symptom:"Backend service URL hardcoded as string literal",
      rootCause:"Convention: all backend URLs read from process.env.INTERNAL_API_BASE. Hardcoded URLs fail CI lint.",
      correction:"Replace literal URL with process.env.INTERNAL_API_BASE prefix; CI gate added in #520.",
      edges:[{path:"acme-agent-gateway/src/api/mcp.ts",weight:1.0},{path:"acme-agent-gateway/.env.example",weight:0.55}] },
    { noteId:"n_4f1d", importance:0.88, injectCount:31, ageMin:5*1440,
      symptom:"JWT verified without checking expiry",
      rootCause:"Expiry check was removed in #482 to unblock staging. Must be reinstated before merge.",
      correction:"Use verifyJWT() from lib/auth — never call jwt.decode directly.",
      edges:[{path:"acme-agent-gateway/src/api/auth.ts",weight:1.0},{path:"acme-agent-gateway/src/lib/redaction.ts",weight:0.4}] },
    { noteId:"n_b73e", importance:0.82, injectCount:19, ageMin:1*1440,
      symptom:"Webhook handler returned 500 on validation errors",
      rootCause:"Tensorlake retries on 5xx. Returning 500 for bad payloads triggers infinite retry storms.",
      correction:"Return 400 on validation failures; reserve 5xx for transient infra faults.",
      edges:[{path:"acme-connectors/src/github/webhooks.ts",weight:1.0},{path:"acme-runtime-orchestrator/src/runtime/sandbox.py",weight:0.55}] },
    { noteId:"n_2c08", importance:0.79, injectCount:24, ageMin:3*1440,
      symptom:"Dashboard re-renders on every Convex update",
      rootCause:"useQuery without a selector subscribes to the whole table — full churn on any write.",
      correction:"Pass a selector to useQuery to scope reactivity to the rows you actually render.",
      edges:[{path:"acme-control-plane/app/page.tsx",weight:1.0},{path:"acme-memory-graph/src/context/briefs.py",weight:0.7},{path:"acme-control-plane/lib/convex.ts",weight:0.3}] },
    { noteId:"n_5a91", importance:0.76, injectCount:14, ageMin:8*1440,
      symptom:"Convex schema migration ran without snapshot",
      rootCause:"Ops policy: production schema changes require a snapshot first; missed in #511.",
      correction:"Run `npm run snapshot` before pushing schema changes; CI gate added in #520.",
      edges:[{path:"acme-control-plane/lib/convex.ts",weight:1.0}] },
    { noteId:"n_e6c4", importance:0.74, injectCount:11, ageMin:12*60,
      symptom:"Tensorlake sandbox spawned with 16GB RAM",
      rootCause:"Default org budget is 4GB. 16GB triggers cost alerts and pages oncall.",
      correction:"Pass memory_mb: 4096 explicitly when calling spawnSandbox().",
      edges:[{path:"acme-runtime-orchestrator/src/runtime/sandbox.py",weight:1.0},{path:"acme-memory-graph/src/context/gc.py",weight:0.5},{path:"acme-memory-graph/src/context/nia_index.py",weight:0.5}] },
    { noteId:"n_8d77", importance:0.71, injectCount:9, ageMin:4*1440,
      symptom:"API client retried on 4xx responses",
      rootCause:"fetch wrapper retries any non-2xx; 4xx is a client bug and should fail loudly.",
      correction:"Only retry on network errors and 5xx. Never retry 4xx.",
      edges:[{path:"acme-agent-gateway/src/api/mcp.ts",weight:1.0},{path:"acme-agent-gateway/src/db/schema.ts",weight:0.3}] },
    { noteId:"n_f330", importance:0.68, injectCount:8, ageMin:6*1440,
      symptom:"TS strict mode disabled in tsconfig",
      rootCause:"Strict was disabled during the v2 migration in March; never re-enabled.",
      correction:"Re-enable strict: true and fix the resulting errors before merging new code.",
      edges:[{path:"acme-runtime-orchestrator/pyproject.toml",weight:1.0},{path:"acme-agent-gateway/src/db/schema.ts",weight:0.4}] },
    { noteId:"n_71b2", importance:0.64, injectCount:12, ageMin:2*1440,
      symptom:'Guardian rejected a relevant note as "off-topic"',
      rootCause:"Cosine threshold was set to 0.78; semantically-distant but file-matched notes drop.",
      correction:"Lower threshold to 0.62 when file-match weight ≥ 0.8; see ADR-014.",
      edges:[{path:"acme-memory-graph/src/context/nia_index.py",weight:1.0},{path:"acme-memory-graph/src/context/guardian.py",weight:0.7},{path:"acme-connectors/src/nia/search.ts",weight:0.4}] },
    { noteId:"n_c402", importance:0.61, injectCount:6, ageMin:1*1440,
      symptom:"useNotes returns stale data after mutation",
      rootCause:"Convex optimistic updates require explicit invalidation when patching nested fields.",
      correction:"Call ctx.db.patch() then revalidate the notes query on the client.",
      edges:[{path:"acme-memory-graph/src/context/briefs.py",weight:1.0},{path:"acme-control-plane/components/NoteGraph.tsx",weight:0.5}] },
    { noteId:"n_2f10", importance:0.52, injectCount:5, ageMin:7*1440,
      symptom:"useNotes returned outdated values after a write",
      rootCause:"Optimistic update path skips revalidation when the patch returns synchronously.",
      correction:"Always revalidate the notes query after a patch — even on synchronous success.",
      edges:[{path:"acme-memory-graph/src/context/briefs.py",weight:1.0}] },
    { noteId:"n_a519", importance:0.58, injectCount:7, ageMin:11*1440,
      symptom:"formatDate returned UTC offset on dashboard",
      rootCause:"Org default timezone is America/Los_Angeles per onboarding; UTC drift confuses users.",
      correction:"Pass { tz: 'America/Los_Angeles' } to formatDate or use formatLocal().",
      edges:[{path:"acme-runtime-orchestrator/src/runtime/metrics.py",weight:1.0},{path:"acme-control-plane/app/page.tsx",weight:0.35}] },
    { noteId:"n_d8e2", importance:0.55, injectCount:5, ageMin:3*1440,
      symptom:"Note Manager dropped events under burst load",
      rootCause:"In-memory queue in noteManager.ts has no backpressure — drops above ~200 ev/s.",
      correction:"Pipe events through Convex queue; never buffer in process memory.",
      edges:[{path:"acme-memory-graph/src/context/extract.py",weight:1.0},{path:"acme-agent-gateway/src/lib/redaction.ts",weight:0.6},{path:"acme-control-plane/lib/convex.ts",weight:0.4}] },
    { noteId:"n_7b4f", importance:0.49, injectCount:18, ageMin:1*60,
      symptom:'TEST.md edits get auto-injected with "AAAAAAA"',
      rootCause:"This is the smoke test fixture — do not commit edits to TEST.md.",
      correction:"Use a different file for testing. Revert TEST.md before committing.",
      edges:[{path:"acme-control-plane/README.md",weight:1.0}] },
    { noteId:"n_03e1", importance:0.42, injectCount:4, ageMin:14*1440,
      symptom:"Imports use absolute paths from /src/api",
      rootCause:"Test setup mocks the api layer — direct imports bypass the mocks.",
      correction:"Import from tests/fixtures/api in test files; use real path elsewhere.",
      edges:[{path:"acme-agent-gateway/src/api/mcp.ts",weight:0.6},{path:"acme-agent-gateway/src/db/schema.ts",weight:0.6},{path:"acme-agent-gateway/package.json",weight:0.2}] },
    { noteId:"n_6a08", importance:0.38, injectCount:3, ageMin:20*1440,
      symptom:"Debounce called with 0ms wait",
      rootCause:"A 0ms debounce still defers to the next tick; intent was sync — wrong helper.",
      correction:"Call directly when wait=0; reserve debounce for actual delays.",
      edges:[{path:"acme-control-plane/lib/format.ts",weight:1.0}] },
];

// ─── HISTORY notes (legacy + ephemeral) ──────────
type HistoryNote = ActiveNote & {
    lifecycleAtMin: number;          // mock-time minutes ago when invalidated/merged
    lifecycleType: "invalidate" | "merge";
    lifecycleTarget?: string;
    invalidatedReason?: string;
};
const LEGACY_HISTORY: HistoryNote[] = [
    { noteId:"n_old1", importance:0.18, injectCount:2, ageMin:32*1440,
      lifecycleAtMin: 32*1440 - Math.floor(32*0.7*1440), lifecycleType:"invalidate",
      invalidatedReason:"no inject in 28d; importance 0.18 below threshold 0.20",
      symptom:"Tabs vs spaces in api/types.ts",
      rootCause:"Editorconfig switched to tabs in February.",
      correction:"Use 2-space indent (project default).",
      edges:[{path:"acme-agent-gateway/src/db/schema.ts",weight:1.0}] },
    { noteId:"n_old2", importance:0.31, injectCount:5, ageMin:21*1440,
      lifecycleAtMin: 21*1440 - Math.floor(21*0.7*1440), lifecycleType:"invalidate",
      invalidatedReason:"low feedback score 0.42; replaced by lint rule",
      symptom:"console.log left in production handler",
      rootCause:"Code review missed it; lint rule was disabled briefly.",
      correction:"Use the structured logger; lint rule is back on.",
      edges:[{path:"acme-connectors/src/github/webhooks.ts",weight:0.8}] },
    { noteId:"n_old3", importance:0.46, injectCount:7, ageMin:18*1440,
      lifecycleAtMin: 18*1440 - Math.floor(18*0.7*1440), lifecycleType:"merge", lifecycleTarget:"n_92ac",
      invalidatedReason:"similarity 0.87 with n_92ac; merged into higher-importance note",
      symptom:"Backend host hardcoded",
      rootCause:"Older convention; superseded by env var policy.",
      correction:"Use INTERNAL_API_BASE.",
      edges:[{path:"acme-agent-gateway/src/api/mcp.ts",weight:0.9}] },
];
const EPHEMERAL_HISTORY: HistoryNote[] = [
    { noteId:"n_eph_01", importance:0.42, injectCount:5, ageMin:13*1440, lifecycleAtMin:8*1440,
      lifecycleType:"invalidate", invalidatedReason:"no inject in 5d · retained_score 0.18 below 0.20 threshold",
      symptom:"Logging used console.log directly",
      rootCause:"Quick debug left in. Should use the structured logger.",
      correction:"Use logger.info() with a context object.",
      edges:[{path:"acme-connectors/src/github/webhooks.ts",weight:0.6},{path:"acme-memory-graph/src/context/extract.py",weight:0.4}] },
    { noteId:"n_eph_02", importance:0.51, injectCount:7, ageMin:12*1440, lifecycleAtMin:5*1440,
      lifecycleType:"merge", lifecycleTarget:"n_92ac",
      invalidatedReason:"similarity 0.81 with n_92ac · merged into higher-importance note",
      symptom:"API URL stored as a const at module top",
      rootCause:"Constants file leaked staging URLs into prod.",
      correction:"Read from env var instead of storing constants.",
      edges:[{path:"acme-agent-gateway/src/api/mcp.ts",weight:0.85}] },
    { noteId:"n_eph_03", importance:0.39, injectCount:4, ageMin:11*1440, lifecycleAtMin:4*1440,
      lifecycleType:"invalidate", invalidatedReason:"feedback score 0.36 below threshold · superseded by Prettier config",
      symptom:"Inconsistent indent in Dashboard.tsx",
      rootCause:"Mix of 2-space and 4-space indent.",
      correction:"Run npm run format; CI gate added in #523.",
      edges:[{path:"acme-control-plane/app/page.tsx",weight:0.7}] },
    { noteId:"n_eph_04", importance:0.46, injectCount:6, ageMin:10*1440, lifecycleAtMin:6*1440,
      lifecycleType:"merge", lifecycleTarget:"n_b73e",
      invalidatedReason:"similarity 0.78 with n_b73e about webhook 5xx errors",
      symptom:"Webhook returned 503 for malformed payloads",
      rootCause:"Variant of n_b73e — same retry storm pattern.",
      correction:"Return 400 on validation errors; see ADR-011.",
      edges:[{path:"acme-connectors/src/github/webhooks.ts",weight:0.9}] },
    { noteId:"n_eph_05", importance:0.34, injectCount:3, ageMin:9*1440, lifecycleAtMin:1*1440,
      lifecycleType:"invalidate", invalidatedReason:"idle 7d · retained_score 0.14 below threshold",
      symptom:"Empty catch block silenced an error",
      rootCause:"Catch with no rethrow lost a Convex transaction error.",
      correction:"Always rethrow or log + handle explicitly.",
      edges:[{path:"acme-control-plane/lib/convex.ts",weight:0.55}] },
    { noteId:"n_eph_06", importance:0.48, injectCount:4, ageMin:9*1440, lifecycleAtMin:3*1440,
      lifecycleType:"invalidate", invalidatedReason:"feedback score 0.50 below 0.55 threshold · 4 injects only",
      symptom:"Used setInterval without cleanup",
      rootCause:"Memory leak in Header.tsx — interval never cleared.",
      correction:"Always clear in useEffect cleanup.",
      edges:[{path:"acme-control-plane/components/ActivityFeed.tsx",weight:0.8}] },
    { noteId:"n_eph_07", importance:0.43, injectCount:5, ageMin:7*1440, lifecycleAtMin:2*1440,
      lifecycleType:"merge", lifecycleTarget:"n_e6c4",
      invalidatedReason:"similarity 0.74 with n_e6c4 about Tensorlake budgets",
      symptom:"Spawned sandbox with 8GB RAM",
      rootCause:"Variant of n_e6c4 — also exceeds default org budget.",
      correction:"Set memory_mb: 4096 explicitly when calling spawnSandbox().",
      edges:[{path:"acme-runtime-orchestrator/src/runtime/sandbox.py",weight:0.7}] },
    { noteId:"n_eph_08", importance:0.36, injectCount:2, ageMin:6*1440, lifecycleAtMin:90,
      lifecycleType:"invalidate", invalidatedReason:"inject_count 2 · idle 5d · retained_score 0.12",
      symptom:"Magic number 86400 in date math",
      rootCause:"Should use dayMs constant from lib/time.",
      correction:"Import dayMs from lib/time; PR #530.",
      edges:[{path:"acme-runtime-orchestrator/src/runtime/metrics.py",weight:0.5}] },
    { noteId:"n_eph_09", importance:0.40, injectCount:3, ageMin:5*1440, lifecycleAtMin:60,
      lifecycleType:"invalidate", invalidatedReason:"inject_count 3 · feedback score 0.33 below threshold",
      symptom:"Type assertion used instead of guard",
      rootCause:"as Foo bypassed runtime check; broke under malformed payload.",
      correction:"Use isFoo() type guard.",
      edges:[{path:"acme-agent-gateway/src/db/schema.ts",weight:0.6},{path:"acme-agent-gateway/src/api/auth.ts",weight:0.3}] },
    { noteId:"n_eph_10", importance:0.45, injectCount:4, ageMin:4*1440, lifecycleAtMin:1440,
      lifecycleType:"merge", lifecycleTarget:"n_2c08",
      invalidatedReason:"similarity 0.83 with n_2c08 — same Convex re-render issue",
      symptom:"NoteCard re-renders on unrelated mutations",
      rootCause:"Same root cause as n_2c08 — useQuery without selector.",
      correction:"Pass selector to useQuery in NoteCard.",
      edges:[{path:"acme-control-plane/components/NoteGraph.tsx",weight:0.85},{path:"acme-memory-graph/src/context/briefs.py",weight:0.4}] },
];

// ─── PRUNED EDGES (historical) ───────────────────
const PRUNED_EDGES = [
    { noteId:"n_92ac", path:"acme-agent-gateway/src/lib/redaction.ts",              weight:0.18, prunedOffsetMin:9*1440, reason:"edge weight 0.18 · never anchored an injection" },
    { noteId:"n_92ac", path:"acme-memory-graph/src/context/extract.py",   weight:0.12, prunedOffsetMin:6*1440, reason:"edge weight 0.12 · 0 injections anchored to this file" },
    { noteId:"n_2c08", path:"acme-control-plane/lib/format.ts",       weight:0.09, prunedOffsetMin:5*1440, reason:"edge weight 0.09 below 0.10 threshold" },
    { noteId:"n_b73e", path:"acme-connectors/src/nia/search.ts",              weight:0.14, prunedOffsetMin:5*1440, reason:"unrelated file · stale anchor for 11d" },
    { noteId:"n_4f1d", path:"acme-control-plane/components/ActivityFeed.tsx",   weight:0.07, prunedOffsetMin:4*1440, reason:"edge weight 0.07 · spurious match" },
    { noteId:"n_71b2", path:"acme-runtime-orchestrator/src/runtime/metrics.py",     weight:0.11, prunedOffsetMin:3*1440, reason:"edge weight 0.11 · file reorg in #519" },
    { noteId:"n_e6c4", path:"acme-agent-gateway/src/db/schema.ts",            weight:0.13, prunedOffsetMin:3*1440, reason:"edge weight 0.13 · stale anchor" },
    { noteId:"n_d8e2", path:"acme-control-plane/components/ReplayTimeline.tsx", weight:0.06, prunedOffsetMin:2*1440, reason:"edge weight 0.06 · 0 injections in 7d" },
    { noteId:"n_5a91", path:"acme-control-plane/app/page.tsx", weight:0.16, prunedOffsetMin:2*1440, reason:"edge weight 0.16 · ADR-014 narrowed scope" },
    { noteId:"n_c402", path:"acme-control-plane/lib/convex.ts",           weight:0.10, prunedOffsetMin:1*1440, reason:"edge weight 0.10 below threshold" },
    { noteId:"n_8d77", path:"acme-agent-gateway/src/lib/redaction.ts",              weight:0.08, prunedOffsetMin:1*1440, reason:"edge weight 0.08 · never anchored" },
    { noteId:"n_a519", path:"acme-agent-gateway/src/db/schema.ts",            weight:0.07, prunedOffsetMin:1*1440, reason:"edge weight 0.07 below threshold" },
];

const REJECT_REASONS = ["budget exceeded","stale (recently injected)","conflict with n_71b2","off-topic for current session"];

async function clearTable(ctx: any, table: string) {
    const rows = await ctx.db.query(table).collect();
    for (const r of rows) await ctx.db.delete(r._id);
}

// ─── EXTERNAL LIBRARIES (real, detected from mock_org/) ────
// Detection sources:
//   agent-gateway/package.json          → zod
//   connectors/package.json             → @octokit/webhooks
//   control-plane/package.json          → next, react, react-dom, convex, @convex-dev/react-query
//   runtime-orchestrator/pyproject.toml → pydantic, httpx
//   memory-graph/                       → ⚠ no manifest (surfaced as a registry gap)
const DEMO_LIBRARIES = [
    {
        name: "zod",
        detectedFrom: ["acme-agent-gateway/package.json", "acme-agent-gateway/src/api/auth.ts"],
        source: "https://zod.dev/",
        sourceKind: "mcp",
        mcpServer: "nia-explore @ zod",
        version: "^3.24.0",
        lastIngestedOffsetMin: 17,
        freshness: "fresh",
        ingestRuns: [
            { offsetMin: 17,        summary: "0 changes detected",                    changes: 0 },
            { offsetMin: 6 * 60,    summary: "1 leaf updated · z.coerce semantics",   changes: 1 },
            { offsetMin: 2 * 1440,  summary: "first ingest · 4 leaves",                changes: 4 },
        ],
    },
    {
        name: "@octokit/webhooks",
        detectedFrom: ["acme-connectors/package.json", "acme-connectors/src/github/webhooks.ts"],
        source: "https://github.com/octokit/webhooks.js",
        sourceKind: "github",
        version: "^13.0.0",
        lastIngestedOffsetMin: 28 * 60,
        freshness: "stale",
        ingestRuns: [
            { offsetMin: 28 * 60,   summary: "first ingest · 3 leaves",                changes: 3 },
        ],
    },
    {
        name: "next",
        detectedFrom: ["acme-control-plane/package.json", "acme-control-plane/app/page.tsx", "acme-control-plane/app/packs/[slug]/page.tsx"],
        source: "https://nextjs.org/docs",
        sourceKind: "url",
        version: "^15.0.0",
        lastIngestedOffsetMin: 42,
        freshness: "fresh",
        ingestRuns: [
            { offsetMin: 42,        summary: "0 changes detected",                    changes: 0 },
            { offsetMin: 4 * 60,    summary: "2 leaves updated · App Router caching", changes: 2 },
            { offsetMin: 3 * 1440,  summary: "first ingest · 6 leaves",                changes: 6 },
        ],
    },
    {
        name: "react",
        detectedFrom: ["acme-control-plane/package.json", "acme-control-plane/components/ActivityFeed.tsx", "acme-control-plane/components/NoteGraph.tsx"],
        source: "https://react.dev",
        sourceKind: "url",
        version: "^19.0.0",
        lastIngestedOffsetMin: 55,
        freshness: "fresh",
        ingestRuns: [
            { offsetMin: 55,        summary: "0 changes detected",                    changes: 0 },
            { offsetMin: 5 * 1440,  summary: "first ingest · 8 leaves",                changes: 8 },
        ],
    },
    {
        name: "convex",
        detectedFrom: ["acme-control-plane/package.json", "acme-control-plane/lib/convex.ts", "acme-control-plane/components/ReplayTimeline.tsx"],
        source: "https://docs.convex.dev",
        sourceKind: "mcp",
        mcpServer: "convex-docs-mcp",
        version: "^1.38.0",
        lastIngestedOffsetMin: 0,
        freshness: "refreshing",
        ingestRuns: [
            { offsetMin: 3 * 60,    summary: "1 leaf updated · React Query helpers", changes: 1 },
            { offsetMin: 1 * 1440,  summary: "first ingest · 7 leaves",                changes: 7 },
        ],
    },
    {
        name: "@convex-dev/react-query",
        detectedFrom: ["acme-control-plane/package.json"],
        source: "https://stack.convex.dev/react-query",
        sourceKind: "url",
        version: "^0.0.5",
        lastIngestedOffsetMin: 53 * 60,
        freshness: "stale",
        ingestRuns: [
            { offsetMin: 53 * 60,   summary: "first ingest · 2 leaves",                changes: 2 },
        ],
    },
    {
        name: "pydantic",
        detectedFrom: ["acme-runtime-orchestrator/pyproject.toml", "acme-runtime-orchestrator/src/runtime/state_store.py"],
        source: "https://docs.pydantic.dev/latest/",
        sourceKind: "url",
        version: ">=2",
        lastIngestedOffsetMin: 36,
        freshness: "fresh",
        ingestRuns: [
            { offsetMin: 36,        summary: "0 changes detected",                    changes: 0 },
            { offsetMin: 8 * 60,    summary: "1 leaf updated · v2 model_validator",  changes: 1 },
            { offsetMin: 4 * 1440,  summary: "first ingest · 5 leaves",                changes: 5 },
        ],
    },
    {
        name: "httpx",
        detectedFrom: ["acme-runtime-orchestrator/pyproject.toml"],
        source: "https://github.com/advisories/GHSA-pp77-95cm-h2v3",
        sourceKind: "ghsa",
        version: ">=0.27 (CVE-2024-23342)",
        lastIngestedOffsetMin: 4,
        freshness: "cve",
        ingestRuns: [
            { offsetMin: 4,         summary: "GHSA-pp77 · ECDSA signature timing leak", changes: 1 },
            { offsetMin: 9 * 60,    summary: "first ingest · 3 leaves",                  changes: 3 },
        ],
    },
    // ⚠ surfaced gap: memory-graph has no manifest
    {
        name: "memory-graph (no manifest)",
        detectedFrom: ["acme-memory-graph/"],
        source: "—",
        sourceKind: "gap",
        version: undefined,
        lastIngestedOffsetMin: 0,
        freshness: "gap",
        ingestRuns: [
            { offsetMin: 0,         summary: "no pyproject.toml / requirements.txt found · cannot detect deps", changes: 0 },
        ],
    },
];

// ─── DOCS-INGEST LEAVES (mock) ────────────────────
const DEMO_DOCS_LEAVES = [
    { runId: "run_001", lib: "express",     topic: "auth",     sourceUri: "https://expressjs.com/en/advanced/best-practice-security.html", sourceUrl: "https://expressjs.com/en/advanced/best-practice-security.html", ruleCount: 3, appliesTo: ["acme-agent-gateway/src/api/auth.ts", "acme-agent-gateway/src/api/mcp.ts"], leafPath: ".context-map/library/express/auth.md", extractor: "html" },
    { runId: "run_001", lib: "express",     topic: "errors",   sourceUri: "https://expressjs.com/en/guide/error-handling.html",            sourceUrl: "https://expressjs.com/en/guide/error-handling.html",            ruleCount: 2, appliesTo: ["acme-connectors/src/github/webhooks.ts"],                       leafPath: ".context-map/library/express/errors.md", extractor: "html" },
    { runId: "run_002", lib: "convex",      topic: "schema",   sourceUri: "https://docs.convex.dev/database/schemas",                       sourceUrl: "https://docs.convex.dev/database/schemas",                       ruleCount: 4, appliesTo: ["acme-control-plane/lib/convex.ts", "acme-runtime-orchestrator/pyproject.toml"],         leafPath: ".context-map/library/convex/schema.md", extractor: "markdown" },
    { runId: "run_002", lib: "convex",      topic: "queries",  sourceUri: "https://docs.convex.dev/functions/query-functions",              sourceUrl: "https://docs.convex.dev/functions/query-functions",              ruleCount: 3, appliesTo: ["acme-control-plane/app/page.tsx", "acme-memory-graph/src/context/briefs.py"], leafPath: ".context-map/library/convex/queries.md", extractor: "markdown" },
    { runId: "run_003", lib: "tensorlake", topic: "sandbox",  sourceUri: "https://docs.tensorlake.ai/runtime",                              sourceUrl: "https://docs.tensorlake.ai/runtime",                              ruleCount: 2, appliesTo: ["acme-runtime-orchestrator/src/runtime/sandbox.py", "acme-memory-graph/src/context/gc.py", "acme-memory-graph/src/context/nia_index.py"], leafPath: ".context-map/library/tensorlake/sandbox.md", extractor: "html" },
    { runId: "run_004", lib: "bcryptjs",   topic: "hashing",  sourceUri: "https://github.com/dcodeIO/bcrypt.js",                            ruleCount: 3, appliesTo: ["acme-agent-gateway/src/api/auth.ts"],                                                                                                                                                                                                            leafPath: ".context-map/library/bcryptjs/hashing.md", extractor: "markdown" },
    { runId: "run_005", lib: "ghsa",       topic: "lodash-cve", sourceUri: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9",              sourceUrl: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9",              ruleCount: 1, appliesTo: ["acme-agent-gateway/package.json"],                              leafPath: ".context-map/library/lodash/cve.md", extractor: "ghsa" },
    { runId: "run_006", lib: "openapi",    topic: "payments", sourceUri: "https://api.example.com/payments-openapi.yaml",                   ruleCount: 5, appliesTo: ["acme-agent-gateway/src/api/mcp.ts", "acme-agent-gateway/src/db/schema.ts"],                                                                                                                                                                                       leafPath: ".context-map/library/openapi/payments.md", extractor: "openapi" },
];

// ─── GUARDIAN CYCLES + FINDINGS (mock) ─────────────
const DEMO_CYCLES = [
    { cycleNumber: 47, offsetMin: 8 * 60,  status: "done"    as const, plannedFiles: [{ path: "acme-agent-gateway/src/api/mcp.ts", reason: "stale" }, { path: "acme-agent-gateway/src/api/auth.ts", reason: "never scanned" }], summary: "2 findings detected, 1 critical" },
    { cycleNumber: 48, offsetMin: 6 * 60,  status: "done"    as const, plannedFiles: [{ path: "acme-connectors/src/github/webhooks.ts", reason: "recent diff" }],                                              summary: "1 finding detected" },
    { cycleNumber: 49, offsetMin: 4 * 60,  status: "done"    as const, plannedFiles: [{ path: "acme-runtime-orchestrator/src/runtime/sandbox.py", reason: "low clean-streak" }, { path: "acme-agent-gateway/package.json", reason: "ghsa hit" }], summary: "2 findings · npm audit caught lodash CVE" },
    { cycleNumber: 50, offsetMin: 2 * 60,  status: "done"    as const, plannedFiles: [{ path: "acme-control-plane/app/page.tsx", reason: "useQuery drift" }],                                  summary: "1 finding detected" },
    { cycleNumber: 51, offsetMin: 30,      status: "running" as const, plannedFiles: [{ path: "acme-agent-gateway/src/db/schema.ts", reason: "shared module" }],                                              summary: undefined },
];

const DEMO_FINDINGS = [
    { fingerprint: "f_a01", cycleDetected: 47, status: "resolved"     as const, severity: "critical", category: "security",     path: "acme-agent-gateway/src/api/mcp.ts",      codeCite: { line: 42, excerpt: 'const API = "https://staging.acme.eng";' }, constraintCite: { mdFile: ".context-map/library/openapi/payments.md", line: 18, text: "All backend URLs MUST be read from process.env.INTERNAL_API_BASE." }, reasoning: "Hardcoded URL bypasses the env-based gate; same pattern NM note n_92ac documents.",                              suggestedFixDirection: "Replace literal with process.env.INTERNAL_API_BASE",                       githubIssueNumber: 142, sharpenIterations: 0, usedContext: { noteIds: ["n_92ac", "n_91d5"], docsLeafIds: [".context-map/library/openapi/payments.md"] } },
    { fingerprint: "f_b02", cycleDetected: 47, status: "pr_open"      as const, severity: "high",     category: "security",     path: "acme-agent-gateway/src/api/auth.ts",        codeCite: { line: 88, excerpt: "const decoded = jwt.decode(token);" },     constraintCite: { mdFile: ".context-map/library/express/auth.md",  line: 24, text: "JWT tokens MUST be validated with verify(), not decode()." },              reasoning: "decode() skips signature + expiry check. NM note n_4f1d documents the v2 regression.",                       suggestedFixDirection: "Use verifyJWT() helper from lib/auth",                                       githubIssueNumber: 143, sharpenIterations: 0, usedContext: { noteIds: ["n_4f1d"], docsLeafIds: [".context-map/library/express/auth.md", ".context-map/library/bcryptjs/hashing.md"] } },
    { fingerprint: "f_c03", cycleDetected: 48, status: "devin_running" as const, severity: "high",     category: "intent_drift", path: "acme-connectors/src/github/webhooks.ts",    codeCite: { line: 31, excerpt: "return new Response(\"bad payload\", { status: 500 });" }, constraintCite: { mdFile: ".context-map/library/express/errors.md", line: 12, text: "5xx is reserved for transient infra faults; client errors return 4xx." }, reasoning: "Returning 500 for validation failures triggers Tensorlake retry storms (NM note n_b73e).",                  suggestedFixDirection: "Return 400 on validation failures",                                          githubIssueNumber: 144, sharpenIterations: 0, usedContext: { noteIds: ["n_b73e"], docsLeafIds: [".context-map/library/express/errors.md"] } },
    { fingerprint: "f_d04", cycleDetected: 49, status: "detected"     as const, severity: "high",     category: "security",     path: "acme-agent-gateway/package.json",           codeCite: { line: 14, excerpt: '"lodash": "^4.17.20"' },                       constraintCite: { mdFile: ".context-map/library/lodash/cve.md",       line: 4, text: "lodash <4.17.21 has CVE-2021-23337 (command injection via template)." }, reasoning: "npm audit flagged this; pinned below patched version.",                                                            suggestedFixDirection: "Bump lodash to ^4.17.21",                                                    sharpenIterations: 0, usedContext: { noteIds: [], docsLeafIds: [".context-map/library/lodash/cve.md"] } },
    { fingerprint: "f_e05", cycleDetected: 49, status: "verifying"    as const, severity: "medium",   category: "bug",          path: "acme-runtime-orchestrator/src/runtime/sandbox.py",  codeCite: { line: 17, excerpt: "spawnSandbox({ memory_mb: 16384 });" },        constraintCite: { mdFile: ".context-map/library/tensorlake/sandbox.md", line: 9, text: "Default org budget is 4GB; explicit memory_mb required for higher." }, reasoning: "16GB exceeds budget; NM note n_e6c4 caught this earlier.",                                                       suggestedFixDirection: "Set memory_mb: 4096 unless oncall-approved",                                  githubIssueNumber: 145, sharpenIterations: 1, usedContext: { noteIds: ["n_e6c4", "n_eph_07"], docsLeafIds: [".context-map/library/tensorlake/sandbox.md"] } },
    { fingerprint: "f_f06", cycleDetected: 50, status: "pr_open"      as const, severity: "medium",   category: "intent_drift", path: "acme-control-plane/app/page.tsx", codeCite: { line: 22, excerpt: "const notes = useQuery(api.notes.listActive);" }, constraintCite: { mdFile: ".context-map/library/convex/queries.md", line: 7, text: "useQuery without a selector subscribes to the whole table." },                  reasoning: "Causes full re-render churn on any write; NM note n_2c08 documents this exact symptom.",                       suggestedFixDirection: "Pass a selector to scope reactivity",                                        githubIssueNumber: 146, sharpenIterations: 0, usedContext: { noteIds: ["n_2c08", "n_eph_10"], docsLeafIds: [".context-map/library/convex/queries.md"] } },
];

const DEMO_DEVIN_RUNS = [
    { findingFp: "f_a01", devinRunId: "devin_a1b2c3", iteration: 1, offsetMin: 7 * 60,  prNumber: 211, prUrl: "https://github.com/acme-eng/nm-platform/pull/211", prMergedOffsetMin: 6 * 60, outcome: "merged" },
    { findingFp: "f_b02", devinRunId: "devin_d4e5f6", iteration: 1, offsetMin: 6 * 60,  prNumber: 212, prUrl: "https://github.com/acme-eng/nm-platform/pull/212", prMergedOffsetMin: undefined, outcome: "pr_open" },
    { findingFp: "f_c03", devinRunId: "devin_g7h8i9", iteration: 1, offsetMin: 4 * 60,  prNumber: undefined, prUrl: undefined, prMergedOffsetMin: undefined, outcome: "running" },
    { findingFp: "f_e05", devinRunId: "devin_j0k1l2", iteration: 2, offsetMin: 3 * 60,  prNumber: 213, prUrl: "https://github.com/acme-eng/nm-platform/pull/213", prMergedOffsetMin: undefined, outcome: "verifying" },
    { findingFp: "f_f06", devinRunId: "devin_m3n4o5", iteration: 1, offsetMin: 90,      prNumber: 214, prUrl: "https://github.com/acme-eng/nm-platform/pull/214", prMergedOffsetMin: undefined, outcome: "pr_open" },
];

const DEMO_GUARDIAN_EVENTS = [
    // a few representative events; the dashboard mostly reads cycles/findings/devinRuns
    { offsetMin: 8 * 60 + 5,  level: "info"    as const, message: "cycle 47 started · planning 2 files",                       cycleNumber: 47 },
    { offsetMin: 8 * 60 - 5,  level: "finding" as const, message: "finding f_a01 · acme-agent-gateway/src/api/mcp.ts:42 · critical",            cycleNumber: 47 },
    { offsetMin: 8 * 60 - 8,  level: "action"  as const, message: "spawned devin_a1b2c3 for f_a01",                            cycleNumber: 47 },
    { offsetMin: 6 * 60 + 2,  level: "info"    as const, message: "cycle 48 started",                                          cycleNumber: 48 },
    { offsetMin: 4 * 60 + 1,  level: "info"    as const, message: "cycle 49 started · npm audit ran",                          cycleNumber: 49 },
    { offsetMin: 4 * 60 - 3,  level: "finding" as const, message: "finding f_d04 · package.json:14 · lodash CVE",              cycleNumber: 49 },
    { offsetMin: 30,          level: "info"    as const, message: "cycle 51 in progress · scanning acme-agent-gateway/src/db/schema.ts",          cycleNumber: 51 },
];

// ─── seedAll mutation ────────────────────────────
export const seedAll = mutation({
    args: {},
    handler: async (ctx) => {
        // wipe volatile + identity tables for idempotent re-seed
        for (const t of [
            "users","agents","files","notes","noteFiles","prunedEdges","injections","gcRuns","gcActions",
            "cycles","findings","devinRuns","events","docsIngestRuns","fileScanHistory","libraries",
        ]) {
            await clearTable(ctx, t);
        }

        // users
        for (const u of USERS) {
            await ctx.db.insert("users", {
                userId: u.userId, name: u.name, handle: u.handle, email: u.email, role: u.role,
                initial: u.initial, color: u.color,
                joinedAt: isoAt(u.joinedDaysAgo * 24 * 60 * 60 * 1000),
            });
        }
        // agents
        for (const a of AGENTS) {
            await ctx.db.insert("agents", { agentId: a.agentId, userId: a.userId, vendor: a.vendor });
        }
        // files
        const nowIso = isoAt(0);
        for (const path of FILES) {
            await ctx.db.insert("files", {
                path, type: FILE_TYPE_OF(path),
                firstSeen: isoAt(30 * 24 * 60 * 60 * 1000),
                lastSeen: nowIso,
            });
        }

        // active notes
        const computeRetained = (importance: number, lastInjectMin: number, injectCount: number, fbScore: number) => {
            const lastInjectDays = lastInjectMin / 1440;
            const ageScore = 1 - Math.min(1, lastInjectDays / 30);
            const freqScore = Math.min(1, injectCount / 20);
            return 0.30 * ageScore + 0.25 * freqScore + 0.20 * fbScore + 0.25 * importance;
        };
        const rand = mulberry32(42);

        for (let i = 0; i < ACTIVE_NOTES.length; i++) {
            const n = ACTIVE_NOTES[i];
            const lastInjectMin = Math.max(15, Math.floor(n.ageMin * (0.05 + rand() * 0.4)));
            const fbTotal = Math.max(1, Math.floor(n.injectCount * 0.55));
            const fbUseful = Math.floor(fbTotal * (0.7 + rand() * 0.28));
            const fbScore = fbUseful / fbTotal;
            await ctx.db.insert("notes", {
                noteId: n.noteId,
                symptom: n.symptom, rootCause: n.rootCause, correction: n.correction,
                importance: n.importance, injectCount: n.injectCount,
                lastInjectedAt: isoAt(lastInjectMin * 60_000),
                createdAt: isoAt(n.ageMin * 60_000),
                createdBy: AGENTS[i % AGENTS.length].agentId,
                retainedScore: computeRetained(n.importance, lastInjectMin, n.injectCount, fbScore),
                feedbackUseful: fbUseful, feedbackTotal: fbTotal, feedbackScore: fbScore,
            });
            for (const e of n.edges) {
                await ctx.db.insert("noteFiles", { noteId: n.noteId, path: e.path, weight: e.weight });
            }
        }

        // history notes (legacy + ephemeral)
        const HISTORY = LEGACY_HISTORY.concat(EPHEMERAL_HISTORY);
        for (let i = 0; i < HISTORY.length; i++) {
            const n = HISTORY[i];
            const lifecycleAtIso = isoAt(n.lifecycleAtMin * 60_000);
            const lastInjectMin = Math.floor((n.ageMin + n.lifecycleAtMin) / 2);
            const fbTotal = Math.max(1, Math.floor(n.injectCount * 0.5));
            const fbUseful = Math.floor(fbTotal * 0.4);
            const fbScore = fbUseful / fbTotal;
            await ctx.db.insert("notes", {
                noteId: n.noteId,
                symptom: n.symptom, rootCause: n.rootCause, correction: n.correction,
                importance: n.importance, injectCount: n.injectCount,
                lastInjectedAt: isoAt(lastInjectMin * 60_000),
                createdAt: isoAt(n.ageMin * 60_000),
                createdBy: AGENTS[(i + 2) % AGENTS.length].agentId,
                invalidatedAt: lifecycleAtIso,
                invalidatedReason: n.invalidatedReason,
                mergedInto: n.lifecycleType === "merge" ? n.lifecycleTarget : undefined,
                retainedScore: 0.10 + (i % 5) * 0.02,
                feedbackUseful: fbUseful, feedbackTotal: fbTotal, feedbackScore: fbScore,
            });
            for (const e of n.edges) {
                await ctx.db.insert("noteFiles", { noteId: n.noteId, path: e.path, weight: e.weight });
            }
        }

        // pruned edges
        for (const p of PRUNED_EDGES) {
            await ctx.db.insert("prunedEdges", {
                noteId: p.noteId, path: p.path, weight: p.weight,
                prunedAt: isoAt(p.prunedOffsetMin * 60_000),
                reason: p.reason,
            });
        }

        // injections — sample per active note, stable PRNG
        const injRand = mulberry32(101);
        let injCount = 0;
        for (const n of ACTIVE_NOTES) {
            for (let k = 0; k < n.injectCount; k++) {
                const eligible = AGENTS.filter(ag => ag.agentId !== AGENTS[0].agentId);  // not strictly accurate but stable
                const agent = eligible[Math.floor(injRand() * eligible.length)];
                const file = n.edges[Math.floor(injRand() * n.edges.length)].path;
                const offsetMin = Math.floor(15 + injRand() * Math.max(60, n.ageMin - 30));
                const accepted = injRand() > 0.13;
                await ctx.db.insert("injections", {
                    ts: isoAt(offsetMin * 60_000),
                    path: file,
                    toolName: agent.vendor,
                    noteId: n.noteId,
                    accepted,
                    reason: accepted ? undefined : REJECT_REASONS[Math.floor(injRand() * REJECT_REASONS.length)],
                    agentId: agent.agentId,
                    bytes: 220 + Math.floor(injRand() * 280),
                    latencyMs: 8 + Math.floor(injRand() * 32),
                    guardianScore: 0.45 + injRand() * 0.5,
                    usedByAgent: accepted && injRand() > 0.18,
                });
                injCount++;
            }
        }

        // gc runs + actions: bundle EPHEMERAL/LEGACY lifecycles + PRUNED_EDGES into runs
        type ActionPlan = {
            offsetMin: number;
            type: "invalidate" | "merge" | "prune";
            payload: any;
        };
        const plans: ActionPlan[] = [];
        for (const n of LEGACY_HISTORY.concat(EPHEMERAL_HISTORY)) {
            if (n.lifecycleAtMin < 60 || n.lifecycleAtMin > 14 * 1440) continue;
            if (n.lifecycleType === "invalidate") {
                plans.push({
                    offsetMin: n.lifecycleAtMin, type: "invalidate",
                    payload: { targetNote: n.noteId, reason: n.invalidatedReason ?? "below threshold",
                        metricsJson: JSON.stringify({ retained: 0.12, idle_days: Math.floor((n.ageMin - n.lifecycleAtMin) / 1440), inject_count: n.injectCount }) },
                });
            } else {
                plans.push({
                    offsetMin: n.lifecycleAtMin, type: "merge",
                    payload: { sourceNote: n.noteId, targetNote: n.lifecycleTarget!, reason: n.invalidatedReason ?? "similarity above threshold",
                        metricsJson: JSON.stringify({ similarity: 0.82, edge_overlap: 0.65 }) },
                });
            }
        }
        for (const p of PRUNED_EDGES) {
            plans.push({
                offsetMin: p.prunedOffsetMin, type: "prune",
                payload: { targetNote: p.noteId, targetFile: p.path, reason: p.reason,
                    metricsJson: JSON.stringify({ weight: p.weight, anchored: 0 }) },
            });
        }
        plans.sort((a, b) => b.offsetMin - a.offsetMin);

        // group within ~45 min into runs
        const runs: { offsetMin: number; actions: ActionPlan[] }[] = [];
        let cur: { offsetMin: number; actions: ActionPlan[] } | null = null;
        for (const p of plans) {
            if (!cur || Math.abs(cur.offsetMin - p.offsetMin) > 45) {
                if (cur) runs.push(cur);
                cur = { offsetMin: p.offsetMin, actions: [] };
            }
            cur.actions.push(p);
        }
        if (cur) runs.push(cur);
        // a few no-op runs interspersed for realism
        for (const off of [12*1440, 10*1440, 7*1440, 4*1440, 12*60]) {
            if (!runs.some(r => Math.abs(r.offsetMin - off) < 90)) {
                runs.push({ offsetMin: off, actions: [] });
            }
        }
        runs.sort((a, b) => a.offsetMin - b.offsetMin);

        let active = ACTIVE_NOTES.length + EPHEMERAL_HISTORY.length;
        let invalidated = LEGACY_HISTORY.length;
        let edges = ACTIVE_NOTES.reduce((s, n) => s + n.edges.length, 0) + PRUNED_EDGES.length;

        const gcRand = mulberry32(7);
        for (let i = 0; i < runs.length; i++) {
            const r = runs[i];
            const runId = "gc_" + (30 + i);
            const ts = isoAt(r.offsetMin * 60_000);
            for (const a of r.actions) {
                if (a.type === "invalidate") { active--; invalidated++; }
                if (a.type === "merge")      { active--; invalidated++; }
                if (a.type === "prune")      { edges--; }
            }
            await ctx.db.insert("gcRuns", {
                runId, ts,
                durationMs: 800 + Math.floor(gcRand() * 1800),
                activeAfter: active, invalidatedAfter: invalidated, edgesAfter: edges,
            });
            if (r.actions.length === 0) {
                await ctx.db.insert("gcActions", {
                    ts, action: "skip", runId,
                    reason: "all retained scores above threshold; no action",
                });
            } else {
                for (const a of r.actions) {
                    const p = a.payload;
                    await ctx.db.insert("gcActions", {
                        ts, action: a.type, runId,
                        noteId: p.targetNote ?? p.sourceNote,
                        sourceNote: p.sourceNote,
                        targetNote: p.targetNote,
                        targetFile: p.targetFile,
                        reason: p.reason,
                        metricsJson: p.metricsJson,
                    });
                }
            }
        }

        // ─── Guardian + docs-ingest seed ─────────────────────────
        for (const l of DEMO_DOCS_LEAVES) {
            await ctx.db.insert("docsIngestRuns", l);
        }
        for (const c of DEMO_CYCLES) {
            await ctx.db.insert("cycles", {
                cycleNumber: c.cycleNumber,
                startedAt: NOW() - c.offsetMin * 60_000,
                finishedAt: c.status === "running" ? undefined : NOW() - (c.offsetMin - 5) * 60_000,
                status: c.status,
                plannedFiles: c.plannedFiles,
                summary: c.summary,
            });
        }
        // findings: insert and capture _id for devin run linkage
        const findingIdByFp: Record<string, any> = {};
        for (const f of DEMO_FINDINGS) {
            const id = await ctx.db.insert("findings", {
                fingerprint: f.fingerprint,
                cycleDetected: f.cycleDetected,
                status: f.status,
                severity: f.severity,
                category: f.category,
                path: f.path,
                codeCite: f.codeCite,
                constraintCite: f.constraintCite,
                reasoning: f.reasoning,
                suggestedFixDirection: f.suggestedFixDirection,
                githubIssueNumber: (f as any).githubIssueNumber,
                sharpenIterations: f.sharpenIterations,
                usedContext: f.usedContext,
            });
            findingIdByFp[f.fingerprint] = id;
        }
        for (const d of DEMO_DEVIN_RUNS) {
            const findingId = findingIdByFp[d.findingFp];
            if (!findingId) continue;
            await ctx.db.insert("devinRuns", {
                findingId,
                devinRunId: d.devinRunId,
                promptUsed: "(demo seed)",
                spawnedAt: NOW() - d.offsetMin * 60_000,
                iteration: d.iteration,
                prNumber: d.prNumber,
                prUrl: d.prUrl,
                prMergedAt: d.prMergedOffsetMin !== undefined ? NOW() - d.prMergedOffsetMin * 60_000 : undefined,
                outcome: d.outcome,
            });
        }
        for (const e of DEMO_GUARDIAN_EVENTS) {
            await ctx.db.insert("events", {
                cycleNumber: e.cycleNumber,
                timestamp: NOW() - e.offsetMin * 60_000,
                level: e.level,
                message: e.message,
            });
        }

        // ─── External library registry ────────────────────────
        for (const lib of DEMO_LIBRARIES) {
            await ctx.db.insert("libraries", {
                name: lib.name,
                detectedFrom: lib.detectedFrom,
                source: lib.source,
                sourceKind: lib.sourceKind,
                mcpServer: lib.mcpServer,
                version: lib.version,
                lastIngestedAt: isoAt(lib.lastIngestedOffsetMin * 60_000),
                freshness: lib.freshness,
                ingestRuns: lib.ingestRuns.map(r => ({
                    ts: isoAt(r.offsetMin * 60_000),
                    summary: r.summary,
                    changes: r.changes,
                })),
            });
        }

        return {
            users: USERS.length, agents: AGENTS.length, files: FILES.length,
            activeNotes: ACTIVE_NOTES.length,
            historyNotes: LEGACY_HISTORY.length + EPHEMERAL_HISTORY.length,
            prunedEdges: PRUNED_EDGES.length,
            injections: injCount,
            gcRuns: runs.length,
            gcActions: runs.reduce((s, r) => s + Math.max(1, r.actions.length), 0),
            // Guardian + docs-ingest
            cycles: DEMO_CYCLES.length,
            findings: DEMO_FINDINGS.length,
            devinRuns: DEMO_DEVIN_RUNS.length,
            guardianEvents: DEMO_GUARDIAN_EVENTS.length,
            docsLeaves: DEMO_DOCS_LEAVES.length,
            // External library registry
            libraries: DEMO_LIBRARIES.length,
        };
    },
});

// Context Cloud — unified Convex schema.
//
// Three complementary halves share this deployment:
//
// 1. Guardian + docs-ingest tables (cycles, fileScanHistory, findings,
//    devinRuns, events, docsIngestRuns, docsIngestLeaves) — driven by
//    the TS agent in `agent/` and the docs pipeline in `docs-ingest/`.
//
// 2. NM memory-graph tables (sessions, notes, files, noteFiles, hurdles,
//    injections, gcActions) — mirror of the v2 SQLite product/audit tables
//    populated by the Python capture/extract layer (`nm_*.py`). The SQLite
//    trace tier (messages / content_blocks / tool_calls / file_touches)
//    stays local because it is high-volume + latency-sensitive. Synced
//    via `nm_convex.py` HTTP actions in `convex/http.ts`.
//
// 3. Dashboard extensions (users, agents, prunedEdges, gcRuns + optional
//    rich fields on notes/injections/gcActions) — power the polished mock
//    UI (mock/index.html). All additions are non-breaking; Python sync
//    keeps working unchanged.
//
// usedContext links Guardian findings back to the NM notes + docs leaves
// that informed them — that's how the three halves talk.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // -------- GUARDIAN CYCLE --------
  cycles: defineTable({
    cycleNumber: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    // current cycle phase per the spec state machine:
    //   WAKE → PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → RECONCILE → SLEEP
    currentPhase: v.optional(v.string()),
    plannedFiles: v.array(
      v.object({
        path: v.string(),
        reason: v.string(),
        // 'priority' = rule-based queue · 'judgment' = LLM judgment-call pick
        kind: v.optional(v.string()),
      }),
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
    // provenance: which NM notes + docs leaves informed this finding.
    // Populated by analyzer when nmClient + docsLeafClient inject context.
    usedContext: v.optional(v.object({
      noteIds: v.array(v.string()),       // matches notes.noteId
      docsLeafIds: v.array(v.string()),   // matches docsIngestLeaves leafPath
    })),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_status", ["status"])
    .index("by_cycle_detected", ["cycleDetected"]),

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
  })
    .index("by_finding", ["findingId"])
    .index("by_devin_run_id", ["devinRunId"]),

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
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_cycle_timestamp", ["cycleNumber", "timestamp"]),

  // -------- DOCS INGEST --------
  // One row per emitted leaf (hari's pattern). `runId` groups leaves
  // emitted by the same ingestion run.
  docsIngestRuns: defineTable({
    runId: v.string(),
    lib: v.string(),
    topic: v.string(),
    sourceUri: v.string(),
    sourceUrl: v.optional(v.string()),
    ruleCount: v.number(),
    appliesTo: v.array(v.string()),
    leafPath: v.string(),
    extractor: v.optional(v.string()),
  }).index("by_run_id", ["runId"]).index("by_leaf_path", ["leafPath"]),

  // External libraries the codebase depends on. The Sources tab is the
  // dashboard for this table — it shows which docs surface each library
  // is ingested from, how fresh the cache is, and lets the operator
  // trigger a refresh through whichever ingestion mechanism applies
  // (MCP server, direct HTTP, GHSA RSS, OpenAPI spec, GitHub Pages).
  libraries: defineTable({
    name: v.string(),                          // 'express', 'convex', 'lodash'
    detectedFrom: v.array(v.string()),         // file paths where the library is imported / declared
    source: v.string(),                        // canonical docs URL
    sourceKind: v.string(),                    // 'mcp' | 'url' | 'github' | 'ghsa' | 'openapi'
    mcpServer: v.optional(v.string()),         // MCP endpoint id (when sourceKind === 'mcp')
    version: v.optional(v.string()),
    lastIngestedAt: v.string(),                // ISO timestamp
    freshness: v.string(),                     // 'fresh' | 'stale' | 'cve' | 'refreshing'
    ingestRuns: v.array(v.object({             // recent activity, newest-first
      ts: v.string(),
      summary: v.string(),                     // human readable
      changes: v.optional(v.number()),         // # leaves added/updated
    })),
  }).index("by_name", ["name"]),

  // -------- ORG / IDENTITY (dashboard) --------
  users: defineTable({
    userId: v.string(),                 // 'u_alfred' style
    name: v.string(),
    handle: v.string(),
    email: v.string(),
    role: v.string(),
    initial: v.string(),
    color: v.string(),                  // hex string
    joinedAt: v.string(),
  }).index("by_user_id", ["userId"]),

  agents: defineTable({
    agentId: v.string(),                // 'a_codex_alfred' style
    userId: v.string(),
    vendor: v.string(),                 // 'Codex' | 'Claude Code' | 'Cursor'
    label: v.optional(v.string()),
  }).index("by_agent_id", ["agentId"]).index("by_user", ["userId"]),

  // -------- NM TRACE (lite mirror; full transcript stays in SQLite) --------
  sessions: defineTable({
    sessionId: v.string(),
    agentVendor: v.optional(v.string()),
    cwd: v.optional(v.string()),
    projectRoot: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    lastSeenAt: v.optional(v.string()),
    messageCount: v.optional(v.number()),
    // Note Manager remote-poller bookkeeping. Set after a hurdle-detection
    // pass so the next pass only re-scans sessions with new events.
    lastExtractedAt: v.optional(v.string()),
    lastExtractedEventTs: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_last_seen", ["lastSeenAt"]),

  // -------- AGENT EVENTS (hosted MCP) --------
  // Streamed by mock/api/mcp/[installation_id].py on every record_event call
  // from a remote agent. Holds the transcript pieces the Note Manager needs
  // to detect hurdles for sessions that never touch local nm.db.
  agentEvents: defineTable({
    ts: v.string(),
    sessionId: v.string(),
    installationId: v.optional(v.string()),
    kind: v.string(), // user_msg | agent_msg | tool_call | tool_error | correction
    text: v.optional(v.string()),
    toolName: v.optional(v.string()),
    filePath: v.optional(v.string()),
    isError: v.optional(v.boolean()),
    payload: v.optional(v.any()),
  })
    .index("by_session_ts", ["sessionId", "ts"])
    .index("by_ts", ["ts"]),

  // -------- NM NOTE GRAPH --------
  notes: defineTable({
    noteId: v.string(),                 // matches notes.id in SQLite (uuid string)
    symptom: v.string(),
    rootCause: v.string(),
    correction: v.optional(v.string()),
    importance: v.number(),
    injectCount: v.number(),
    lastInjectedAt: v.optional(v.string()),
    invalidatedAt: v.optional(v.string()),
    invalidatedReason: v.optional(v.string()),
    mergedInto: v.optional(v.string()),
    createdAt: v.string(),
    createdBy: v.optional(v.string()),                 // agent id
    createdFromSession: v.optional(v.string()),
    createdFromHurdle: v.optional(v.number()),
    // metric breakdown for the GC view at-risk panel
    retainedScore: v.optional(v.number()),
    feedbackUseful: v.optional(v.number()),
    feedbackTotal: v.optional(v.number()),
    feedbackScore: v.optional(v.number()),
    // Hyperspell supporting context. NM notes are primary provenance from
    // coding friction — these refs only enrich, never replace. See
    // PRD > "design rule: NM notes are primary; company-brain only enriches".
    hyperspellRefs: v.optional(v.array(v.object({
      source: v.string(),     // 'slack' | 'notion' | 'gmail' | 'github' | 'drive'
      title: v.string(),
      url: v.string(),
      snippet: v.optional(v.string()),
      ts: v.optional(v.string()),
      author: v.optional(v.string()),
    }))),
    hyperspellEnrichedAt: v.optional(v.string()),
  })
    .index("by_note_id", ["noteId"])
    .index("by_active_importance", ["invalidatedAt", "importance"])
    .index("by_created_from_session", ["createdFromSession"]),

  files: defineTable({
    path: v.string(),                   // canonical, project-relative
    type: v.optional(v.string()),
    firstSeen: v.string(),
    lastSeen: v.string(),
  }).index("by_path", ["path"]),

  noteFiles: defineTable({
    noteId: v.string(),
    path: v.string(),
    weight: v.number(),
  })
    .index("by_note", ["noteId"])
    .index("by_path", ["path"])
    .index("by_note_path", ["noteId", "path"]),

  // historical edges that were pruned by GC — visualized on the Replay timeline
  prunedEdges: defineTable({
    noteId: v.string(),
    path: v.string(),
    weight: v.number(),
    prunedAt: v.string(),
    reason: v.optional(v.string()),
  }).index("by_note", ["noteId"]).index("by_pruned_at", ["prunedAt"]),

  // -------- NM LIFECYCLE / AUDIT --------
  hurdles: defineTable({
    hurdleId: v.number(),               // matches SQLite hurdles.id
    sessionId: v.optional(v.string()),
    score: v.number(),
    signalsJson: v.optional(v.string()),
    resolved: v.boolean(),
    resolvedNoteId: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_hurdle_id", ["hurdleId"])
    .index("by_session", ["sessionId"])
    .index("by_created", ["createdAt"]),

  injections: defineTable({
    ts: v.string(),
    sessionId: v.optional(v.string()),
    path: v.optional(v.string()),
    toolName: v.optional(v.string()),
    noteId: v.optional(v.string()),
    accepted: v.boolean(),
    reason: v.optional(v.string()),
    // dashboard-rich fields (all optional; Python sync ignores them)
    agentId: v.optional(v.string()),
    bytes: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    guardianScore: v.optional(v.number()),
    usedByAgent: v.optional(v.boolean()),
  })
    .index("by_ts", ["ts"])
    .index("by_note", ["noteId"])
    .index("by_path_ts", ["path", "ts"])
    .index("by_agent", ["agentId"]),

  // GC sweeps — multi-action runs grouped together so the UI can show
  // "BOOM, 3 actions in this sweep" instead of a flat list.
  gcRuns: defineTable({
    runId: v.string(),
    ts: v.string(),
    durationMs: v.optional(v.number()),
    activeAfter: v.optional(v.number()),
    invalidatedAfter: v.optional(v.number()),
    edgesAfter: v.optional(v.number()),
  }).index("by_run_id", ["runId"]).index("by_ts", ["ts"]),

  gcActions: defineTable({
    ts: v.string(),
    action: v.string(),                 // 'prune' | 'merge' | 'invalidate' | 'decay' | 'restore' | 'skip'
    noteId: v.optional(v.string()),
    details: v.optional(v.string()),
    // structured fields used by the GC + Replay views
    runId: v.optional(v.string()),
    targetNote: v.optional(v.string()),
    targetFile: v.optional(v.string()),
    sourceNote: v.optional(v.string()),
    reason: v.optional(v.string()),
    metricsJson: v.optional(v.string()),
  })
    .index("by_ts", ["ts"])
    .index("by_action", ["action"])
    .index("by_run", ["runId"]),
});

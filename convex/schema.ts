// Context Cloud — unified Convex schema.
//
// Two complementary halves share this deployment:
//
// 1. Guardian + docs-ingest tables (cycles, fileScanHistory, findings,
//    devinRuns, events, docsIngestRuns) — driven by the TS agent in `agent/`
//    and the docs pipeline in `docs-ingest/`.
//
// 2. NM memory-graph tables (sessions, notes, files, noteFiles, hurdles,
//    injections, gcActions) — mirror of the v2 SQLite product/audit tables
//    populated by the Python capture/extract layer (`nm_*.py`). The SQLite
//    trace tier (messages / content_blocks / tool_calls / file_touches)
//    stays local because it is high-volume + latency-sensitive. Synced
//    via `nm_convex.py` HTTP actions in `convex/http.ts`.

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
  }).index("by_run", ["runId"]),

  // -------- NM TRACE (lite mirror; full transcript stays in SQLite) --------
  sessions: defineTable({
    sessionId: v.string(),
    agentVendor: v.optional(v.string()),
    cwd: v.optional(v.string()),
    projectRoot: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    lastSeenAt: v.optional(v.string()),
    messageCount: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_last_seen", ["lastSeenAt"]),

  // -------- NM NOTE GRAPH --------
  notes: defineTable({
    noteId: v.string(), // matches notes.id in SQLite (uuid string)
    symptom: v.string(),
    rootCause: v.string(),
    correction: v.optional(v.string()),
    importance: v.number(),
    injectCount: v.number(),
    lastInjectedAt: v.optional(v.string()),
    invalidatedAt: v.optional(v.string()),
    createdAt: v.string(),
    createdFromSession: v.optional(v.string()),
    createdFromHurdle: v.optional(v.number()),
  })
    .index("by_note_id", ["noteId"])
    .index("by_active_importance", ["invalidatedAt", "importance"]),

  files: defineTable({
    path: v.string(), // canonical, project-relative
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
    .index("by_path", ["path"]),

  // -------- NM LIFECYCLE / AUDIT --------
  hurdles: defineTable({
    hurdleId: v.number(), // matches SQLite hurdles.id
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
  })
    .index("by_ts", ["ts"])
    .index("by_note", ["noteId"])
    .index("by_path_ts", ["path", "ts"]),

  gcActions: defineTable({
    ts: v.string(),
    action: v.string(), // 'prune' | 'merge' | 'decay' | 'restore'
    noteId: v.optional(v.string()),
    details: v.optional(v.string()),
  })
    .index("by_ts", ["ts"])
    .index("by_action", ["action"]),
});

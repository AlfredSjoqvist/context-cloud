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
});

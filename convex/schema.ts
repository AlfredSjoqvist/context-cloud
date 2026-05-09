// NM product graph in Convex.
//
// Mirror of the v2 SQLite product/audit tables; the SQLite trace layer
// (messages / content_blocks / tool_calls / file_touches) stays local because
// it is high-volume + latency-sensitive.
//
// Authoritative source for: notes, file_note_edges, files, hurdles,
// injections, gc_actions, sessions (lite mirror).
//
// Synced from Python via `nm_convex.py` HTTP actions in `convex/http.ts`.
//
// NOTE: dashboard agent extended this with `users`, `agents`, `prunedEdges`,
// `gcRuns` tables + optional fields on `notes`/`injections`/`gcActions` so the
// polished mock UI (mock/index.html) can be powered by Convex without losing
// any of its rich attribution. All additions are non-breaking — Python sync
// keeps working unchanged.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    // -------- TRACE (lite mirror; full transcript stays in SQLite) --------
    sessions: defineTable({
        sessionId: v.string(),
        agentVendor: v.optional(v.string()),
        cwd: v.optional(v.string()),
        projectRoot: v.optional(v.string()),
        startedAt: v.optional(v.string()),
        lastSeenAt: v.optional(v.string()),
        messageCount: v.optional(v.number()),
    }).index("by_session", ["sessionId"]).index("by_last_seen", ["lastSeenAt"]),

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

    // -------- NOTE GRAPH --------
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
        createdBy: v.optional(v.string()),               // agent id
        createdFromSession: v.optional(v.string()),
        createdFromHurdle: v.optional(v.number()),
        // metric breakdown for the GC view at-risk panel
        retainedScore: v.optional(v.number()),
        feedbackUseful: v.optional(v.number()),
        feedbackTotal: v.optional(v.number()),
        feedbackScore: v.optional(v.number()),
    }).index("by_note_id", ["noteId"])
      .index("by_active_importance", ["invalidatedAt", "importance"]),

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
    }).index("by_note", ["noteId"])
      .index("by_path", ["path"]),

    // historical edges that were pruned by GC — visualized on the Replay timeline
    prunedEdges: defineTable({
        noteId: v.string(),
        path: v.string(),
        weight: v.number(),
        prunedAt: v.string(),
        reason: v.optional(v.string()),
    }).index("by_note", ["noteId"]).index("by_pruned_at", ["prunedAt"]),

    // -------- LIFECYCLE / AUDIT --------
    hurdles: defineTable({
        hurdleId: v.number(),               // matches SQLite hurdles.id
        sessionId: v.optional(v.string()),
        score: v.number(),
        signalsJson: v.optional(v.string()),
        resolved: v.boolean(),
        resolvedNoteId: v.optional(v.string()),
        createdAt: v.string(),
    }).index("by_hurdle_id", ["hurdleId"])
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
    }).index("by_ts", ["ts"])
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
    }).index("by_ts", ["ts"])
      .index("by_action", ["action"])
      .index("by_run", ["runId"]),
});

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
        createdAt: v.string(),
        createdFromSession: v.optional(v.string()),
        createdFromHurdle: v.optional(v.number()),
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
    }).index("by_ts", ["ts"])
      .index("by_note", ["noteId"])
      .index("by_path_ts", ["path", "ts"]),

    gcActions: defineTable({
        ts: v.string(),
        action: v.string(),                 // 'prune' | 'merge' | 'decay' | 'restore'
        noteId: v.optional(v.string()),
        details: v.optional(v.string()),
    }).index("by_ts", ["ts"])
      .index("by_action", ["action"]),
});

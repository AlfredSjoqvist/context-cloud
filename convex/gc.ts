import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Public: agent calls this to record a GC pass at the run level.
// Idempotent on `runId` — if the agent restarts and re-submits the
// summary for the same run, we patch instead of duplicating the row.
//
// Each per-note action GC took during this run is recorded separately
// via /sync/gc → gc.recordWithMaybeInvalidate.
export const recordRun = mutation({
    args: {
        runId: v.string(),
        ts: v.string(),
        durationMs: v.optional(v.number()),
        activeAfter: v.optional(v.number()),
        invalidatedAfter: v.optional(v.number()),
        edgesAfter: v.optional(v.number()),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("gcRuns")
            .withIndex("by_run_id", (q) => q.eq("runId", a.runId))
            .first();
        const fields = {
            runId: a.runId,
            ts: a.ts,
            durationMs: a.durationMs,
            activeAfter: a.activeAfter,
            invalidatedAfter: a.invalidatedAfter,
            edgesAfter: a.edgesAfter,
        };
        if (existing) {
            await ctx.db.patch(existing._id, fields);
            return existing._id;
        }
        return await ctx.db.insert("gcRuns", fields);
    },
});

// DEPRECATED: use `recordWithMaybeInvalidate` instead. This raw-insert
// version doesn't side-effect note.invalidatedAt, doesn't populate the
// gcActions structured fields (runId/targetNote/targetFile/sourceNote/
// reason), and doesn't record per-edge prunes into prunedEdges. Kept
// in place because no callers should reference it directly anymore —
// /sync/gc routes through recordWithMaybeInvalidate — but leaving the
// symbol so any forgotten internal caller in agent/ doesn't break.
export const recordAction = internalMutation({
    args: {
        ts: v.string(),
        action: v.string(),
        noteId: v.optional(v.string()),
        details: v.optional(v.string()),
    },
    handler: async (ctx, a) => ctx.db.insert("gcActions", a),
});

// Atomic gcAction record + (optional) note invalidation + (optional)
// prunedEdges record. Replaces /sync/gc's two-mutation handler.
//
// When action='prune' AND noteId is set:
//   - the note's invalidatedAt is stamped (terminal action for the note)
// When action='prune' AND noteId + targetFile both set:
//   - additionally inserts a prunedEdges row so the Replay timeline can
//     visualize WHICH edge was pruned (note → file) for that GC action
// When action='invalidate' AND noteId set:
//   - same as 'prune' but no prunedEdges row (the whole note is gone,
//     not just one of its edges)
export const recordWithMaybeInvalidate = internalMutation({
    args: {
        ts: v.string(),
        action: v.string(),
        noteId: v.optional(v.string()),
        details: v.optional(v.string()),
        // Structured fields used by the GC + Replay dashboard views.
        runId: v.optional(v.string()),
        targetNote: v.optional(v.string()),
        targetFile: v.optional(v.string()),
        sourceNote: v.optional(v.string()),
        reason: v.optional(v.string()),
        // Edge-level prune: weight of the edge being removed (so the
        // Replay timeline can render a fading edge animation).
        edgeWeight: v.optional(v.number()),
    },
    handler: async (ctx, a) => {
        const id = await ctx.db.insert("gcActions", {
            ts: a.ts,
            action: a.action,
            noteId: a.noteId,
            details: a.details,
            runId: a.runId,
            targetNote: a.targetNote,
            targetFile: a.targetFile,
            sourceNote: a.sourceNote,
            reason: a.reason,
        });
        // 'prune' and 'invalidate' both terminate a note's active life.
        if ((a.action === "prune" || a.action === "invalidate") && a.noteId) {
            const n = await ctx.db
                .query("notes")
                .withIndex("by_note_id", (q) => q.eq("noteId", a.noteId!))
                .first();
            if (n) {
                await ctx.db.patch(n._id, { invalidatedAt: a.ts });
            }
        }
        // 'restore' un-invalidates a note that GC previously took out.
        // Without this branch a restored note would stay missing from
        // dashboard's listActive forever.
        if (a.action === "restore" && a.noteId) {
            const n = await ctx.db
                .query("notes")
                .withIndex("by_note_id", (q) => q.eq("noteId", a.noteId!))
                .first();
            if (n) {
                await ctx.db.patch(n._id, { invalidatedAt: undefined });
            }
        }
        // Edge-level prune: also record the lost edge so Replay can show it.
        if (a.action === "prune" && a.noteId && a.targetFile) {
            await ctx.db.insert("prunedEdges", {
                noteId: a.noteId,
                path: a.targetFile,
                weight: a.edgeWeight ?? 0,
                prunedAt: a.ts,
                reason: a.reason ?? a.details,
            });
        }
        return id;
    },
});

export const recent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        return await ctx.db.query("gcActions").order("desc").take(limit ?? 50);
    },
});

export const recentStats = query({
    args: { sinceMinutes: v.optional(v.number()) },
    handler: async (ctx, { sinceMinutes }) => {
        const cutoff = new Date(
            Date.now() - (sinceMinutes ?? 15) * 60 * 1000
        ).toISOString();
        const rows = await ctx.db
            .query("gcActions")
            .withIndex("by_ts", (q) => q.gte("ts", cutoff))
            .collect();
        const counts: Record<string, number> = {};
        for (const r of rows) counts[r.action] = (counts[r.action] ?? 0) + 1;
        return { sinceMinutes: sinceMinutes ?? 15, total: rows.length, byAction: counts };
    },
});

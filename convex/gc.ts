import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const recordAction = internalMutation({
    args: {
        ts: v.string(),
        action: v.string(),
        noteId: v.optional(v.string()),
        details: v.optional(v.string()),
    },
    handler: async (ctx, a) => ctx.db.insert("gcActions", a),
});

// Atomic gcAction record + (optional) note invalidation.
// Replaces /sync/gc's two-mutation handler so a prune that records but
// never invalidates leaves the note "still active" in the dashboard
// despite GC having decided otherwise.
export const recordWithMaybeInvalidate = internalMutation({
    args: {
        ts: v.string(),
        action: v.string(),
        noteId: v.optional(v.string()),
        details: v.optional(v.string()),
    },
    handler: async (ctx, a) => {
        const id = await ctx.db.insert("gcActions", {
            ts: a.ts,
            action: a.action,
            noteId: a.noteId,
            details: a.details,
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

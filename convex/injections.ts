import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const recordInjection = internalMutation({
    args: {
        ts: v.string(),
        sessionId: v.optional(v.string()),
        path: v.optional(v.string()),
        toolName: v.optional(v.string()),
        noteId: v.optional(v.string()),
        accepted: v.boolean(),
        reason: v.optional(v.string()),
    },
    handler: async (ctx, a) => ctx.db.insert("injections", a),
});

// Atomic injection record + (optional) note inject-count bump.
// Replaces the previous /sync/injection two-mutation handler so a crash
// between the insert and the bump can't leave the note's injectCount
// out of sync with the injections table.
export const recordWithBump = internalMutation({
    args: {
        ts: v.string(),
        sessionId: v.optional(v.string()),
        path: v.optional(v.string()),
        toolName: v.optional(v.string()),
        noteId: v.optional(v.string()),
        accepted: v.boolean(),
        reason: v.optional(v.string()),
    },
    handler: async (ctx, a) => {
        const id = await ctx.db.insert("injections", {
            ts: a.ts,
            sessionId: a.sessionId,
            path: a.path,
            toolName: a.toolName,
            noteId: a.noteId,
            accepted: a.accepted,
            reason: a.reason,
        });
        if (a.noteId && a.accepted) {
            const n = await ctx.db
                .query("notes")
                .withIndex("by_note_id", (q) => q.eq("noteId", a.noteId!))
                .first();
            if (n) {
                await ctx.db.patch(n._id, {
                    injectCount: (n.injectCount ?? 0) + 1,
                    lastInjectedAt: a.ts,
                });
            }
        }
        return id;
    },
});

export const recent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        return await ctx.db.query("injections").order("desc").take(limit ?? 50);
    },
});

export const recentStats = query({
    args: { sinceMinutes: v.optional(v.number()) },
    handler: async (ctx, { sinceMinutes }) => {
        const cutoff = new Date(
            Date.now() - (sinceMinutes ?? 15) * 60 * 1000
        ).toISOString();
        const rows = await ctx.db
            .query("injections")
            .withIndex("by_ts", (q) => q.gte("ts", cutoff))
            .collect();
        return {
            sinceMinutes: sinceMinutes ?? 15,
            total: rows.length,
            accepted: rows.filter((r) => r.accepted).length,
            rejected: rows.filter((r) => !r.accepted).length,
        };
    },
});

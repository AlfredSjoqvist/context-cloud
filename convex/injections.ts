import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordInjection = mutation({
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

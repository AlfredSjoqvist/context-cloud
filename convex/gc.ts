import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordAction = mutation({
    args: {
        ts: v.string(),
        action: v.string(),
        noteId: v.optional(v.string()),
        details: v.optional(v.string()),
    },
    handler: async (ctx, a) => ctx.db.insert("gcActions", a),
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

import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const recordHurdle = internalMutation({
    args: {
        hurdleId: v.number(),
        sessionId: v.optional(v.string()),
        score: v.number(),
        signalsJson: v.optional(v.string()),
        resolved: v.boolean(),
        resolvedNoteId: v.optional(v.string()),
        createdAt: v.string(),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("hurdles")
            .withIndex("by_hurdle_id", (q) => q.eq("hurdleId", a.hurdleId))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, a);
            return existing._id;
        }
        return await ctx.db.insert("hurdles", a);
    },
});

export const recent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        return await ctx.db.query("hurdles").order("desc").take(limit ?? 50);
    },
});

// All hurdles for a specific session. Powers session-detail drill-down.
export const bySession = query({
    args: { sessionId: v.string(), limit: v.optional(v.number()) },
    handler: async (ctx, a) => {
        return await ctx.db
            .query("hurdles")
            .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
            .order("desc")
            .take(a.limit ?? 100);
    },
});

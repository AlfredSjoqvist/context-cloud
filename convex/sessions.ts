import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertSession = mutation({
    args: {
        sessionId: v.string(),
        agentVendor: v.optional(v.string()),
        cwd: v.optional(v.string()),
        projectRoot: v.optional(v.string()),
        startedAt: v.optional(v.string()),
        lastSeenAt: v.optional(v.string()),
        messageCount: v.optional(v.number()),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("sessions")
            .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                lastSeenAt: a.lastSeenAt ?? existing.lastSeenAt,
                messageCount: a.messageCount ?? existing.messageCount,
            });
            return existing._id;
        }
        return await ctx.db.insert("sessions", a);
    },
});

export const recent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        return await ctx.db.query("sessions").order("desc").take(limit ?? 20);
    },
});

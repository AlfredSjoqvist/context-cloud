// Users + agents tables — added by the dashboard agent so the polished mock UI
// (mock/index.html) can render org members and agent attribution from Convex.
//
// All mutations are idempotent upserts keyed on the string `userId` / `agentId`,
// so re-running the seed is safe.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ---- users ----

export const upsertUser = mutation({
    args: {
        userId: v.string(),
        name: v.string(),
        handle: v.string(),
        email: v.string(),
        role: v.string(),
        initial: v.string(),
        color: v.string(),
        joinedAt: v.string(),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", a.userId))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, a);
            return existing._id;
        }
        return await ctx.db.insert("users", a);
    },
});

export const listUsers = query({
    args: {},
    handler: async (ctx) => ctx.db.query("users").collect(),
});

// ---- agents ----

export const upsertAgent = mutation({
    args: {
        agentId: v.string(),
        userId: v.string(),
        vendor: v.string(),
        label: v.optional(v.string()),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("agents")
            .withIndex("by_agent_id", (q) => q.eq("agentId", a.agentId))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, a);
            return existing._id;
        }
        return await ctx.db.insert("agents", a);
    },
});

export const listAgents = query({
    args: {},
    handler: async (ctx) => ctx.db.query("agents").collect(),
});

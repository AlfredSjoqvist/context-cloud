import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const append = mutation({
  args: {
    cycleNumber: v.optional(v.number()),
    level: v.union(
      v.literal("info"),
      v.literal("warn"),
      v.literal("finding"),
      v.literal("action"),
    ),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      cycleNumber: args.cycleNumber,
      timestamp: Date.now(),
      level: args.level,
      message: args.message,
      metadata: args.metadata,
    });
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});

// All events for a specific cycle, ascending. Used by the Replay tab so
// the user can step through what Guardian did during a single run.
// Uses the by_cycle_timestamp compound index so it doesn't full-scan
// the events table.
export const forCycle = query({
  args: {
    cycleNumber: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    return await ctx.db
      .query("events")
      .withIndex("by_cycle_timestamp", (q) => q.eq("cycleNumber", args.cycleNumber))
      .take(limit);
  },
});

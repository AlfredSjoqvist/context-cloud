import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Internal mutation called from convex/crons.ts daily. Deletes events
// older than `retentionDays` days ago. Returns the number deleted.
// Bounded per-invocation by `maxDelete` so the cron never holds a
// transaction open long enough to time out on a backlog.
//
// NOTE: cutoff is computed AT FIRE TIME (inside the handler) rather
// than passed as a fixed cutoffMs arg from crons.ts. A cron's args are
// captured at module-load (deploy time) — a passed timestamp would
// freeze and the cron would always prune the same exact second
// regardless of when it fires.
export const pruneOlderThan = internalMutation({
    args: {
        retentionDays: v.number(),
        maxDelete: v.optional(v.number()),
    },
    handler: async (ctx, a) => {
        const cap = a.maxDelete ?? 1000;
        const cutoffMs = Date.now() - a.retentionDays * 24 * 60 * 60 * 1000;
        const rows = await ctx.db
            .query("events")
            .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffMs))
            .take(cap);
        for (const r of rows) {
            await ctx.db.delete(r._id);
        }
        return { deleted: rows.length, hitCap: rows.length === cap, cutoffMs };
    },
});

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

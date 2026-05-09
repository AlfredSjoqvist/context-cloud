import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const openCycle = mutation({
  args: { cycleNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("cycles", {
      cycleNumber: args.cycleNumber,
      startedAt: Date.now(),
      status: "running",
      plannedFiles: [],
    });
  },
});

export const setPlan = mutation({
  args: {
    cycleId: v.id("cycles"),
    plannedFiles: v.array(
      v.object({ path: v.string(), reason: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cycleId, { plannedFiles: args.plannedFiles });
  },
});

export const closeCycle = mutation({
  args: {
    cycleId: v.id("cycles"),
    status: v.union(v.literal("done"), v.literal("failed")),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cycleId, {
      status: args.status,
      finishedAt: Date.now(),
      summary: args.summary,
    });
  },
});

export const latestCycle = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("cycles")
      .withIndex("by_cycle_number")
      .order("desc")
      .first();
  },
});

export const nextCycleNumber = query({
  args: {},
  handler: async (ctx) => {
    const last = await ctx.db
      .query("cycles")
      .withIndex("by_cycle_number")
      .order("desc")
      .first();
    return (last?.cycleNumber ?? 0) + 1;
  },
});

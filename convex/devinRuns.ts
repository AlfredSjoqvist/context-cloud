import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const wipeAll = mutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for await (const r of ctx.db.query("devinRuns")) {
      await ctx.db.delete(r._id);
      n++;
    }
    return n;
  },
});

export const recordRun = mutation({
  args: {
    findingId: v.id("findings"),
    devinRunId: v.string(),
    promptUsed: v.string(),
    iteration: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("devinRuns", {
      findingId: args.findingId,
      devinRunId: args.devinRunId,
      promptUsed: args.promptUsed,
      spawnedAt: Date.now(),
      iteration: args.iteration,
    });
  },
});

export const linkPR = mutation({
  args: {
    runId: v.id("devinRuns"),
    prNumber: v.number(),
    prUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      prNumber: args.prNumber,
      prUrl: args.prUrl,
    });
  },
});

export const markOutcome = mutation({
  args: {
    runId: v.id("devinRuns"),
    outcome: v.string(),
    prMergedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { outcome: args.outcome };
    if (args.prMergedAt !== undefined) patch.prMergedAt = args.prMergedAt;
    await ctx.db.patch(args.runId, patch);
  },
});

export const byFinding = query({
  args: { findingId: v.id("findings") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("devinRuns")
      .withIndex("by_finding", (q) => q.eq("findingId", args.findingId))
      .collect();
  },
});

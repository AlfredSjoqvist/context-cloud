import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Idempotent on devinRunId (Devin's external unique run identifier). If
// the agent's request to spawn-and-record races a retry — common when
// Devin's API returns a 5xx mid-call — both retries see the same final
// devinRunId and we patch rather than insert a duplicate row.
export const recordRun = mutation({
  args: {
    findingId: v.id("findings"),
    devinRunId: v.string(),
    promptUsed: v.string(),
    iteration: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("devinRuns")
      .withIndex("by_devin_run_id", (q) => q.eq("devinRunId", args.devinRunId))
      .first();
    if (existing) {
      // Re-spawning a sharpened iteration: bump the iteration count and
      // refresh the prompt. Don't reset spawnedAt — keep the first-spawn
      // timestamp so the dashboard timeline stays accurate.
      await ctx.db.patch(existing._id, {
        promptUsed: args.promptUsed,
        iteration: args.iteration,
      });
      return existing._id;
    }
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

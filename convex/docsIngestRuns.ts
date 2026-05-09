import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordRun = mutation({
  args: {
    runId: v.string(),
    lib: v.string(),
    topic: v.string(),
    sourceUri: v.string(),
    sourceUrl: v.optional(v.string()),
    ruleCount: v.number(),
    appliesTo: v.array(v.string()),
    leafPath: v.string(),
    extractor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("docsIngestRuns", {
      runId: args.runId,
      lib: args.lib,
      topic: args.topic,
      sourceUri: args.sourceUri,
      sourceUrl: args.sourceUrl,
      ruleCount: args.ruleCount,
      appliesTo: args.appliesTo,
      leafPath: args.leafPath,
      extractor: args.extractor,
    });
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const rows = await ctx.db
      .query("docsIngestRuns")
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});

// Leaves whose `appliesTo` array contains the given file path. Used by the
// Guardian analyzer to pull constraint context from docs-ingest output.
// Full-scan-then-filter is fine at our scale (tens of leaves).
export const leavesForPath = query({
  args: { path: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("docsIngestRuns").collect();
    const matching = all.filter((l) => l.appliesTo.includes(args.path));
    return matching.slice(0, args.limit ?? 8);
  },
});

export const listAllLeaves = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    return await ctx.db.query("docsIngestRuns").take(limit);
  },
});

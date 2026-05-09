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

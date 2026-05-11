import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createIfAbsent = mutation({
  args: {
    fingerprint: v.string(),
    cycleDetected: v.number(),
    severity: v.string(),
    category: v.string(),
    path: v.string(),
    codeCite: v.object({
      line: v.number(),
      excerpt: v.string(),
    }),
    constraintCite: v.object({
      mdFile: v.string(),
      line: v.number(),
      text: v.string(),
    }),
    reasoning: v.string(),
    suggestedFixDirection: v.string(),
    // Provenance: which NM notes + docs leaves informed this finding.
    // Optional — Guardian only attaches it when the analyzer had extras
    // wired in (post-merge of NM + docs-ingest).
    usedContext: v.optional(v.object({
      noteIds: v.array(v.string()),
      docsLeafIds: v.array(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("findings")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .first();
    if (existing) {
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert("findings", {
      ...args,
      status: "detected",
      sharpenIterations: 0,
    });
    return { id, created: true };
  },
});

export const setStatus = mutation({
  args: {
    findingId: v.id("findings"),
    status: v.union(
      v.literal("detected"),
      v.literal("devin_running"),
      v.literal("pr_open"),
      v.literal("verifying"),
      v.literal("resolved"),
      v.literal("reopened_sharpened"),
      v.literal("escalated"),
    ),
    githubIssueNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.githubIssueNumber !== undefined) {
      patch.githubIssueNumber = args.githubIssueNumber;
    }
    await ctx.db.patch(args.findingId, patch);
  },
});

// NON-idempotent — retries double-bump. Prefer setSharpenIterations
// when the caller can compute the target value.
export const incrementSharpen = mutation({
  args: { findingId: v.id("findings") },
  handler: async (ctx, args) => {
    const f = await ctx.db.get(args.findingId);
    if (!f) throw new Error("finding not found");
    await ctx.db.patch(args.findingId, {
      sharpenIterations: f.sharpenIterations + 1,
    });
  },
});

// Idempotent-by-value: pass the target sharpenIterations count. Safe to
// retry on transient network failures because re-applying the same
// target is a no-op rather than a double-increment.
export const setSharpenIterations = mutation({
  args: {
    findingId: v.id("findings"),
    iterations: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.findingId, {
      sharpenIterations: args.iterations,
    });
  },
});

export const byStatus = query({
  args: {
    status: v.union(
      v.literal("detected"),
      v.literal("devin_running"),
      v.literal("pr_open"),
      v.literal("verifying"),
      v.literal("resolved"),
      v.literal("reopened_sharpened"),
      v.literal("escalated"),
    ),
    // Cap large status buckets so a single query can't time out as
    // resolved/escalated findings accumulate. Newest-first.
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("findings")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 500);
  },
});

// Single-finding drill-down: row + every Devin run spawned for it +
// events from its detection cycle. Lets the Guardian detail panel
// render in one round-trip.
export const detail = query({
  args: {
    findingId: v.id("findings"),
    eventsLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const finding = await ctx.db.get(args.findingId);
    if (!finding) return null;
    const [runs, events] = await Promise.all([
      ctx.db
        .query("devinRuns")
        .withIndex("by_finding", (q) => q.eq("findingId", args.findingId))
        .collect(),
      // events scoped to the detection cycle, capped by eventsLimit
      ctx.db
        .query("events")
        .withIndex("by_cycle_timestamp", (q) =>
          q.eq("cycleNumber", finding.cycleDetected),
        )
        .take(args.eventsLimit ?? 100),
    ]);
    runs.sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));
    return { finding, runs, events };
  },
});

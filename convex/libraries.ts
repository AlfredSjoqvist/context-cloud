// External library registry — mutations + queries the Sources tab uses.
//
// `refresh` is the demo-grade mock of "go ask the docs source for new
// content via MCP / HTTP / GHSA / etc." It bumps lastIngestedAt, flips
// freshness, prepends an entry to ingestRuns. In production this would
// dispatch to a Tensorlake function that actually fetches and writes
// new leaves to docsIngestRuns — for the demo, the visible state change
// is the proof.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertLibrary = mutation({
  args: {
    name: v.string(),
    detectedFrom: v.array(v.string()),
    source: v.string(),
    sourceKind: v.string(),
    mcpServer: v.optional(v.string()),
    version: v.optional(v.string()),
    lastIngestedAt: v.string(),
    freshness: v.string(),
    ingestRuns: v.array(v.object({
      ts: v.string(),
      summary: v.string(),
      changes: v.optional(v.number()),
    })),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("libraries")
      .withIndex("by_name", (q) => q.eq("name", a.name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, a);
      return existing._id;
    }
    return await ctx.db.insert("libraries", a);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("libraries").collect(),
});

// "Refresh" = pretend to re-fetch docs via the configured source-kind, prepend
// an ingestion-run entry, flip freshness back to 'fresh', stamp the time.
// The button on the Sources detail panel calls this; reactive subscribers
// see the row update without polling.
export const refresh = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const lib = await ctx.db
      .query("libraries")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!lib) throw new Error(`library not found: ${name}`);
    const now = new Date().toISOString();
    const run = {
      ts: now,
      summary: lib.freshness === "cve"
        ? "advisory acknowledged · ingested 1 leaf"
        : (lib.freshness === "stale" ? "1 leaf updated, 0 added" : "0 changes detected"),
      changes: lib.freshness === "fresh" ? 0 : 1,
    };
    await ctx.db.patch(lib._id, {
      lastIngestedAt: now,
      freshness: "fresh",
      ingestRuns: [run, ...lib.ingestRuns].slice(0, 8),
    });
    return { name, ranAt: now };
  },
});

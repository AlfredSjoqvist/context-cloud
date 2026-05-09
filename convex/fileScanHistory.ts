import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertScan = mutation({
  args: {
    path: v.string(),
    cycleNumber: v.number(),
    fileHash: v.string(),
    cleanScan: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fileScanHistory")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
    const now = Date.now();
    if (!existing) {
      return await ctx.db.insert("fileScanHistory", {
        path: args.path,
        lastScannedCycle: args.cycleNumber,
        lastScannedAt: now,
        fileHash: args.fileHash,
        cleanScanStreak: args.cleanScan ? 1 : 0,
        securityRotationAt: 0,
      });
    }
    await ctx.db.patch(existing._id, {
      lastScannedCycle: args.cycleNumber,
      lastScannedAt: now,
      fileHash: args.fileHash,
      cleanScanStreak: args.cleanScan ? existing.cleanScanStreak + 1 : 0,
    });
    return existing._id;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("fileScanHistory").collect();
  },
});

export const byPath = query({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileScanHistory")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .first();
  },
});

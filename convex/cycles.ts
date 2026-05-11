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

// Race-safe replacement for `nextCycleNumber()` + `openCycle()` pattern.
// The two-call dance races: two agents calling nextCycleNumber concurrently
// can both receive N+1 and then both insert a cycle with that number. This
// single mutation reads the last cycle and inserts the next one in one
// Convex transaction — guaranteed to produce a unique increasing
// cycleNumber per call. Returns { cycleId, cycleNumber }.
//
// Agent code can migrate at its own pace; nextCycleNumber + openCycle stay
// public so existing call sites keep working.
export const openNextCycle = mutation({
  args: {},
  handler: async (ctx) => {
    const last = await ctx.db
      .query("cycles")
      .withIndex("by_cycle_number")
      .order("desc")
      .first();
    const cycleNumber = (last?.cycleNumber ?? 0) + 1;
    const cycleId = await ctx.db.insert("cycles", {
      cycleNumber,
      startedAt: Date.now(),
      status: "running",
      plannedFiles: [],
    });
    return { cycleId, cycleNumber };
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

// Phase transitions during a running cycle. The state machine in the spec
// is WAKE → PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → RECONCILE → SLEEP.
// The dashboard reads cycles[].currentPhase to render the live phase
// indicator — without this mutation the field stays at whatever the cycle
// was inserted with (usually unset).
export const setPhase = mutation({
  args: {
    cycleId: v.id("cycles"),
    phase: v.union(
      v.literal("WAKE"),
      v.literal("PLAN"),
      v.literal("SCAN"),
      v.literal("ANALYZE"),
      v.literal("CRITIQUE"),
      v.literal("HANDOFF"),
      v.literal("RECONCILE"),
      v.literal("SLEEP"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cycleId, { currentPhase: args.phase });
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

// Recent cycles, newest-first. Standalone alternative to pulling them
// out of dashboard.everything (50 rows there) — Replay tab can poll
// this cheaply.
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("cycles")
      .withIndex("by_cycle_number")
      .order("desc")
      .take(limit ?? 30);
  },
});

// Single-cycle drill-down: cycle row + every event with that cycleNumber
// + every finding detected during it. One round-trip for the Replay
// detail panel.
export const detail = query({
  args: { cycleNumber: v.number() },
  handler: async (ctx, args) => {
    const cycle = await ctx.db
      .query("cycles")
      .withIndex("by_cycle_number", (q) => q.eq("cycleNumber", args.cycleNumber))
      .first();
    if (!cycle) return null;
    const [events, findings] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_cycle_timestamp", (q) =>
          q.eq("cycleNumber", args.cycleNumber),
        )
        .take(500),
      ctx.db
        .query("findings")
        .filter((q) => q.eq(q.field("cycleDetected"), args.cycleNumber))
        .collect(),
    ]);
    return { cycle, events, findings };
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
